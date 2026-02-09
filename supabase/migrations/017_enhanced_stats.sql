-- ============================================================
-- 017: Enhanced Stats RPC
-- Completion rate, best hour, preferred duration, streak analysis
-- ============================================================

CREATE OR REPLACE FUNCTION get_enhanced_stats(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_sessions INT;
  v_completed_sessions INT;
  v_completion_rate FLOAT;
  v_best_hour INT;
  v_preferred_duration INT;
  v_longest_streak INT;
  v_current_streak INT;
  v_total_minutes INT;
  v_avg_sessions_per_week FLOAT;
  v_city_contributions INT;
BEGIN
  -- User stats
  SELECT total_sessions, completed_sessions, current_streak, longest_streak, total_minutes
  INTO v_total_sessions, v_completed_sessions, v_current_streak, v_longest_streak, v_total_minutes
  FROM users WHERE id = p_user_id;

  -- Completion rate
  IF COALESCE(v_total_sessions, 0) > 0 THEN
    v_completion_rate := ROUND((v_completed_sessions::FLOAT / v_total_sessions * 100)::NUMERIC, 1);
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

  -- City stream contributions (cross-page: "Bu hafta şehir akışına X katkı yaptın")
  -- Uses session_participants as canonical source (not city_activity)
  SELECT COUNT(*) INTO v_city_contributions
  FROM session_participants sp
  JOIN sessions s ON s.id = sp.session_id
  WHERE sp.user_id = p_user_id
    AND sp.status = 'completed'
    AND s.started_at >= NOW() - INTERVAL '7 days'
    AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = p_user_id AND (u.metadata->>'city') IS NOT NULL
    );

  RETURN jsonb_build_object(
    'completion_rate', COALESCE(v_completion_rate, 0),
    'best_hour', v_best_hour,
    'preferred_duration', v_preferred_duration,
    'current_streak', COALESCE(v_current_streak, 0),
    'longest_streak', COALESCE(v_longest_streak, 0),
    'total_minutes', COALESCE(v_total_minutes, 0),
    'total_sessions', COALESCE(v_total_sessions, 0),
    'completed_sessions', COALESCE(v_completed_sessions, 0),
    'avg_sessions_per_week', COALESCE(ROUND(v_avg_sessions_per_week::NUMERIC, 1), 0),
    'city_contributions', COALESCE(v_city_contributions, 0)
  );
END;
$$;
