-- ============================================================
-- 020: Global Locations — regions, countries, cities hierarchy
-- Foundation for global map system. TR seed data included.
-- ============================================================

-- 1. Regions (continents)
CREATE TABLE IF NOT EXISTS regions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
);

INSERT INTO regions (id, name, emoji, sort_order) VALUES
  ('europe',    'Avrupa',       '🇪🇺', 1),
  ('asia',      'Asya',         '🌏', 2),
  ('americas',  'Amerika',      '🌎', 3),
  ('africa',    'Afrika',       '🌍', 4),
  ('oceania',   'Okyanusya',    '🏝️', 5),
  ('middle_east','Orta Dogu',   '🕌', 6)
ON CONFLICT (id) DO NOTHING;

-- 2. Countries
CREATE TABLE IF NOT EXISTS countries (
  id TEXT PRIMARY KEY,               -- ISO 3166-1 alpha-2: 'TR', 'DE', 'US'
  region_id TEXT NOT NULL REFERENCES regions(id),
  name TEXT NOT NULL,                -- Local name: 'Turkiye'
  name_en TEXT NOT NULL,             -- English: 'Turkey'
  emoji TEXT NOT NULL,               -- Flag emoji
  timezone TEXT NOT NULL,            -- Primary timezone
  is_active BOOLEAN DEFAULT FALSE,   -- Staged rollout
  sort_order INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_countries_region ON countries(region_id);

INSERT INTO countries (id, region_id, name, name_en, emoji, timezone, is_active, sort_order) VALUES
  ('TR', 'europe',     'Turkiye',    'Turkey',      '🇹🇷', 'Europe/Istanbul', TRUE, 1),
  ('DE', 'europe',     'Almanya',    'Germany',     '🇩🇪', 'Europe/Berlin',   FALSE, 2),
  ('NL', 'europe',     'Hollanda',   'Netherlands', '🇳🇱', 'Europe/Amsterdam',FALSE, 3),
  ('GB', 'europe',     'Ingiltere',  'United Kingdom','🇬🇧','Europe/London',  FALSE, 4),
  ('US', 'americas',   'ABD',        'United States','🇺🇸', 'America/New_York',FALSE, 5),
  ('JP', 'asia',       'Japonya',    'Japan',       '🇯🇵', 'Asia/Tokyo',      FALSE, 6),
  ('KR', 'asia',       'Guney Kore', 'South Korea', '🇰🇷', 'Asia/Seoul',      FALSE, 7),
  ('AE', 'middle_east','BAE',        'UAE',         '🇦🇪', 'Asia/Dubai',      FALSE, 8)
ON CONFLICT (id) DO NOTHING;

-- 3. Cities
CREATE TABLE IF NOT EXISTS cities (
  id TEXT PRIMARY KEY,
  country_id TEXT NOT NULL REFERENCES countries(id),
  name TEXT NOT NULL,
  emoji TEXT NOT NULL,
  timezone TEXT NOT NULL,
  population_tier TEXT NOT NULL CHECK (population_tier IN ('mega', 'large', 'medium', 'small')),
  lng FLOAT,
  lat FLOAT,
  is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_cities_country ON cities(country_id);

-- TR cities (matching existing CITIES[] IDs exactly)
INSERT INTO cities (id, country_id, name, emoji, timezone, population_tier, lng, lat) VALUES
  ('istanbul',   'TR', 'Istanbul',    '🌉', 'Europe/Istanbul', 'mega',   28.9784, 41.0082),
  ('ankara',     'TR', 'Ankara',      '🏛️', 'Europe/Istanbul', 'large',  32.8597, 39.9334),
  ('izmir',      'TR', 'Izmir',       '🌊', 'Europe/Istanbul', 'large',  27.1428, 38.4237),
  ('bursa',      'TR', 'Bursa',       '🏔️', 'Europe/Istanbul', 'medium', 29.0610, 40.1885),
  ('antalya',    'TR', 'Antalya',     '☀️', 'Europe/Istanbul', 'medium', 30.7133, 36.8969),
  ('adana',      'TR', 'Adana',       '🌶️', 'Europe/Istanbul', 'medium', 35.3308, 37.0000),
  ('konya',      'TR', 'Konya',       '🌾', 'Europe/Istanbul', 'medium', 32.4846, 37.8746),
  ('gaziantep',  'TR', 'Gaziantep',   '🍢', 'Europe/Istanbul', 'medium', 37.3781, 37.0662),
  ('diyarbakir', 'TR', 'Diyarbakir',  '🧱', 'Europe/Istanbul', 'medium', 40.2189, 37.9144),
  ('eskisehir',  'TR', 'Eskisehir',   '🎓', 'Europe/Istanbul', 'medium', 30.5206, 39.7767),
  ('trabzon',    'TR', 'Trabzon',     '🍵', 'Europe/Istanbul', 'medium', 39.7168, 41.0027),
  ('kayseri',    'TR', 'Kayseri',     '🏔️', 'Europe/Istanbul', 'medium', 35.4894, 38.7312),
  ('other_tr',   'TR', 'Diger (TR)',  '🇹🇷', 'Europe/Istanbul', 'small',  35.0,    39.0),
  ('abroad',     'TR', 'Yurt Disi',   '🌍', 'UTC',             'small',  10.0,    50.0)
ON CONFLICT (id) DO NOTHING;

-- 4. RLS
ALTER TABLE regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE cities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Regions readable by all" ON regions;
CREATE POLICY "Regions readable by all" ON regions FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "Countries readable by all" ON countries;
CREATE POLICY "Countries readable by all" ON countries FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "Cities readable by all" ON cities;
CREATE POLICY "Cities readable by all" ON cities FOR SELECT USING (TRUE);

-- 5. get_active_cities RPC — returns cities with activity for a country
CREATE OR REPLACE FUNCTION get_active_cities(p_country_id TEXT DEFAULT 'TR')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::JSONB)
  INTO v_result
  FROM (
    SELECT
      c.id,
      c.name,
      c.emoji,
      c.lng,
      c.lat,
      c.population_tier,
      COALESCE(stats.active_now, 0) AS active_now,
      COALESCE(stats.today_minutes, 0) AS today_minutes
    FROM cities c
    LEFT JOIN (
      SELECT
        (u.metadata->>'city') AS city_id,
        COUNT(DISTINCT CASE
          WHEN sp.status IN ('active', 'joined')
            AND s.started_at + (s.duration || ' minutes')::INTERVAL > NOW()
          THEN sp.user_id
        END)::INT AS active_now,
        COALESCE(SUM(CASE
          WHEN sp.status = 'completed' AND s.started_at::DATE = CURRENT_DATE
          THEN s.duration
        END), 0)::INT AS today_minutes
      FROM users u
      JOIN session_participants sp ON sp.user_id = u.id
      JOIN sessions s ON s.id = sp.session_id
      WHERE (u.metadata->>'city') IS NOT NULL
      GROUP BY (u.metadata->>'city')
    ) stats ON stats.city_id = c.id
    WHERE c.country_id = p_country_id AND c.is_active = TRUE
    ORDER BY COALESCE(stats.active_now, 0) DESC, c.name
  ) t;

  RETURN v_result;
END;
$$;
