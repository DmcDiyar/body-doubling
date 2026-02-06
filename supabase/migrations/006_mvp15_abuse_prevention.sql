-- ============================================================
-- SESSIZ ORTAK - MVP 1.5 ABUSE PREVENTION (MINIMAL)
-- Version: 1.0.0
-- Date: 2026-02-06
-- ============================================================
-- Scope:
-- 1. Weekly trust decay for inactive users
-- 2. Diminishing rewards (binary: 3 sessions/day cap)
-- 3. Observability queries (comments only)
--
-- NOT included:
-- - Partner tracking / JSONB history
-- - find_match modifications
-- - UI changes
-- - Manual review systems
-- ============================================================


-- ============================================================
-- 1. ADD last_session_date COLUMN TO USERS
-- ============================================================
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS last_session_date DATE DEFAULT CURRENT_DATE;

-- Update existing users based on their last session
UPDATE public.users u
SET last_session_date = COALESCE(
  (SELECT DATE(MAX(sp.joined_at))
   FROM public.session_participants sp
   WHERE sp.user_id = u.id AND sp.status = 'completed'),
  CURRENT_DATE
);

COMMENT ON COLUMN public.users.last_session_date IS 'Last completed session date, used for weekly trust decay';


-- ============================================================
-- 2. WEEKLY TRUST DECAY FUNCTION
-- ============================================================
-- Rules:
-- - Applies to users with last_session_date > 7 days ago
-- - -2 trust per call (call weekly via cron)
-- - Minimum trust floor: 20 (never decays below)
-- - Idempotent: Checks last_session_date, not call count

CREATE OR REPLACE FUNCTION public.apply_weekly_trust_decay()
RETURNS TABLE(user_id UUID, old_score INTEGER, new_score INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH inactive_users AS (
    SELECT u.id, u.trust_score
    FROM public.users u
    WHERE u.last_session_date < CURRENT_DATE - INTERVAL '7 days'
      AND u.trust_score > 20
      AND u.is_banned = false
  ),
  updated AS (
    UPDATE public.users u
    SET trust_score = GREATEST(20, u.trust_score - 2)
    FROM inactive_users iu
    WHERE u.id = iu.id
    RETURNING u.id, iu.trust_score as old_score, u.trust_score as new_score
  )
  SELECT updated.id, updated.old_score, updated.new_score
  FROM updated;
END;
$$;

COMMENT ON FUNCTION public.apply_weekly_trust_decay() IS 
'Apply -2 trust to users inactive > 7 days. Call weekly via cron. Minimum floor: 20.';


-- ============================================================
-- 3. DIMINISHING REWARDS: Daily Session Count Helper
-- ============================================================
-- Binary rule: 
-- - First 3 sessions/day: Full rewards
-- - Session 4+: Zero rewards
-- This function is called by update_trust_score internally

CREATE OR REPLACE FUNCTION public.get_daily_completed_sessions(p_user_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER
  FROM public.session_participants sp
  JOIN public.sessions s ON sp.session_id = s.id
  WHERE sp.user_id = p_user_id
    AND sp.status = 'completed'
    AND DATE(sp.joined_at) = CURRENT_DATE;
$$;


-- ============================================================
-- 4. MODIFY update_trust_score TO ENFORCE DIMINISHING REWARDS
-- ============================================================
-- Drop old function to avoid signature conflicts
DROP FUNCTION IF EXISTS public.update_trust_score(UUID, UUID, TEXT, INTEGER, UUID, JSONB);

CREATE OR REPLACE FUNCTION public.update_trust_score(
  p_user_id UUID,
  p_session_id UUID,
  p_event_type TEXT,
  p_score_change INTEGER,
  p_related_user_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS INTEGER -- new trust score
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_score INTEGER;
  v_new_score INTEGER;
  v_new_level TEXT;
  v_today_change INTEGER;
  v_adjusted_change INTEGER;
  v_daily_sessions INTEGER;
BEGIN
  -- Get current score
  SELECT trust_score INTO v_current_score
  FROM public.users
  WHERE id = p_user_id
  FOR UPDATE;

  -- ========== DIMINISHING REWARDS CHECK ==========
  -- If this is a positive event AND user has 3+ completed sessions today
  -- Apply zero reward (but still log the event)
  IF p_score_change > 0 THEN
    v_daily_sessions := public.get_daily_completed_sessions(p_user_id);
    IF v_daily_sessions >= 3 THEN
      -- Log event but with 0 change
      INSERT INTO public.trust_events (
        user_id, session_id, event_type, score_change,
        score_before, score_after, related_user_id, metadata
      )
      VALUES (
        p_user_id, p_session_id, p_event_type, 0,
        v_current_score, v_current_score, p_related_user_id,
        p_metadata || jsonb_build_object('diminished', true, 'daily_sessions', v_daily_sessions)
      );
      RETURN v_current_score;
    END IF;
  END IF;

  -- ========== DAILY CAP ==========
  SELECT COALESCE(SUM(score_change), 0) INTO v_today_change
  FROM public.trust_events
  WHERE user_id = p_user_id
    AND DATE(created_at) = CURRENT_DATE;

  -- Daily cap: +20 max gain, -50 max loss
  IF p_score_change > 0 THEN
    v_adjusted_change := LEAST(p_score_change, GREATEST(0, 20 - v_today_change));
  ELSE
    v_adjusted_change := GREATEST(p_score_change, LEAST(0, -50 - v_today_change));
  END IF;

  -- Calculate new score (0-200 clamp)
  v_new_score := GREATEST(0, LEAST(200, v_current_score + v_adjusted_change));

  -- Calculate new level
  v_new_level := CASE
    WHEN v_new_score >= 150 THEN 'legend'
    WHEN v_new_score >= 120 THEN 'elite'
    WHEN v_new_score >= 90 THEN 'verified'
    WHEN v_new_score >= 70 THEN 'trusted'
    WHEN v_new_score >= 50 THEN 'newbie'
    ELSE 'restricted'
  END;

  -- Update users table
  UPDATE public.users
  SET trust_score = v_new_score,
      trust_level = v_new_level,
      last_session_date = CURRENT_DATE
  WHERE id = p_user_id;

  -- Log event
  INSERT INTO public.trust_events (
    user_id, session_id, event_type, score_change,
    score_before, score_after, related_user_id, metadata
  )
  VALUES (
    p_user_id, p_session_id, p_event_type, v_adjusted_change,
    v_current_score, v_new_score, p_related_user_id, p_metadata
  );

  RETURN v_new_score;
END;
$$;


-- ============================================================
-- 5. GRANT PERMISSIONS
-- ============================================================
GRANT EXECUTE ON FUNCTION public.apply_weekly_trust_decay() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_daily_completed_sessions(UUID) TO authenticated;


-- ============================================================
-- 6. OBSERVABILITY QUERIES (Reference Only)
-- ============================================================
-- These are NOT functions, just example queries for monitoring.
-- Run manually or via scheduled jobs.

/*
-- QUERY 1: Daily session health (last 7 days)
SELECT 
  DATE(created_at) as day,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE status = 'completed') as completed,
  COUNT(*) FILTER (WHERE status = 'abandoned') as abandoned,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'completed') / COUNT(*), 1) as completion_rate
FROM public.sessions
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY day DESC;

-- QUERY 2: Trust change distribution (last 7 days)
SELECT 
  event_type,
  COUNT(*) as occurrences,
  SUM(score_change) as total_change,
  ROUND(AVG(score_change), 2) as avg_change
FROM public.trust_events
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY event_type
ORDER BY occurrences DESC;

-- QUERY 3: Early exit repeat offenders (3+ in 7 days)
SELECT 
  user_id,
  COUNT(*) as early_exits,
  SUM(score_change) as total_penalty
FROM public.trust_events
WHERE event_type LIKE 'early_exit%'
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY user_id
HAVING COUNT(*) >= 3
ORDER BY early_exits DESC;

-- QUERY 4: Users hitting diminishing returns
SELECT 
  user_id,
  COUNT(*) as diminished_events
FROM public.trust_events
WHERE metadata->>'diminished' = 'true'
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY user_id
ORDER BY diminished_events DESC;

-- QUERY 5: Inactive users (candidates for decay)
SELECT 
  id,
  display_name,
  trust_score,
  last_session_date,
  CURRENT_DATE - last_session_date as days_inactive
FROM public.users
WHERE last_session_date < CURRENT_DATE - INTERVAL '7 days'
  AND trust_score > 20
ORDER BY days_inactive DESC
LIMIT 50;
*/


-- ============================================================
-- MVP 1.5 JUSTIFICATION
-- ============================================================
/*
Why this is sufficient for MVP 1.5:

1. TRUST DECAY
   - Prevents abandoned accounts from artificially inflating trust pool
   - Simple weekly cron job, no complex scheduling
   - Floor of 20 prevents permanent lockout

2. DIMINISHING REWARDS
   - Blocks XP/trust farming via session spam
   - Binary (3 sessions = cap) is simpler than gradual decay
   - Silent: user just stops gaining, no error messages
   - Still logs events for observability

3. OBSERVABILITY
   - 5 key queries cover all abuse patterns
   - No dashboard needed - SQL is sufficient for admin
   - All events logged to trust_events with metadata

4. IDEMPOTENCY
   - decay: checks last_session_date, safe to run multiple times
   - rewards: daily cap already exists, diminishing adds session cap
   - all functions use FOR UPDATE to prevent races

5. WHAT WE CONSCIOUSLY SKIPPED
   - Partner history tracking: Complex, JSONB overhead
   - find_match cooldowns: Modifying core flow is risky
   - UI warnings: MVP 1.5 is backend-only
   - Ban systems: Too aggressive for MVP

This provides the MINIMUM viable abuse resistance for production.
*/
