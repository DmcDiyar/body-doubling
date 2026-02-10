-- ============================================================
-- 023: Materialized Views + Refresh
-- Pre-computed aggregate stats for fast map rendering
-- Refresh every 5 min via Edge Function or manual call
-- ============================================================

-- 1. Materialized view: location activity stats
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_location_stats AS
SELECT
  c.country_id,
  c.id AS city_id,
  COUNT(DISTINCT CASE
    WHEN sp.status IN ('active', 'joined')
      AND s.started_at + (s.duration || ' minutes')::INTERVAL > NOW()
    THEN sp.user_id
  END)::INT AS active_now,
  COALESCE(SUM(CASE
    WHEN sp.status = 'completed' AND s.started_at::DATE = CURRENT_DATE
    THEN s.duration
  END), 0)::INT AS today_minutes,
  COALESCE(SUM(CASE
    WHEN sp.status = 'completed' AND s.started_at >= DATE_TRUNC('week', NOW())
    THEN s.duration
  END), 0)::INT AS week_minutes
FROM cities c
LEFT JOIN users u ON (u.metadata->>'city') = c.id
LEFT JOIN session_participants sp ON sp.user_id = u.id
LEFT JOIN sessions s ON s.id = sp.session_id
WHERE c.is_active = TRUE
GROUP BY c.country_id, c.id;

-- Unique index required for CONCURRENTLY refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_location_stats_city
  ON mv_location_stats (city_id);

-- 2. Refresh function
CREATE OR REPLACE FUNCTION refresh_location_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_location_stats;
END;
$$;

-- 3. Country-level aggregate view
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_country_stats AS
SELECT
  co.id AS country_id,
  co.name,
  co.emoji,
  co.region_id,
  COALESCE(SUM(ls.active_now), 0)::INT AS active_now,
  COALESCE(SUM(ls.today_minutes), 0)::INT AS today_minutes,
  COALESCE(SUM(ls.week_minutes), 0)::INT AS week_minutes
FROM countries co
LEFT JOIN mv_location_stats ls ON ls.country_id = co.id
WHERE co.is_active = TRUE
GROUP BY co.id, co.name, co.emoji, co.region_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_country_stats_id
  ON mv_country_stats (country_id);

-- 4. Refresh country stats
CREATE OR REPLACE FUNCTION refresh_country_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_location_stats;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_country_stats;
END;
$$;

-- 5. get_map_data RPC — unified endpoint for map rendering
CREATE OR REPLACE FUNCTION get_map_data(p_level TEXT DEFAULT 'country', p_country_id TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF p_level = 'world' THEN
    -- Country-level aggregates
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::JSONB)
    INTO v_result
    FROM (
      SELECT country_id, name, emoji, region_id, active_now, today_minutes, week_minutes
      FROM mv_country_stats
      ORDER BY active_now DESC, today_minutes DESC
    ) t;
  ELSE
    -- City-level for a specific country
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::JSONB)
    INTO v_result
    FROM (
      SELECT
        ls.city_id,
        c.name,
        c.emoji,
        c.lng,
        c.lat,
        c.population_tier,
        ls.active_now,
        ls.today_minutes,
        ls.week_minutes
      FROM mv_location_stats ls
      JOIN cities c ON c.id = ls.city_id
      WHERE ls.country_id = COALESCE(p_country_id, 'TR')
      ORDER BY ls.active_now DESC, ls.today_minutes DESC
    ) t;
  END IF;

  RETURN v_result;
END;
$$;

-- pg_cron (Pro tier only):
-- SELECT cron.schedule('refresh-location-stats', '*/5 * * * *', 'SELECT refresh_country_stats()');
