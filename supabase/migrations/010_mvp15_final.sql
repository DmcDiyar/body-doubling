-- ============================================================
-- SESSIZ ORTAK - 010: MVP 1.5 FINAL CONSOLIDATION
-- Version: 2.0.0
-- Date: 2026-02-07
-- ============================================================
-- Prerequisites: 001-009 must be applied first
-- ============================================================
-- This migration fixes ALL schema gaps found during audit:
--   1. Missing metadata columns (users, session_participants)
--   2. CHECK constraint expansions (sessions, participants, duration, priority)
--   3. Analytics events table
--   4. Rejoin match function (missing from 008)
--   5. Cooldown skip penalty integration
--   6. Trust event type expansion
--   7. Cleanup/health-check functions
--   8. Realtime publication for matches
-- ============================================================


-- ============================================================
-- 1. ADD MISSING COLUMNS
-- ============================================================

-- users.metadata JSONB (quest state lives here)
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

COMMENT ON COLUMN public.users.metadata IS 'JSONB store for quest state, preferences, and feature flags';

-- session_participants.metadata JSONB (ritual + cooldown data lives here)
ALTER TABLE public.session_participants
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

COMMENT ON COLUMN public.session_participants.metadata IS 'JSONB store for ritual results, cooldown results, and session-specific data';


-- ============================================================
-- 2. EXPAND sessions.status CHECK
-- ============================================================
-- Old: ('waiting', 'active', 'completed', 'abandoned')
-- New: + 'preparing'

ALTER TABLE public.sessions
DROP CONSTRAINT IF EXISTS sessions_status_check;

ALTER TABLE public.sessions
ADD CONSTRAINT sessions_status_check
CHECK (status IN ('waiting', 'preparing', 'active', 'completed', 'abandoned'));


-- ============================================================
-- 3. EXPAND session_participants.status CHECK
-- ============================================================
-- Old: ('waiting', 'active', 'completed', 'left_early', 'no_show')
-- New: + 'joined'

ALTER TABLE public.session_participants
DROP CONSTRAINT IF EXISTS session_participants_status_check;

ALTER TABLE public.session_participants
ADD CONSTRAINT session_participants_status_check
CHECK (status IN ('waiting', 'joined', 'active', 'completed', 'left_early', 'no_show'));


-- ============================================================
-- 4. EXPAND sessions.duration CHECK
-- ============================================================
-- Old: (15, 25, 50)
-- New: + 90

ALTER TABLE public.sessions
DROP CONSTRAINT IF EXISTS sessions_duration_check;

ALTER TABLE public.sessions
ADD CONSTRAINT sessions_duration_check
CHECK (duration IN (15, 25, 50, 90));


-- ============================================================
-- 5. EXPAND matching_queue.duration CHECK
-- ============================================================

ALTER TABLE public.matching_queue
DROP CONSTRAINT IF EXISTS matching_queue_duration_check;

ALTER TABLE public.matching_queue
ADD CONSTRAINT matching_queue_duration_check
CHECK (duration IN (15, 25, 50, 90));


-- ============================================================
-- 6. EXPAND matching_queue.priority CHECK
-- ============================================================
-- Old: (0, 1, 2)
-- New: (0, 1, 2, 3) — 3 is high-priority requeue

ALTER TABLE public.matching_queue
DROP CONSTRAINT IF EXISTS matching_queue_priority_check;

ALTER TABLE public.matching_queue
ADD CONSTRAINT matching_queue_priority_check
CHECK (priority BETWEEN 0 AND 3);


-- ============================================================
-- 7. EXPAND trust_events event_type CHECK
-- ============================================================
-- Add: cooldown_skipped, quest_weekly, quest_hidden, match_broken

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
-- 8. ANALYTICS EVENTS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL,
  properties JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_event_name ON public.analytics_events(event_name, created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_user ON public.analytics_events(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_session ON public.analytics_events(session_id);

-- RLS: users can insert own events, service_role can read all
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own analytics"
  ON public.analytics_events FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can read own analytics"
  ON public.analytics_events FOR SELECT
  USING (user_id = auth.uid());

COMMENT ON TABLE public.analytics_events IS 'Analytics event log. Append-only. Used for observability and future AI pipeline.';


-- ============================================================
-- 9. LOG ANALYTICS EVENT FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION public.log_analytics_event(
  p_event_name TEXT,
  p_properties JSONB DEFAULT '{}',
  p_session_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.analytics_events (user_id, session_id, event_name, properties)
  VALUES (auth.uid(), p_session_id, p_event_name, p_properties);
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_analytics_event(TEXT, JSONB, UUID) TO authenticated;


-- ============================================================
-- 10. REJOIN MATCH FUNCTION (missing from 008)
-- ============================================================
-- Allows a user to rejoin a broken match within 3 minutes

CREATE OR REPLACE FUNCTION public.rejoin_match(
  p_match_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match RECORD;
  v_my_uid UUID := auth.uid();
  v_is_user_a BOOLEAN;
  v_broken_duration INTERVAL;
BEGIN
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id FOR UPDATE;

  IF v_match IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'match_not_found');
  END IF;

  -- Must be part of the match
  IF v_my_uid != v_match.user_a_id AND v_my_uid != v_match.user_b_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_in_match');
  END IF;

  -- Match must be broken (not completed or active)
  IF v_match.state != 'broken' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'match_not_broken');
  END IF;

  -- Check 3-minute window
  v_broken_duration := NOW() - v_match.updated_at;
  IF v_broken_duration > INTERVAL '3 minutes' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'rejoin_window_expired');
  END IF;

  -- Check that the session is still active or preparing
  IF NOT EXISTS (
    SELECT 1 FROM public.sessions
    WHERE id = v_match.session_id
      AND status IN ('preparing', 'active')
  ) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'session_ended');
  END IF;

  v_is_user_a := (v_my_uid = v_match.user_a_id);

  -- Update heartbeat and restore match state
  IF v_is_user_a THEN
    UPDATE public.matches
    SET state = 'active',
        user_a_last_heartbeat = NOW(),
        broken_reason = NULL
    WHERE id = p_match_id;
  ELSE
    UPDATE public.matches
    SET state = 'active',
        user_b_last_heartbeat = NOW(),
        broken_reason = NULL
    WHERE id = p_match_id;
  END IF;

  -- Log analytics event
  INSERT INTO public.analytics_events (user_id, session_id, event_name, properties)
  VALUES (v_my_uid, v_match.session_id, 'rejoin_success',
    jsonb_build_object('match_id', p_match_id, 'gap_seconds', EXTRACT(EPOCH FROM v_broken_duration)::INT)
  );

  RETURN jsonb_build_object('success', true, 'match_state', 'active');
END;
$$;

GRANT EXECUTE ON FUNCTION public.rejoin_match(UUID) TO authenticated;


-- ============================================================
-- 11. HANDLE COOLDOWN SKIP PENALTY
-- ============================================================
-- Called from frontend when cooldown is skipped

CREATE OR REPLACE FUNCTION public.handle_cooldown_skip(
  p_session_id UUID,
  p_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Apply trust penalty
  PERFORM public.update_trust_score(
    p_user_id,
    p_session_id,
    'cooldown_skipped',
    -1,
    NULL,
    jsonb_build_object('reason', 'User skipped mindful cooldown')
  );

  -- Reduce XP by 5
  UPDATE public.users
  SET xp = GREATEST(0, xp - 5)
  WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.handle_cooldown_skip(UUID, UUID) TO authenticated;


-- ============================================================
-- 12. SYSTEM CLEANUP FUNCTION (admin/cron)
-- ============================================================

CREATE OR REPLACE FUNCTION public.system_cleanup()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expired_queues INT;
  v_stuck_sessions INT;
  v_broken_matches INT;
BEGIN
  -- 1. Expire stuck queue entries
  UPDATE public.matching_queue SET status = 'expired'
  WHERE status = 'waiting' AND expires_at < NOW();
  GET DIAGNOSTICS v_expired_queues = ROW_COUNT;

  -- 2. Abandon stuck waiting/preparing sessions (>10 min old)
  UPDATE public.sessions SET status = 'abandoned', ended_at = NOW()
  WHERE status IN ('waiting', 'preparing')
    AND created_at < NOW() - INTERVAL '10 minutes';
  GET DIAGNOSTICS v_stuck_sessions = ROW_COUNT;

  -- 3. Break orphaned preparing matches (>10 min old)
  UPDATE public.matches SET state = 'broken', broken_reason = 'system_cleanup'
  WHERE state = 'preparing'
    AND created_at < NOW() - INTERVAL '10 minutes';
  GET DIAGNOSTICS v_broken_matches = ROW_COUNT;

  RETURN jsonb_build_object(
    'expired_queues', v_expired_queues,
    'stuck_sessions', v_stuck_sessions,
    'broken_matches', v_broken_matches,
    'ran_at', NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.system_cleanup() TO service_role;


-- ============================================================
-- 13. REALTIME PUBLICATION FOR MATCHES
-- ============================================================

DO $$
BEGIN
  -- Add matches to realtime publication (safe if already added)
  ALTER PUBLICATION supabase_realtime ADD TABLE public.matches;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- 14. FIX weekly_quest: wrong column name (streak → current_streak)
-- ============================================================
-- 007_quest_system.sql references users.streak which doesn't exist

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
  SELECT metadata INTO v_metadata FROM public.users WHERE id = p_user_id FOR UPDATE;

  -- If quests not initialized, skip
  IF v_metadata IS NULL OR v_metadata->'quests' IS NULL OR v_metadata->'quests'->'weekly' IS NULL THEN
    RETURN v_result;
  END IF;

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

  -- Check quest conditions (FIXED: current_streak instead of streak)
  CASE v_quest_id
    WHEN 'weekly_streak_3' THEN
      SELECT current_streak INTO v_user_streak FROM public.users WHERE id = p_user_id;
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
    UPDATE public.users SET xp = xp + 15 WHERE id = p_user_id;
    PERFORM public.update_trust_score(p_user_id, NULL, 'quest_weekly', 1);
  END IF;

  v_metadata := jsonb_set(v_metadata, '{quests,weekly}', v_quest);
  UPDATE public.users SET metadata = v_metadata WHERE id = p_user_id;

  RETURN v_result;
END;
$$;


-- ============================================================
-- 15. GRANT ALL NEW PERMISSIONS
-- ============================================================

GRANT EXECUTE ON FUNCTION public.system_cleanup() TO service_role;
GRANT EXECUTE ON FUNCTION public.log_analytics_event(TEXT, JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rejoin_match(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_cooldown_skip(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_weekly_quest(UUID, JSONB) TO authenticated;
