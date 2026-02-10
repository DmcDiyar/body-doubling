-- ============================================================
-- 022: Global Events — Scheduled events + milestone detection
-- Focus hours, country challenges, canvas reveals, announcements
-- ============================================================

-- 1. Global events table
CREATE TABLE IF NOT EXISTS global_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'focus_hour',
    'country_challenge',
    'canvas_reveal',
    'system_announcement'
  )),
  title TEXT NOT NULL,
  description TEXT,

  -- Lifecycle
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN (
    'scheduled', 'active', 'completed', 'cancelled'
  )),

  -- Targeting
  scope TEXT NOT NULL DEFAULT 'global' CHECK (scope IN ('global', 'country', 'city')),
  target_id TEXT,                -- NULL = global, 'TR' = country, 'istanbul' = city

  -- Config
  config JSONB NOT NULL DEFAULT '{}'::JSONB,

  -- Metrics (updated after event ends)
  participant_count INT DEFAULT 0,
  total_minutes INT DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_global_events_status
  ON global_events (status, starts_at);

CREATE INDEX IF NOT EXISTS idx_global_events_active
  ON global_events (status) WHERE status = 'active';

-- Only 1 active global event at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_global
  ON global_events (scope) WHERE status = 'active' AND scope = 'global';

-- 2. RLS
ALTER TABLE global_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Global events readable by all" ON global_events;
CREATE POLICY "Global events readable by all"
  ON global_events FOR SELECT USING (TRUE);

-- 3. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE global_events;

-- 4. Update stream_events CHECK to include new event types
ALTER TABLE stream_events DROP CONSTRAINT IF EXISTS stream_events_event_type_check;
ALTER TABLE stream_events ADD CONSTRAINT stream_events_event_type_check
CHECK (event_type IN (
  -- Existing
  'session_started', 'session_completed', 'session_milestone',
  'city_activity_change', 'city_milestone', 'user_message',
  -- New: global events
  'global_focus_hour',
  'country_challenge',
  'canvas_reveal',
  'system_announcement'
));

-- 5. Activate scheduled events + complete expired ones
CREATE OR REPLACE FUNCTION activate_scheduled_events()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event RECORD;
BEGIN
  -- Activate scheduled events whose start time has passed
  FOR v_event IN
    SELECT id, event_type, title, scope, target_id
    FROM global_events
    WHERE status = 'scheduled' AND starts_at <= NOW()
  LOOP
    UPDATE global_events SET status = 'active' WHERE id = v_event.id;

    -- Broadcast to stream_events
    INSERT INTO stream_events (event_type, city_id, message, priority)
    VALUES (
      CASE v_event.event_type
        WHEN 'focus_hour' THEN 'global_focus_hour'
        WHEN 'country_challenge' THEN 'country_challenge'
        WHEN 'canvas_reveal' THEN 'canvas_reveal'
        ELSE 'system_announcement'
      END,
      COALESCE(v_event.target_id, 'global'),
      v_event.title,
      5
    );
  END LOOP;

  -- Complete expired active events
  UPDATE global_events SET status = 'completed'
  WHERE status = 'active' AND ends_at <= NOW();
END;
$$;

-- 6. Get active/upcoming events
CREATE OR REPLACE FUNCTION get_global_events(p_include_completed BOOLEAN DEFAULT FALSE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.starts_at), '[]'::JSONB)
  INTO v_result
  FROM (
    SELECT
      id, event_type, title, description,
      starts_at, ends_at, status, scope, target_id,
      config, participant_count, total_minutes
    FROM global_events
    WHERE status IN ('scheduled', 'active')
       OR (p_include_completed AND status = 'completed' AND ends_at > NOW() - INTERVAL '24 hours')
    ORDER BY starts_at
    LIMIT 20
  ) t;

  RETURN v_result;
END;
$$;

-- 7. Check global milestones (call periodically)
CREATE OR REPLACE FUNCTION check_global_milestones()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_active INT;
  v_city_record RECORD;
BEGIN
  -- Global milestone: 100+ simultaneous users
  SELECT COUNT(DISTINCT sp.user_id) INTO v_total_active
  FROM session_participants sp
  JOIN sessions s ON s.id = sp.session_id
  WHERE sp.status IN ('active', 'joined')
    AND s.started_at + (s.duration || ' minutes')::INTERVAL > NOW();

  IF v_total_active >= 100 AND NOT EXISTS (
    SELECT 1 FROM stream_events
    WHERE event_type = 'city_milestone'
      AND message LIKE '%' || v_total_active::TEXT || ' kisi%'
      AND created_at > NOW() - INTERVAL '1 hour'
  ) THEN
    INSERT INTO stream_events (event_type, city_id, message, priority)
    VALUES ('city_milestone', 'global',
            v_total_active || ' kisi ayni anda odaklaniyor!', 5);
  END IF;

  -- City milestone: 10+ active in a city
  FOR v_city_record IN
    SELECT (u.metadata->>'city') AS city_id, COUNT(DISTINCT sp.user_id) AS cnt
    FROM session_participants sp
    JOIN sessions s ON s.id = sp.session_id
    JOIN users u ON u.id = sp.user_id
    WHERE sp.status IN ('active', 'joined')
      AND s.started_at + (s.duration || ' minutes')::INTERVAL > NOW()
      AND (u.metadata->>'city') IS NOT NULL
    GROUP BY (u.metadata->>'city')
    HAVING COUNT(DISTINCT sp.user_id) >= 10
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM stream_events
      WHERE event_type = 'city_milestone'
        AND city_id = v_city_record.city_id
        AND created_at > NOW() - INTERVAL '1 hour'
    ) THEN
      INSERT INTO stream_events (event_type, city_id, message, priority)
      VALUES ('city_milestone', v_city_record.city_id,
              v_city_record.cnt || ' kisi sehrinden odaklaniyor!', 4);
    END IF;
  END LOOP;
END;
$$;

-- 8. Seed: One example global event (scheduled for testing)
INSERT INTO global_events (event_type, title, description, starts_at, ends_at, scope, config)
VALUES (
  'focus_hour',
  'Global Odak Saati',
  'Tum dunyada 25 dakika birlikte odaklaniyoruz!',
  NOW() + INTERVAL '1 hour',
  NOW() + INTERVAL '1 hour 25 minutes',
  'global',
  '{"duration": 25, "theme": "focus_hour"}'::JSONB
) ON CONFLICT DO NOTHING;
