-- ============================================================
-- 011_heartbeat_detection.sql
-- Heartbeat-based session detection (V2 fix)
-- ============================================================

-- ============================================================
-- 1. FIXED get_active_match — Checks MY heartbeat
-- ============================================================
DROP FUNCTION IF EXISTS public.get_active_match();

CREATE FUNCTION public.get_active_match()
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
  v_heartbeat_threshold INTERVAL := INTERVAL '30 seconds';
  v_rejoin_window INTERVAL := INTERVAL '3 minutes';
BEGIN
  -- Find most recent match for this user
  SELECT * INTO v_match
  FROM matches
  WHERE (user_a_id = v_my_uid OR user_b_id = v_my_uid)
    AND state IN ('active', 'broken', 'preparing')
  ORDER BY updated_at DESC
  LIMIT 1;
  
  IF v_match IS NULL THEN
    RETURN jsonb_build_object('has_active', false);
  END IF;
  
  v_is_user_a := (v_my_uid = v_match.user_a_id);
  v_my_last_hb := CASE 
    WHEN v_is_user_a THEN v_match.user_a_last_heartbeat 
    ELSE v_match.user_b_last_heartbeat 
  END;
  
  -- CRITICAL: Is MY heartbeat recent?
  -- If I haven't sent heartbeat in 30s, I'm NOT "in" this session
  IF v_my_last_hb IS NULL OR v_my_last_hb < NOW() - v_heartbeat_threshold THEN
    -- I "left" this session
    
    -- Can I rejoin within 3 min window?
    IF v_my_last_hb IS NOT NULL AND v_my_last_hb > NOW() - v_rejoin_window THEN
      RETURN jsonb_build_object(
        'has_active', true,
        'can_rejoin', true,
        'match_id', v_match.id,
        'session_id', v_match.session_id,
        'state', 'disconnected'
      );
    END IF;
    
    -- Check broken state rejoin window
    IF v_match.state = 'broken' AND v_match.updated_at > NOW() - v_rejoin_window THEN
      RETURN jsonb_build_object(
        'has_active', true,
        'can_rejoin', true,
        'match_id', v_match.id,
        'session_id', v_match.session_id,
        'state', 'broken'
      );
    END IF;
    
    -- Too late, no active session
    RETURN jsonb_build_object('has_active', false);
  END IF;
  
  -- My heartbeat is recent - I'm actively in the session
  -- This means user navigated to dashboard during active session
  RETURN jsonb_build_object(
    'has_active', true,
    'can_rejoin', false,
    'match_id', v_match.id,
    'session_id', v_match.session_id,
    'state', v_match.state::TEXT
  );
END;
$$;


-- ============================================================
-- 2. detect_disconnected_users — Cron target (30s interval)
-- ============================================================
CREATE OR REPLACE FUNCTION public.detect_disconnected_users()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match RECORD;
  v_a_alive BOOLEAN;
  v_b_alive BOOLEAN;
  v_threshold INTERVAL := INTERVAL '30 seconds';
BEGIN
  -- Find all active matches
  FOR v_match IN 
    SELECT * FROM matches 
    WHERE state = 'active'
  LOOP
    v_a_alive := v_match.user_a_last_heartbeat IS NOT NULL 
      AND v_match.user_a_last_heartbeat > NOW() - v_threshold;
    v_b_alive := v_match.user_b_last_heartbeat IS NOT NULL
      AND v_match.user_b_last_heartbeat > NOW() - v_threshold;
    
    -- Both disconnected → expire immediately
    IF NOT v_a_alive AND NOT v_b_alive THEN
      UPDATE matches 
      SET state = 'expired'
      WHERE id = v_match.id;
      
      UPDATE sessions 
      SET status = 'expired', ended_at = NOW()
      WHERE id = v_match.session_id;
      
    -- One disconnected → mark as broken with 3 min window
    ELSIF NOT v_a_alive OR NOT v_b_alive THEN
      UPDATE matches 
      SET state = 'broken',
          broken_reason = CASE 
            WHEN NOT v_a_alive THEN 'user_a_timeout'
            ELSE 'user_b_timeout'
          END,
          expires_at = NOW() + INTERVAL '3 minutes'
      WHERE id = v_match.id
        AND state = 'active';
    END IF;
  END LOOP;
  
  -- Expire old broken matches past their window
  UPDATE matches
  SET state = 'expired'
  WHERE state = 'broken'
    AND (
      (expires_at IS NOT NULL AND expires_at < NOW())
      OR (expires_at IS NULL AND updated_at < NOW() - INTERVAL '3 minutes')
    );
    
  -- Update corresponding sessions
  UPDATE sessions s
  SET status = 'expired', ended_at = NOW()
  FROM matches m
  WHERE m.session_id = s.id
    AND m.state = 'expired'
    AND s.status NOT IN ('completed', 'expired');
END;
$$;


-- ============================================================
-- 3. GRANT PERMISSIONS
-- ============================================================
GRANT EXECUTE ON FUNCTION public.get_active_match() TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_disconnected_users() TO service_role;
