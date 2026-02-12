-- ============================================================
-- 025: AYNAM AUDIT FIXES
-- Fixes all bugs found during the deep system audit
-- Date: 2026-02-11
-- ============================================================
-- BUG-1: Quest weekly_streak_3 references non-existent 'streak' column
-- BUG-2: Trust double-write (RPC + trigger both fire)
-- BUG-3: Early exit penalty logic inverted
-- SYNC: Sessions duration constraint missing 90
-- SYNC: complete_solo_session should update user_limits
-- FIX: Completion rate always 100% for solo users
-- FIX: Enhanced stats city_contributions references deleted system
-- ============================================================


-- ============================================================
-- BUG-1 FIX: QUEST SYSTEM — 'streak' → 'current_streak'
-- The weekly_streak_3 handler queried a non-existent column,
-- causing ALL quest processing to fail silently.
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_weekly_quest(
  p_user_id UUID,
  p_session_metadata JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_metadata JSONB;
  v_quest JSONB;
  v_quest_id TEXT;
  v_progress INT;
  v_target INT;
  v_completed BOOL;
  v_week_index INT;
  v_result JSONB := '{"completed": false}'::JSONB;
  v_weekly_quests TEXT[] := ARRAY['weekly_streak_3', 'weekly_sessions_5', 'weekly_duration_mix'];
  v_weekly_targets INT[] := ARRAY[3, 5, 2];
  v_current_week DATE := date_trunc('week', CURRENT_DATE)::DATE;
  v_user_streak INT;
BEGIN
  SELECT metadata INTO v_metadata FROM users WHERE id = p_user_id FOR UPDATE;
  v_quest := v_metadata->'quests'->'weekly';

  -- Check week change
  IF (v_quest->>'week_start')::DATE < v_current_week THEN
    IF (v_quest->>'completed')::BOOL THEN
      v_week_index := ((v_quest->>'week_index')::INT + 1) % 3;
      v_quest := jsonb_build_object(
        'id', v_weekly_quests[v_week_index + 1],
        'progress', 0,
        'target', v_weekly_targets[v_week_index + 1],
        'completed', false,
        'week_index', v_week_index,
        'week_start', v_current_week::TEXT
      );
    ELSE
      v_quest := v_quest || jsonb_build_object('week_start', v_current_week::TEXT);
    END IF;
  END IF;

  v_quest_id := v_quest->>'id';
  v_progress := (v_quest->>'progress')::INT;
  v_target := (v_quest->>'target')::INT;
  v_completed := (v_quest->>'completed')::BOOL;

  IF v_completed THEN RETURN v_result; END IF;

  -- Check quest conditions
  CASE v_quest_id
    WHEN 'weekly_streak_3' THEN
      -- FIX: was 'streak' (non-existent), now 'current_streak'
      SELECT current_streak INTO v_user_streak FROM users WHERE id = p_user_id;
      IF v_user_streak > v_progress THEN
        v_progress := LEAST(v_user_streak, v_target);
      END IF;
    WHEN 'weekly_sessions_5' THEN
      v_progress := v_progress + 1;
    WHEN 'weekly_duration_mix' THEN
      v_progress := LEAST(v_progress + 1, v_target);
  END CASE;

  v_quest := v_quest || jsonb_build_object('progress', v_progress);

  IF v_progress >= v_target AND NOT v_completed THEN
    v_quest := v_quest || jsonb_build_object('completed', true);
    v_result := jsonb_build_object(
      'completed', true,
      'quest_id', v_quest_id,
      'reward_xp', 15,
      'reward_trust', 1
    );
    UPDATE users SET xp = xp + 15 WHERE id = p_user_id;
    PERFORM update_trust_score(p_user_id, NULL, 'quest_weekly', 1);
  END IF;

  v_metadata := jsonb_set(v_metadata, '{quests,weekly}', v_quest);
  UPDATE users SET metadata = v_metadata WHERE id = p_user_id;

  RETURN v_result;
END;
$$;


-- ============================================================
-- BUG-2 FIX: REMOVE TRUST DOUBLE-WRITE TRIGGER
-- complete_solo_session RPC already calls update_trust_score.
-- The trigger_session_completion also fires on status='completed',
-- causing trust to be awarded TWICE per session.
-- Solution: Drop the trigger. The RPC is the single source of truth.
-- ============================================================

DROP TRIGGER IF EXISTS on_session_status_change ON public.sessions;
DROP FUNCTION IF EXISTS public.trigger_session_completion();


-- ============================================================
-- BUG-3 FIX: EARLY EXIT PENALTY — INVERT LOGIC
-- Old: leaving at 80% = severe (-15), leaving at 5% = mild (-4)
-- New: leaving at 5% = severe (-15), leaving at 80% = mild (-4)
-- Someone who almost finished deserves less penalty.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_early_exit(
  p_session_id UUID,
  p_user_id UUID,
  p_elapsed_minutes INTEGER,
  p_total_duration INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_percent_complete FLOAT;
  v_event_type TEXT;
  v_penalty INTEGER;
BEGIN
  v_percent_complete := p_elapsed_minutes::FLOAT / p_total_duration;

  -- FIXED: Inverted logic — early exit = harsh, late exit = mild
  IF v_percent_complete >= 0.6 THEN
    -- %60+ tamamlanmis: Neredeyse bitmisti, hafif ceza
    v_event_type := 'early_exit_mild';
    v_penalty := -4;
  ELSIF v_percent_complete >= 0.2 THEN
    -- %20-60: Orta ceza
    v_event_type := 'early_exit_moderate';
    v_penalty := -8;
  ELSE
    -- <%20: Neredeyse hic calismamis, agir ceza
    v_event_type := 'early_exit_severe';
    v_penalty := -15;
  END IF;

  PERFORM public.update_trust_score(
    p_user_id,
    p_session_id,
    v_event_type,
    v_penalty,
    NULL,
    jsonb_build_object(
      'elapsed_minutes', p_elapsed_minutes,
      'total_duration', p_total_duration,
      'percent_complete', v_percent_complete
    )
  );

  UPDATE public.session_participants
  SET status = 'left_early',
      left_at = NOW(),
      trust_score_change = v_penalty
  WHERE session_id = p_session_id AND user_id = p_user_id;

  RETURN v_penalty;
END;
$$;


-- ============================================================
-- SYNC FIX: ADD 90-minute DURATION + 'preparing'/'expired' STATUS
-- Initial schema only had CHECK (duration IN (15, 25, 50))
-- and status IN ('waiting', 'active', 'completed', 'abandoned')
-- ============================================================

ALTER TABLE public.sessions DROP CONSTRAINT IF EXISTS sessions_duration_check;
ALTER TABLE public.sessions ADD CONSTRAINT sessions_duration_check
  CHECK (duration IN (15, 25, 50, 90));

ALTER TABLE public.sessions DROP CONSTRAINT IF EXISTS sessions_status_check;
ALTER TABLE public.sessions ADD CONSTRAINT sessions_status_check
  CHECK (status IN ('waiting', 'preparing', 'active', 'completed', 'abandoned', 'expired'));

-- Also add 'joined' to participant status if missing
ALTER TABLE public.session_participants DROP CONSTRAINT IF EXISTS session_participants_status_check;
ALTER TABLE public.session_participants ADD CONSTRAINT session_participants_status_check
  CHECK (status IN ('waiting', 'joined', 'active', 'completed', 'left_early', 'no_show'));


-- ============================================================
-- SYNC FIX: complete_solo_session — UPDATE user_limits
-- The old version never updated user_limits, so daily limit
-- counter always showed 0.
-- Also fix XP level formula to match frontend.
-- ============================================================

CREATE OR REPLACE FUNCTION public.complete_solo_session(
  p_session_id UUID,
  p_user_id UUID,
  p_goal_completed BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session RECORD;
  v_xp_earned INTEGER := 0;
  v_trust_change INTEGER := 0;
  v_streak INTEGER;
  v_last_date DATE;
  v_today DATE := CURRENT_DATE;
  v_result JSONB;
  v_user_trust INTEGER;
  v_is_rehabilitation BOOLEAN := false;
  v_new_xp INTEGER;
BEGIN
  -- Session bilgisini al
  SELECT * INTO v_session FROM public.sessions WHERE id = p_session_id;
  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Session not found';
  END IF;

  -- Trust kontrol
  SELECT trust_score INTO v_user_trust FROM public.users WHERE id = p_user_id;

  IF v_user_trust < 50 THEN
    v_trust_change := 5;
    v_is_rehabilitation := true;
  ELSE
    v_trust_change := 2;
  END IF;

  -- Base XP
  v_xp_earned := 40;
  IF p_goal_completed THEN
    v_xp_earned := v_xp_earned + 10;
  END IF;

  -- Streak hesapla
  SELECT current_streak, last_session_date INTO v_streak, v_last_date
  FROM public.users WHERE id = p_user_id;

  IF v_last_date = v_today THEN
    NULL; -- Bugün zaten seans yapmış
  ELSIF v_last_date = v_today - 1 THEN
    v_streak := v_streak + 1;
  ELSE
    v_streak := 1;
  END IF;

  -- Kullanıcıyı güncelle (FIXED: level formula = 1 + xp/100)
  SELECT xp + v_xp_earned INTO v_new_xp FROM public.users WHERE id = p_user_id;

  UPDATE public.users
  SET
    xp = v_new_xp,
    level = 1 + v_new_xp / 100,
    total_sessions = total_sessions + 1,
    completed_sessions = completed_sessions + 1,
    total_minutes = total_minutes + v_session.duration,
    current_streak = v_streak,
    longest_streak = GREATEST(longest_streak, v_streak),
    last_session_date = v_today,
    last_active_at = NOW()
  WHERE id = p_user_id;

  -- Trust güncelle (single source — trigger removed)
  PERFORM public.update_trust_score(
    p_user_id,
    p_session_id,
    CASE WHEN v_is_rehabilitation THEN 'solo_session_completed' ELSE 'session_completed' END,
    v_trust_change,
    NULL,
    jsonb_build_object('rehabilitation', v_is_rehabilitation)
  );

  -- Session tamamla
  UPDATE public.sessions
  SET status = 'completed', ended_at = NOW()
  WHERE id = p_session_id;

  UPDATE public.session_participants
  SET status = 'completed', left_at = NOW(),
      xp_earned = v_xp_earned,
      trust_score_change = v_trust_change,
      goal_completed = p_goal_completed
  WHERE session_id = p_session_id AND user_id = p_user_id;

  -- FIX: Update user_limits (daily session counter)
  INSERT INTO public.user_limits (user_id, date, sessions_used, max_sessions)
  VALUES (p_user_id, v_today, 1, 3)
  ON CONFLICT (user_id, date)
  DO UPDATE SET sessions_used = user_limits.sessions_used + 1;

  v_result := jsonb_build_object(
    'xp_earned', v_xp_earned,
    'trust_change', v_trust_change,
    'new_streak', v_streak,
    'rehabilitation', v_is_rehabilitation
  );

  RETURN v_result;
END;
$$;


-- ============================================================
-- FIX: get_enhanced_stats — real completion rate + remove city
-- Old: completion_rate = completed/total (always 100% for solo)
-- New: counts abandoned sessions separately for real rate
-- Removed: city_contributions (system deleted)
-- ============================================================

CREATE OR REPLACE FUNCTION get_enhanced_stats(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_started INT;
  v_completed INT;
  v_completion_rate FLOAT;
  v_best_hour INT;
  v_preferred_duration INT;
  v_longest_streak INT;
  v_current_streak INT;
  v_total_minutes INT;
  v_total_sessions INT;
  v_completed_sessions INT;
  v_avg_sessions_per_week FLOAT;
BEGIN
  -- User stats from profile
  SELECT total_sessions, completed_sessions, current_streak, longest_streak, total_minutes
  INTO v_total_sessions, v_completed_sessions, v_current_streak, v_longest_streak, v_total_minutes
  FROM users WHERE id = p_user_id;

  -- FIXED: Real completion rate — count ALL sessions user participated in
  -- (including abandoned/left_early), not just the completed counter
  SELECT COUNT(*) INTO v_total_started
  FROM session_participants sp
  WHERE sp.user_id = p_user_id
    AND sp.status IN ('completed', 'left_early', 'no_show');

  SELECT COUNT(*) INTO v_completed
  FROM session_participants sp
  WHERE sp.user_id = p_user_id
    AND sp.status = 'completed';

  IF COALESCE(v_total_started, 0) > 0 THEN
    v_completion_rate := ROUND((v_completed::FLOAT / v_total_started * 100)::NUMERIC, 1);
  ELSE
    v_completion_rate := 0;
  END IF;

  -- Best performance hour
  SELECT EXTRACT(HOUR FROM s.started_at)::INT INTO v_best_hour
  FROM session_participants sp
  JOIN sessions s ON s.id = sp.session_id
  WHERE sp.user_id = p_user_id
    AND sp.status = 'completed'
    AND s.started_at IS NOT NULL
  GROUP BY EXTRACT(HOUR FROM s.started_at)
  ORDER BY COUNT(*) DESC
  LIMIT 1;

  -- Preferred duration
  SELECT s.duration INTO v_preferred_duration
  FROM session_participants sp
  JOIN sessions s ON s.id = sp.session_id
  WHERE sp.user_id = p_user_id
    AND sp.status = 'completed'
  GROUP BY s.duration
  ORDER BY COUNT(*) DESC
  LIMIT 1;

  -- Average sessions per week (last 4 weeks)
  SELECT COALESCE(COUNT(*)::FLOAT / 4, 0) INTO v_avg_sessions_per_week
  FROM session_participants sp
  JOIN sessions s ON s.id = sp.session_id
  WHERE sp.user_id = p_user_id
    AND sp.status = 'completed'
    AND s.started_at >= NOW() - INTERVAL '28 days';

  RETURN jsonb_build_object(
    'completion_rate', COALESCE(v_completion_rate, 0),
    'best_hour', v_best_hour,
    'preferred_duration', v_preferred_duration,
    'current_streak', COALESCE(v_current_streak, 0),
    'longest_streak', COALESCE(v_longest_streak, 0),
    'total_minutes', COALESCE(v_total_minutes, 0),
    'total_sessions', COALESCE(v_total_sessions, 0),
    'completed_sessions', COALESCE(v_completed_sessions, 0),
    'avg_sessions_per_week', COALESCE(ROUND(v_avg_sessions_per_week::NUMERIC, 1), 0)
  );
END;
$$;


-- ============================================================
-- FIX: Add 'cooldown_skipped' and 'match_broken' to trust events
-- These exist in TypeScript types but not in DB constraint
-- ============================================================

ALTER TABLE public.trust_events
DROP CONSTRAINT IF EXISTS trust_events_event_type_check;

ALTER TABLE public.trust_events
ADD CONSTRAINT trust_events_event_type_check CHECK (event_type IN (
  'session_completed',
  'solo_session_completed',
  'partner_rated_5_stars',
  'partner_rated_4_stars',
  'partner_rated_1_star',
  'partner_rated_2_stars',
  'rating_5_star',
  'rating_4_star',
  'rating_1_star',
  'early_exit_mild',
  'early_exit_moderate',
  'early_exit_severe',
  'ghosting',
  'no_show',
  'reported_and_verified',
  'helpful_report',
  'quest_weekly',
  'quest_hidden',
  'cooldown_skipped',
  'match_broken'
));


-- ============================================================
-- Ensure user_limits has proper unique constraint for UPSERT
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_limits_user_date
  ON public.user_limits(user_id, date);


-- ============================================================
-- GRANT PERMISSIONS
-- ============================================================
GRANT EXECUTE ON FUNCTION public.update_weekly_quest(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_early_exit(UUID, UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_solo_session(UUID, UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_enhanced_stats(UUID) TO authenticated;
