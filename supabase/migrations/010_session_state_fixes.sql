-- ============================================================
-- 010_session_state_fixes.sql
-- Fix session state persistence bug
-- ============================================================

-- ============================================================
-- 1. ADD EXPIRES_AT COLUMN
-- ============================================================
ALTER TABLE matches ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;

-- ============================================================
-- 2. ADD 'expired' STATE TO ENUM (safe add)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumtypid = 'match_state'::regtype 
    AND enumlabel = 'expired'
  ) THEN
    ALTER TYPE match_state ADD VALUE 'expired';
  END IF;
END $$;


-- ============================================================
-- 3. MARK USER LEFT (for beforeunload)
-- ============================================================
CREATE OR REPLACE FUNCTION public.mark_user_left(
  p_match_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match RECORD;
  v_is_user_a BOOLEAN;
  v_my_uid UUID := auth.uid();
BEGIN
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF v_match IS NULL THEN RETURN; END IF;
  
  v_is_user_a := (v_my_uid = v_match.user_a_id);
  
  -- Set heartbeat to old time to trigger partner's detection
  IF v_is_user_a THEN
    UPDATE matches 
    SET user_a_last_heartbeat = NOW() - INTERVAL '1 hour'
    WHERE id = p_match_id;
  ELSE
    UPDATE matches 
    SET user_b_last_heartbeat = NOW() - INTERVAL '1 hour'
    WHERE id = p_match_id;
  END IF;
  
  -- If match is active, mark as broken
  IF v_match.state = 'active' THEN
    UPDATE matches 
    SET state = 'broken', broken_reason = 'user_left', expires_at = NOW() + INTERVAL '3 minutes'
    WHERE id = p_match_id;
  END IF;
END;
$$;


-- ============================================================
-- 4. EXPIRE STALE MATCHES (cron job target)
-- ============================================================
CREATE OR REPLACE FUNCTION public.expire_stale_matches()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Expire broken matches older than 3 minutes
  UPDATE matches
  SET state = 'expired'
  WHERE state = 'broken'
    AND (
      expires_at IS NOT NULL AND expires_at < NOW()
      OR
      expires_at IS NULL AND updated_at < NOW() - INTERVAL '3 minutes'
    );
    
  -- Also update corresponding sessions
  UPDATE sessions s
  SET status = 'expired', ended_at = NOW()
  FROM matches m
  WHERE m.session_id = s.id
    AND m.state = 'expired'
    AND s.status NOT IN ('completed', 'expired');
    
  -- Expire ghost active matches (no heartbeat for 5 min)
  UPDATE matches
  SET state = 'expired'
  WHERE state = 'active'
    AND user_a_last_heartbeat < NOW() - INTERVAL '5 minutes'
    AND user_b_last_heartbeat < NOW() - INTERVAL '5 minutes';
END;
$$;


-- ============================================================
-- 5. REJOIN MATCH RPC
-- ============================================================
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
  v_is_user_a BOOLEAN;
  v_my_uid UUID := auth.uid();
  v_partner_alive BOOLEAN;
BEGIN
  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  
  IF v_match IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'match_not_found');
  END IF;
  
  -- Check if user is part of match
  IF v_my_uid != v_match.user_a_id AND v_my_uid != v_match.user_b_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_in_match');
  END IF;
  
  -- Check if within 3 minute window
  IF v_match.expires_at IS NOT NULL AND v_match.expires_at < NOW() THEN
    RETURN jsonb_build_object('success', false, 'error', 'rejoin_expired');
  END IF;
  
  IF v_match.updated_at < NOW() - INTERVAL '3 minutes' AND v_match.state = 'broken' THEN
    RETURN jsonb_build_object('success', false, 'error', 'rejoin_expired');
  END IF;
  
  -- Check state
  IF v_match.state NOT IN ('active', 'broken') THEN
    RETURN jsonb_build_object('success', false, 'error', 'match_not_rejoinable');
  END IF;
  
  v_is_user_a := (v_my_uid = v_match.user_a_id);
  
  -- Update heartbeat to now
  IF v_is_user_a THEN
    UPDATE matches SET user_a_last_heartbeat = NOW() WHERE id = p_match_id;
    v_partner_alive := v_match.user_b_last_heartbeat > NOW() - INTERVAL '30 seconds';
  ELSE
    UPDATE matches SET user_b_last_heartbeat = NOW() WHERE id = p_match_id;
    v_partner_alive := v_match.user_a_last_heartbeat > NOW() - INTERVAL '30 seconds';
  END IF;
  
  -- If match was broken and partner is back, restore to active
  IF v_match.state = 'broken' AND v_partner_alive THEN
    UPDATE matches 
    SET state = 'active', expires_at = NULL, broken_reason = NULL
    WHERE id = p_match_id;
  END IF;
  
  RETURN jsonb_build_object(
    'success', true, 
    'session_id', v_match.session_id,
    'partner_alive', v_partner_alive
  );
END;
$$;


-- ============================================================
-- 6. GET ACTIVE SESSION FOR DASHBOARD
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_active_match()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match RECORD;
  v_my_uid UUID := auth.uid();
  v_is_user_a BOOLEAN;
  v_my_last_hb TIMESTAMP;
BEGIN
  -- Find most recent active or broken match
  SELECT * INTO v_match
  FROM matches
  WHERE (user_a_id = v_my_uid OR user_b_id = v_my_uid)
    AND state IN ('active', 'broken')
  ORDER BY updated_at DESC
  LIMIT 1;
  
  IF v_match IS NULL THEN
    RETURN jsonb_build_object('has_active', false);
  END IF;
  
  v_is_user_a := (v_my_uid = v_match.user_a_id);
  v_my_last_hb := CASE WHEN v_is_user_a THEN v_match.user_a_last_heartbeat ELSE v_match.user_b_last_heartbeat END;
  
  -- If my last heartbeat is old (>30s), I "left" the session
  IF v_my_last_hb < NOW() - INTERVAL '30 seconds' THEN
    -- Check if rejoin still possible
    IF v_match.state = 'broken' THEN
      IF v_match.expires_at IS NOT NULL AND v_match.expires_at < NOW() THEN
        RETURN jsonb_build_object('has_active', false);
      END IF;
      IF v_match.updated_at < NOW() - INTERVAL '3 minutes' THEN
        RETURN jsonb_build_object('has_active', false);
      END IF;
    END IF;
    
    RETURN jsonb_build_object(
      'has_active', true,
      'can_rejoin', true,
      'match_id', v_match.id,
      'session_id', v_match.session_id,
      'state', v_match.state
    );
  END IF;
  
  -- I'm still "in" the session
  RETURN jsonb_build_object(
    'has_active', true,
    'can_rejoin', false,
    'match_id', v_match.id,
    'session_id', v_match.session_id,
    'state', v_match.state
  );
END;
$$;


-- ============================================================
-- 7. GRANT PERMISSIONS
-- ============================================================
GRANT EXECUTE ON FUNCTION public.mark_user_left(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rejoin_match(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_match() TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_matches() TO service_role;
