-- ============================================================
-- 018: City Wars Stream — Leaderboard + Stream RPCs
-- City leaderboard, enhanced atmosphere, stream events
-- ============================================================

-- -------------------------------------------------------
-- 1. City Leaderboard RPC
-- Returns top 10 users for a city (this week)
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION get_city_leaderboard(p_city_id TEXT)
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
      u.name AS user_name,
      SUM(s.duration) AS total_minutes,
      COUNT(*)::INT AS sessions,
      ROW_NUMBER() OVER (ORDER BY SUM(s.duration) DESC) AS rank
    FROM session_participants sp
    JOIN sessions s ON s.id = sp.session_id
    JOIN users u ON u.id = sp.user_id
    WHERE sp.status = 'completed'
      AND s.started_at >= DATE_TRUNC('week', NOW())
      AND (u.metadata->>'city') = p_city_id
    GROUP BY u.id, u.name
    ORDER BY total_minutes DESC
    LIMIT 10
  ) t;

  RETURN v_result;
END;
$$;

-- -------------------------------------------------------
-- 2. Enhanced get_city_atmosphere (overwrite existing)
-- Now returns all cities when p_city_id is NULL
-- Includes: active_now, today_minutes, mood, week_minutes
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION get_city_atmosphere(p_city_id TEXT DEFAULT NULL)
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
      city_id,
      active_now,
      today_minutes,
      yesterday_minutes,
      week_minutes,
      CASE
        WHEN active_now >= 10 THEN 'rising'
        WHEN active_now >= 3 THEN 'awakening'
        WHEN active_now >= 1 THEN 'steady'
        ELSE 'quiet'
      END AS mood
    FROM (
      SELECT
        (u.metadata->>'city') AS city_id,
        COUNT(CASE
          WHEN sp.status IN ('active', 'joined')
            AND s.started_at IS NOT NULL
            AND s.started_at + (s.duration || ' minutes')::INTERVAL > NOW()
          THEN 1
        END)::INT AS active_now,
        COALESCE(SUM(CASE
          WHEN s.started_at::DATE = CURRENT_DATE
            AND sp.status = 'completed'
          THEN s.duration
        END), 0)::INT AS today_minutes,
        COALESCE(SUM(CASE
          WHEN s.started_at::DATE = CURRENT_DATE - INTERVAL '1 day'
            AND sp.status = 'completed'
          THEN s.duration
        END), 0)::INT AS yesterday_minutes,
        COALESCE(SUM(CASE
          WHEN s.started_at >= DATE_TRUNC('week', NOW())
            AND sp.status = 'completed'
          THEN s.duration
        END), 0)::INT AS week_minutes
      FROM users u
      JOIN session_participants sp ON sp.user_id = u.id
      JOIN sessions s ON s.id = sp.session_id
      WHERE (u.metadata->>'city') IS NOT NULL
        AND (p_city_id IS NULL OR (u.metadata->>'city') = p_city_id)
      GROUP BY (u.metadata->>'city')
    ) sub
    WHERE city_id IS NOT NULL
    ORDER BY active_now DESC, today_minutes DESC
  ) t;

  RETURN v_result;
END;
$$;

-- -------------------------------------------------------
-- 3. Stream events table (for future real-time events)
-- Lightweight event log for chat/stream display
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS stream_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'session_started', 'session_completed', 'session_milestone',
    'city_activity_change', 'city_milestone', 'user_message'
  )),
  city_id TEXT NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  priority INT NOT NULL DEFAULT 2,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for recent events query
CREATE INDEX IF NOT EXISTS idx_stream_events_created
  ON stream_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stream_events_city
  ON stream_events (city_id, created_at DESC);

-- RLS: anyone can read stream events
ALTER TABLE stream_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Stream events readable by all" ON stream_events;
CREATE POLICY "Stream events readable by all"
  ON stream_events FOR SELECT
  USING (true);

-- Add to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE stream_events;

-- -------------------------------------------------------
-- 4. Emit stream event on session completion (trigger)
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION emit_stream_event_on_session()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_city TEXT;
  v_user_name TEXT;
BEGIN
  -- Only on status change to 'completed' or 'active'
  IF NEW.status IN ('completed', 'active') AND
     (OLD.status IS NULL OR OLD.status != NEW.status) THEN

    SELECT u.metadata->>'city', u.name
    INTO v_city, v_user_name
    FROM users u
    WHERE u.id = NEW.user_id;

    IF v_city IS NOT NULL THEN
      INSERT INTO stream_events (event_type, city_id, user_id, message, priority)
      VALUES (
        CASE WHEN NEW.status = 'active' THEN 'session_started'
             ELSE 'session_completed'
        END,
        v_city,
        NEW.user_id,
        CASE WHEN NEW.status = 'active' THEN v_user_name || ' başladı'
             ELSE v_user_name || ' tamamladı'
        END,
        CASE WHEN NEW.status = 'active' THEN 2 ELSE 3 END
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS trg_stream_event_participant ON session_participants;

CREATE TRIGGER trg_stream_event_participant
  AFTER INSERT OR UPDATE ON session_participants
  FOR EACH ROW
  EXECUTE FUNCTION emit_stream_event_on_session();

-- -------------------------------------------------------
-- 5. Cleanup old stream events (keep last 7 days)
-- Can be called via cron or manually
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION cleanup_old_stream_events()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM stream_events
  WHERE created_at < NOW() - INTERVAL '7 days';
END;
$$;

-- -------------------------------------------------------
-- 6. pg_cron scheduled cleanup (Supabase Pro+ only)
-- On free tier: call cleanup_old_stream_events() manually
-- or via Supabase Edge Function on a schedule.
-- -------------------------------------------------------
-- Uncomment if pg_cron extension is available:
-- SELECT cron.schedule(
--   'cleanup-stream-events',
--   '0 4 * * *',  -- daily at 04:00 UTC
--   'SELECT cleanup_old_stream_events()'
-- );
