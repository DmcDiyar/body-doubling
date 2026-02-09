-- ============================================================
-- 015: Self-Competition System
-- "Ayna" — Compare only with your past self
-- Trends, not numbers. No judgment.
-- ============================================================

-- Get self-comparison data for a user
CREATE OR REPLACE FUNCTION get_self_comparison(
  p_user_id UUID,
  p_range TEXT DEFAULT 'week' -- 'week' or 'month'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_start DATE;
  v_prev_start DATE;
  v_prev_end DATE;
  v_current JSONB;
  v_previous JSONB;
  v_result JSONB;
  v_curr_sessions INT;
  v_prev_sessions INT;
  v_curr_minutes INT;
  v_prev_minutes INT;
  v_curr_streak INT;
  v_prev_max_streak INT;
  v_curr_rituals INT;
  v_prev_rituals INT;
  v_curr_cooldowns INT;
  v_prev_cooldowns INT;
  v_curr_avg_duration FLOAT;
  v_prev_avg_duration FLOAT;
BEGIN
  -- Calculate date ranges
  IF p_range = 'week' THEN
    v_current_start := date_trunc('week', CURRENT_DATE)::DATE;
    v_prev_start := v_current_start - 7;
    v_prev_end := v_current_start - 1;
  ELSE -- month
    v_current_start := date_trunc('month', CURRENT_DATE)::DATE;
    v_prev_start := (v_current_start - INTERVAL '1 month')::DATE;
    v_prev_end := v_current_start - 1;
  END IF;

  -- Current period stats
  SELECT
    COUNT(*)::INT,
    COALESCE(SUM(s.duration), 0)::INT,
    COALESCE(AVG(s.duration), 0)::FLOAT
  INTO v_curr_sessions, v_curr_minutes, v_curr_avg_duration
  FROM session_participants sp
  JOIN sessions s ON s.id = sp.session_id
  WHERE sp.user_id = p_user_id
    AND sp.status = 'completed'
    AND s.started_at >= v_current_start::TIMESTAMPTZ;

  -- Previous period stats
  SELECT
    COUNT(*)::INT,
    COALESCE(SUM(s.duration), 0)::INT,
    COALESCE(AVG(s.duration), 0)::FLOAT
  INTO v_prev_sessions, v_prev_minutes, v_prev_avg_duration
  FROM session_participants sp
  JOIN sessions s ON s.id = sp.session_id
  WHERE sp.user_id = p_user_id
    AND sp.status = 'completed'
    AND s.started_at >= v_prev_start::TIMESTAMPTZ
    AND s.started_at < v_current_start::TIMESTAMPTZ;

  -- Current rituals completed
  SELECT COUNT(*)::INT INTO v_curr_rituals
  FROM session_participants sp
  JOIN sessions s ON s.id = sp.session_id
  WHERE sp.user_id = p_user_id
    AND sp.status = 'completed'
    AND s.started_at >= v_current_start::TIMESTAMPTZ
    AND (sp.metadata->'ritual'->>'completed')::BOOLEAN = TRUE;

  -- Previous rituals completed
  SELECT COUNT(*)::INT INTO v_prev_rituals
  FROM session_participants sp
  JOIN sessions s ON s.id = sp.session_id
  WHERE sp.user_id = p_user_id
    AND sp.status = 'completed'
    AND s.started_at >= v_prev_start::TIMESTAMPTZ
    AND s.started_at < v_current_start::TIMESTAMPTZ
    AND (sp.metadata->'ritual'->>'completed')::BOOLEAN = TRUE;

  -- Current cooldowns completed (not skipped)
  SELECT COUNT(*)::INT INTO v_curr_cooldowns
  FROM session_participants sp
  JOIN sessions s ON s.id = sp.session_id
  WHERE sp.user_id = p_user_id
    AND sp.status = 'completed'
    AND s.started_at >= v_current_start::TIMESTAMPTZ
    AND (sp.metadata->'cooldown'->>'completed')::BOOLEAN = TRUE
    AND COALESCE((sp.metadata->'cooldown'->>'skipped')::BOOLEAN, FALSE) = FALSE;

  -- Previous cooldowns completed
  SELECT COUNT(*)::INT INTO v_prev_cooldowns
  FROM session_participants sp
  JOIN sessions s ON s.id = sp.session_id
  WHERE sp.user_id = p_user_id
    AND sp.status = 'completed'
    AND s.started_at >= v_prev_start::TIMESTAMPTZ
    AND s.started_at < v_current_start::TIMESTAMPTZ
    AND (sp.metadata->'cooldown'->>'completed')::BOOLEAN = TRUE
    AND COALESCE((sp.metadata->'cooldown'->>'skipped')::BOOLEAN, FALSE) = FALSE;

  -- Current streak
  SELECT current_streak INTO v_curr_streak FROM users WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'range', p_range,
    'current', jsonb_build_object(
      'sessions', v_curr_sessions,
      'minutes', v_curr_minutes,
      'avg_duration', ROUND(v_curr_avg_duration::NUMERIC, 1),
      'rituals', v_curr_rituals,
      'cooldowns', v_curr_cooldowns,
      'streak', COALESCE(v_curr_streak, 0)
    ),
    'previous', jsonb_build_object(
      'sessions', v_prev_sessions,
      'minutes', v_prev_minutes,
      'avg_duration', ROUND(v_prev_avg_duration::NUMERIC, 1),
      'rituals', v_prev_rituals,
      'cooldowns', v_prev_cooldowns
    )
  );
END;
$$;
