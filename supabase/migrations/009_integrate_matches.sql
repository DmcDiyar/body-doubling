-- ============================================================
-- 009_integrate_matches.sql
-- Integrate matches table into existing find_match flow
-- ============================================================

-- Drop existing function (return type changed)
DROP FUNCTION IF EXISTS public.find_match(UUID, INTEGER, TEXT);

-- Update find_match to also create match record for duo sessions
CREATE OR REPLACE FUNCTION public.find_match(
  p_user_id UUID,
  p_duration INTEGER,
  p_theme TEXT DEFAULT 'rainy_cafe'
)
RETURNS TABLE(session_id UUID, match_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner RECORD;
  v_session_id UUID;
  v_match_id UUID;
BEGIN
  -- Look for a waiting partner with same duration
  SELECT * INTO v_partner
  FROM matching_queue
  WHERE status = 'waiting'
    AND user_id != p_user_id
    AND duration = p_duration
    AND expires_at > NOW()
  ORDER BY priority DESC, created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_partner IS NULL THEN
    RETURN; -- No match found
  END IF;

  -- Create session
  INSERT INTO sessions (mode, status, duration, theme)
  VALUES ('duo', 'preparing', p_duration, p_theme)
  RETURNING id INTO v_session_id;

  -- Create match record
  INSERT INTO matches (session_id, user_a_id, user_b_id, pomodoro_duration, state)
  VALUES (v_session_id, v_partner.user_id, p_user_id, p_duration, 'preparing')
  RETURNING id INTO v_match_id;

  -- Create participants
  INSERT INTO session_participants (session_id, user_id, status)
  VALUES 
    (v_session_id, v_partner.user_id, 'joined'),
    (v_session_id, p_user_id, 'joined');

  -- Mark both as matched
  UPDATE matching_queue 
  SET status = 'matched' 
  WHERE user_id IN (v_partner.user_id, p_user_id);

  RETURN QUERY SELECT v_session_id, v_match_id;
END;
$$;

-- Grant execute
GRANT EXECUTE ON FUNCTION public.find_match(UUID, INTEGER, TEXT) TO authenticated;
