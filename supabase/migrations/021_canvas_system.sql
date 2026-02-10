-- ============================================================
-- 021: Canvas System — City pixel art (r/place style)
-- Each city gets a 64x64 pixel canvas (4096 pixels)
-- BYTEA storage for efficient binary representation
-- ============================================================

-- 1. City canvas state (snapshot)
CREATE TABLE IF NOT EXISTS city_canvas (
  city_id TEXT PRIMARY KEY,
  pixels BYTEA NOT NULL,              -- 4096 bytes (64x64, each byte = color index 0-7)
  version INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Pixel change log (for Realtime broadcast + audit)
CREATE TABLE IF NOT EXISTS pixel_log (
  id BIGSERIAL PRIMARY KEY,
  city_id TEXT NOT NULL,
  x SMALLINT NOT NULL CHECK (x >= 0 AND x < 64),
  y SMALLINT NOT NULL CHECK (y >= 0 AND y < 64),
  color SMALLINT NOT NULL CHECK (color >= 0 AND color < 8),
  user_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pixel_log_city_created
  ON pixel_log (city_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pixel_log_user
  ON pixel_log (user_id, created_at DESC);

-- 3. RLS
ALTER TABLE city_canvas ENABLE ROW LEVEL SECURITY;
ALTER TABLE pixel_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Canvas readable by all" ON city_canvas;
CREATE POLICY "Canvas readable by all" ON city_canvas FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "Pixel log readable by all" ON pixel_log;
CREATE POLICY "Pixel log readable by all" ON pixel_log FOR SELECT USING (TRUE);

-- No direct INSERT policy — all writes go through place_pixel RPC

-- 4. Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE pixel_log;

-- 5. place_pixel RPC — trust-based cooldown
CREATE OR REPLACE FUNCTION place_pixel(
  p_city_id TEXT,
  p_x SMALLINT,
  p_y SMALLINT,
  p_color SMALLINT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_trust INT;
  v_cooldown_seconds INT;
  v_last_placed TIMESTAMPTZ;
  v_pixel_offset INT;
  v_current_pixels BYTEA;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN FALSE; END IF;

  -- Trust-based cooldown
  SELECT trust_score INTO v_trust FROM users WHERE id = v_user_id;
  v_cooldown_seconds := CASE
    WHEN COALESCE(v_trust, 0) >= 150 THEN 5    -- legend: 5s
    WHEN COALESCE(v_trust, 0) >= 120 THEN 10   -- elite: 10s
    WHEN COALESCE(v_trust, 0) >= 90  THEN 15   -- verified: 15s
    WHEN COALESCE(v_trust, 0) >= 70  THEN 30   -- trusted: 30s
    WHEN COALESCE(v_trust, 0) >= 50  THEN 60   -- newbie: 60s
    ELSE 0                                       -- restricted: cannot place
  END;

  IF v_cooldown_seconds = 0 THEN RETURN FALSE; END IF;

  -- Rate limit check
  SELECT MAX(created_at) INTO v_last_placed
  FROM pixel_log WHERE user_id = v_user_id;

  IF v_last_placed IS NOT NULL
     AND v_last_placed + (v_cooldown_seconds || ' seconds')::INTERVAL > NOW()
  THEN
    RETURN FALSE;
  END IF;

  -- Bounds check
  IF p_x < 0 OR p_x >= 64 OR p_y < 0 OR p_y >= 64 OR p_color < 0 OR p_color >= 8 THEN
    RETURN FALSE;
  END IF;

  -- Calculate pixel offset
  v_pixel_offset := p_y * 64 + p_x;

  -- Get or initialize canvas
  SELECT pixels INTO v_current_pixels
  FROM city_canvas WHERE city_id = p_city_id FOR UPDATE;

  IF v_current_pixels IS NULL THEN
    -- Initialize: all pixels = color 0 (white)
    v_current_pixels := decode(repeat('00', 4096), 'hex');
    INSERT INTO city_canvas (city_id, pixels)
    VALUES (p_city_id, v_current_pixels)
    ON CONFLICT (city_id) DO NOTHING;
    SELECT pixels INTO v_current_pixels
    FROM city_canvas WHERE city_id = p_city_id FOR UPDATE;
  END IF;

  -- Set the pixel byte
  v_current_pixels := set_byte(v_current_pixels, v_pixel_offset, p_color);

  UPDATE city_canvas
  SET pixels = v_current_pixels,
      version = version + 1,
      updated_at = NOW()
  WHERE city_id = p_city_id;

  -- Log for Realtime broadcast
  INSERT INTO pixel_log (city_id, x, y, color, user_id)
  VALUES (p_city_id, p_x, p_y, p_color, v_user_id);

  RETURN TRUE;
END;
$$;

-- 6. get_canvas RPC — returns base64-encoded pixels
CREATE OR REPLACE FUNCTION get_canvas(p_city_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'city_id', city_id,
    'pixels', encode(pixels, 'base64'),
    'version', version,
    'updated_at', updated_at
  ) INTO v_result
  FROM city_canvas
  WHERE city_id = p_city_id;

  -- If no canvas exists yet, return empty (all white)
  IF v_result IS NULL THEN
    v_result := jsonb_build_object(
      'city_id', p_city_id,
      'pixels', encode(decode(repeat('00', 4096), 'hex'), 'base64'),
      'version', 0,
      'updated_at', NOW()
    );
  END IF;

  RETURN v_result;
END;
$$;

-- 7. Cleanup: delete pixel_log entries older than 24h
CREATE OR REPLACE FUNCTION cleanup_pixel_log()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM pixel_log WHERE created_at < NOW() - INTERVAL '24 hours';
END;
$$;

-- pg_cron (Pro tier only):
-- SELECT cron.schedule('cleanup-pixel-log', '0 */6 * * *', 'SELECT cleanup_pixel_log()');
