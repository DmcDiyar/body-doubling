-- ============================================================
-- 012_session_lifecycle_v2.sql
-- CRITICAL FIX: Eliminates ghost "active session" state
-- ============================================================
-- Fixes:
--   1. mark_user_left RPC (missing — beforeunload was calling a non-existent function)
--   2. get_active_match rewritten (joins sessions, checks time expiry, auto-cleans)
--   3. complete_match fixed (now accepts broken state)
--   4. detect_disconnected_users rewritten (valid states, no missing columns)
--   5. match_state enum expanded (+ expired)
--   6. sessions.status CHECK expanded (+ expired)
-- ============================================================


-- ============================================================
-- 1. ADD 'expired' TO match_state ENUM
-- ============================================================
-- Required by detect_disconnected_users and get_active_match cleanup
ALTER TYPE match_state ADD VALUE IF NOT EXISTS 'expired';


-- ============================================================
-- 2. EXPAND sessions.status CHECK (+ expired)
-- ============================================================
ALTER TABLE public.sessions
DROP CONSTRAINT IF EXISTS sessions_status_check;

ALTER TABLE public.sessions
ADD CONSTRAINT sessions_status_check
CHECK (status IN ('waiting', 'preparing', 'active', 'completed', 'abandoned', 'expired'));


-- ============================================================
-- 3. mark_user_left — Called from beforeunload via fetch keepalive
-- ============================================================
-- Sets the user's heartbeat to far past so partner's next heartbeat
-- check detects them as dead immediately. Also breaks the match.
CREATE OR REPLACE FUNCTION public.mark_user_left(
  p_match_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match RECORD;
  v_my_uid UUID := auth.uid();
  v_is_user_a BOOLEAN;
BEGIN
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;

  IF v_match IS NULL THEN RETURN; END IF;
  IF v_my_uid != v_match.user_a_id AND v_my_uid != v_match.user_b_id THEN RETURN; END IF;

  v_is_user_a := (v_my_uid = v_match.user_a_id);

  -- Set my heartbeat to far past → partner's next heartbeat detects me as dead
  IF v_is_user_a THEN
    UPDATE matches SET user_a_last_heartbeat = NOW() - INTERVAL '1 hour'
    WHERE id = p_match_id;
  ELSE
    UPDATE matches SET user_b_last_heartbeat = NOW() - INTERVAL '1 hour'
    WHERE id = p_match_id;
  END IF;

  -- Immediately break the match
  UPDATE matches
  SET state = 'broken', broken_reason = 'user_left'
  WHERE id = p_match_id
    AND state IN ('active', 'preparing');
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_user_left(UUID) TO authenticated;


-- ============================================================
-- 4. REWRITE get_active_match — The core fix
-- ============================================================
-- Key changes:
--   a) JOINs sessions table (checks session status + started_at + duration)
--   b) TIME-BASED EXPIRY: if started_at + duration < NOW() → auto-complete, return false
--   c) BROKEN MATCH: only shows rejoin if within 3-min window AND session not expired
--   d) Auto-cleans stale data on every call (self-healing)
DROP FUNCTION IF EXISTS public.get_active_match();

CREATE FUNCTION public.get_active_match()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec RECORD;
  v_my_uid UUID := auth.uid();
  v_session_end_time TIMESTAMPTZ;
BEGIN
  -- Find the most recent non-terminal match WITH its session data
  SELECT
    m.id            AS match_id,
    m.session_id,
    m.state::TEXT   AS match_state,
    m.user_a_id,
    m.user_b_id,
    m.updated_at    AS match_updated_at,
    m.broken_reason,
    s.started_at,
    s.duration,
    s.status        AS session_status
  INTO v_rec
  FROM matches m
  JOIN sessions s ON s.id = m.session_id
  WHERE (m.user_a_id = v_my_uid OR m.user_b_id = v_my_uid)
    AND m.state::TEXT IN ('active', 'broken', 'preparing')
    AND s.status NOT IN ('completed', 'abandoned', 'expired')
  ORDER BY m.updated_at DESC
  LIMIT 1;

  -- No match found → nothing to show
  IF v_rec IS NULL THEN
    RETURN jsonb_build_object('has_active', false);
  END IF;

  -- ── TIME-BASED EXPIRY CHECK ──────────────────────────────
  IF v_rec.started_at IS NOT NULL THEN
    v_session_end_time := v_rec.started_at + (v_rec.duration * INTERVAL '1 minute');

    IF v_session_end_time < NOW() THEN
      -- Session timer EXPIRED → auto-cleanup everything
      UPDATE sessions
      SET status = 'completed', ended_at = v_session_end_time
      WHERE id = v_rec.session_id
        AND status NOT IN ('completed', 'abandoned', 'expired');

      UPDATE matches
      SET state = 'completed'
      WHERE id = v_rec.match_id
        AND state::TEXT NOT IN ('completed', 'expired');

      UPDATE session_participants
      SET status = 'completed'
      WHERE session_id = v_rec.session_id
        AND status IN ('active', 'joined', 'waiting');

      RETURN jsonb_build_object('has_active', false);
    END IF;
  END IF;

  -- ── Session is within time window ────────────────────────
  CASE v_rec.match_state

    WHEN 'active' THEN
      -- Match is active → user should return to session
      RETURN jsonb_build_object(
        'has_active', true,
        'can_rejoin', false,
        'match_id', v_rec.match_id,
        'session_id', v_rec.session_id,
        'state', 'active'
      );

    WHEN 'broken' THEN
      -- Match is broken → check 3-minute rejoin window
      IF v_rec.match_updated_at > NOW() - INTERVAL '3 minutes' THEN
        RETURN jsonb_build_object(
          'has_active', true,
          'can_rejoin', true,
          'match_id', v_rec.match_id,
          'session_id', v_rec.session_id,
          'state', 'broken'
        );
      ELSE
        -- Rejoin window expired → clean up and hide
        UPDATE matches SET state = 'expired'
        WHERE id = v_rec.match_id AND state = 'broken';

        UPDATE sessions
        SET status = 'abandoned', ended_at = NOW()
        WHERE id = v_rec.session_id
          AND status NOT IN ('completed', 'abandoned', 'expired');

        RETURN jsonb_build_object('has_active', false);
      END IF;

    WHEN 'preparing' THEN
      -- Still in prepare/ritual phase → return to prepare
      RETURN jsonb_build_object(
        'has_active', true,
        'can_rejoin', false,
        'match_id', v_rec.match_id,
        'session_id', v_rec.session_id,
        'state', 'preparing'
      );

    ELSE
      RETURN jsonb_build_object('has_active', false);

  END CASE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_match() TO authenticated;


-- ============================================================
-- 5. FIX complete_match — Accept broken state too
-- ============================================================
-- Previously: AND state = 'active'
-- Now: AND state IN ('active', 'broken')
-- This fixes the case where partner left (match=broken) but timer expires.
CREATE OR REPLACE FUNCTION public.complete_match(
  p_match_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE matches
  SET state = 'completed'
  WHERE id = p_match_id
    AND (auth.uid() = user_a_id OR auth.uid() = user_b_id)
    AND state IN ('active', 'broken');
END;
$$;


-- ============================================================
-- 6. REWRITE detect_disconnected_users — Valid states only
-- ============================================================
-- No longer references non-existent columns or invalid states.
-- Uses 'expired' (now valid) for matches, 'abandoned' for sessions.
CREATE OR REPLACE FUNCTION public.detect_disconnected_users()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match RECORD;
  v_session RECORD;
  v_a_alive BOOLEAN;
  v_b_alive BOOLEAN;
  v_threshold INTERVAL := INTERVAL '30 seconds';
  v_broken_count INT := 0;
  v_expired_count INT := 0;
  v_time_expired_count INT := 0;
BEGIN
  -- ── Pass 1: Check active matches for disconnected users ──
  FOR v_match IN
    SELECT m.*, s.started_at, s.duration
    FROM matches m
    JOIN sessions s ON s.id = m.session_id
    WHERE m.state = 'active'
  LOOP
    -- Check if session timer has expired
    IF v_match.started_at IS NOT NULL
       AND v_match.started_at + (v_match.duration * INTERVAL '1 minute') < NOW()
    THEN
      -- Timer expired → complete everything
      UPDATE matches SET state = 'completed' WHERE id = v_match.id;
      UPDATE sessions SET status = 'completed', ended_at = NOW()
      WHERE id = v_match.session_id AND status NOT IN ('completed', 'abandoned', 'expired');
      UPDATE session_participants SET status = 'completed'
      WHERE session_id = v_match.session_id AND status IN ('active', 'joined');
      v_time_expired_count := v_time_expired_count + 1;
      CONTINUE;
    END IF;

    -- Check heartbeats
    v_a_alive := v_match.user_a_last_heartbeat IS NOT NULL
      AND v_match.user_a_last_heartbeat > NOW() - v_threshold;
    v_b_alive := v_match.user_b_last_heartbeat IS NOT NULL
      AND v_match.user_b_last_heartbeat > NOW() - v_threshold;

    -- Both disconnected → expire
    IF NOT v_a_alive AND NOT v_b_alive THEN
      UPDATE matches SET state = 'expired' WHERE id = v_match.id;
      UPDATE sessions SET status = 'abandoned', ended_at = NOW()
      WHERE id = v_match.session_id AND status NOT IN ('completed', 'abandoned', 'expired');
      v_expired_count := v_expired_count + 1;

    -- One disconnected → break
    ELSIF NOT v_a_alive OR NOT v_b_alive THEN
      UPDATE matches
      SET state = 'broken',
          broken_reason = CASE WHEN NOT v_a_alive THEN 'user_a_timeout' ELSE 'user_b_timeout' END
      WHERE id = v_match.id AND state = 'active';
      v_broken_count := v_broken_count + 1;
    END IF;
  END LOOP;

  -- ── Pass 2: Expire broken matches past 3-minute rejoin window ──
  UPDATE matches SET state = 'expired'
  WHERE state = 'broken'
    AND updated_at < NOW() - INTERVAL '3 minutes';

  -- ── Pass 3: Abandon sessions whose matches are expired ──
  UPDATE sessions s
  SET status = 'abandoned', ended_at = NOW()
  FROM matches m
  WHERE m.session_id = s.id
    AND m.state = 'expired'
    AND s.status NOT IN ('completed', 'abandoned', 'expired');

  RETURN jsonb_build_object(
    'broken_count', v_broken_count,
    'expired_count', v_expired_count,
    'time_expired_count', v_time_expired_count,
    'ran_at', NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.detect_disconnected_users() TO service_role;


-- ============================================================
-- 7. GRANT ALL PERMISSIONS
-- ============================================================
GRANT EXECUTE ON FUNCTION public.mark_user_left(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_match() TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_match(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_disconnected_users() TO service_role;
