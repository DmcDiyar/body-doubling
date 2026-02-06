-- ============================================================
-- 009_integrate_matches.sql (SIMPLIFIED)
-- Keep original find_match, add separate match creation
-- ============================================================

-- Step 1: Drop any existing find_match
DROP FUNCTION IF EXISTS public.find_match(UUID, INTEGER, TEXT);

-- Step 2: Recreate with simple UUID return (ORIGINAL behavior)
CREATE FUNCTION public.find_match(
  p_user_id UUID,
  p_duration INTEGER,
  p_theme TEXT DEFAULT 'rainy_cafe'
)
RETURNS UUID -- Returns session_id or NULL
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
  ORDER BY COALESCE(priority, 1) DESC, created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_partner IS NULL THEN
    RETURN NULL;
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

  RETURN v_session_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.find_match(UUID, INTEGER, TEXT) TO authenticated;
