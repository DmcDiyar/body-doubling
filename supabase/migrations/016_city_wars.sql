-- ============================================================
-- 016: City Wars — Anonymous City-Based Competition
-- No names, no scores, no rankings. Just atmosphere.
-- ============================================================

-- City activity tracking table
CREATE TABLE IF NOT EXISTS city_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  minutes INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_city_activity_city ON city_activity(city_id);
CREATE INDEX IF NOT EXISTS idx_city_activity_created ON city_activity(created_at);

-- RLS for city_activity
ALTER TABLE city_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY city_activity_insert ON city_activity
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY city_activity_select ON city_activity
  FOR SELECT USING (TRUE); -- anyone can read aggregate city data

-- Record city activity after session completion
CREATE OR REPLACE FUNCTION record_city_activity(
  p_user_id UUID,
  p_session_id UUID,
  p_minutes INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_city TEXT;
BEGIN
  -- Get user's city from metadata
  SELECT metadata->>'city' INTO v_city FROM users WHERE id = p_user_id;
  IF v_city IS NULL THEN RETURN FALSE; END IF;

  INSERT INTO city_activity (city_id, user_id, session_id, minutes)
  VALUES (v_city, p_user_id, p_session_id, p_minutes);

  RETURN TRUE;
END;
$$;

-- Get city atmosphere data
CREATE OR REPLACE FUNCTION get_city_atmosphere(p_city_id TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB := '[]'::JSONB;
  v_city RECORD;
  v_today_minutes INT;
  v_yesterday_minutes INT;
  v_week_minutes INT;
  v_active_now INT;
  v_mood TEXT;
BEGIN
  FOR v_city IN
    SELECT DISTINCT city_id FROM city_activity
    WHERE (p_city_id IS NULL OR city_id = p_city_id)
    ORDER BY city_id
  LOOP
    -- Today's total minutes
    SELECT COALESCE(SUM(minutes), 0) INTO v_today_minutes
    FROM city_activity
    WHERE city_id = v_city.city_id
      AND created_at >= CURRENT_DATE::TIMESTAMPTZ;

    -- Yesterday's total minutes
    SELECT COALESCE(SUM(minutes), 0) INTO v_yesterday_minutes
    FROM city_activity
    WHERE city_id = v_city.city_id
      AND created_at >= (CURRENT_DATE - 1)::TIMESTAMPTZ
      AND created_at < CURRENT_DATE::TIMESTAMPTZ;

    -- This week's total minutes
    SELECT COALESCE(SUM(minutes), 0) INTO v_week_minutes
    FROM city_activity
    WHERE city_id = v_city.city_id
      AND created_at >= date_trunc('week', CURRENT_DATE)::TIMESTAMPTZ;

    -- Active in last 30 min (unique users)
    SELECT COUNT(DISTINCT user_id) INTO v_active_now
    FROM city_activity
    WHERE city_id = v_city.city_id
      AND created_at >= NOW() - INTERVAL '30 minutes';

    -- Calculate mood
    IF v_today_minutes > v_yesterday_minutes * 1.2 THEN
      v_mood := 'rising';
    ELSIF v_today_minutes < v_yesterday_minutes * 0.5 THEN
      v_mood := 'quiet';
    ELSIF v_active_now >= 3 THEN
      v_mood := 'awakening';
    ELSE
      v_mood := 'steady';
    END IF;

    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'city_id', v_city.city_id,
      'today_minutes', v_today_minutes,
      'yesterday_minutes', v_yesterday_minutes,
      'week_minutes', v_week_minutes,
      'active_now', v_active_now,
      'mood', v_mood
    ));
  END LOOP;

  RETURN v_result;
END;
$$;

-- Set user's city
CREATE OR REPLACE FUNCTION set_user_city(p_user_id UUID, p_city_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meta JSONB;
BEGIN
  SELECT metadata INTO v_meta FROM users WHERE id = p_user_id;
  IF v_meta IS NULL THEN v_meta := '{}'::JSONB; END IF;

  v_meta := v_meta || jsonb_build_object('city', p_city_id);
  UPDATE users SET metadata = v_meta WHERE id = p_user_id;

  RETURN TRUE;
END;
$$;
