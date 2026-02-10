-- ============================================================
-- 019: Chat Messages — User message RPC + seed events
-- ============================================================

-- 1. send_user_message RPC (rate-limited, 30s cooldown)
CREATE OR REPLACE FUNCTION send_user_message(
  p_city_id TEXT,
  p_message TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_last_msg TIMESTAMPTZ;
  v_trust INT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN FALSE; END IF;

  -- Trust check: restricted users cannot send messages
  SELECT trust_score INTO v_trust FROM users WHERE id = v_user_id;
  IF COALESCE(v_trust, 0) < 50 THEN RETURN FALSE; END IF;

  -- Rate limit: 30s cooldown between messages
  SELECT MAX(created_at) INTO v_last_msg
  FROM stream_events
  WHERE user_id = v_user_id AND event_type = 'user_message';

  IF v_last_msg IS NOT NULL AND v_last_msg + INTERVAL '30 seconds' > NOW() THEN
    RETURN FALSE;
  END IF;

  -- Message length check
  IF char_length(p_message) > 100 OR char_length(p_message) < 1 THEN
    RETURN FALSE;
  END IF;

  -- Insert message
  INSERT INTO stream_events (event_type, city_id, user_id, message, priority)
  VALUES ('user_message', p_city_id, v_user_id, p_message, 2);

  RETURN TRUE;
END;
$$;

-- 2. Seed events — so chat is never empty on first visit
INSERT INTO stream_events (event_type, city_id, user_id, message, priority) VALUES
  ('city_activity_change', 'istanbul', NULL, 'Istanbul uyanıyor... Gunaydin!', 4),
  ('session_started', 'ankara', NULL, 'Yeni bir odak seansi basladi', 2),
  ('user_message', 'izmir', NULL, '🎯 Odaklaniyorum', 2),
  ('city_activity_change', 'istanbul', NULL, 'Aksamustu yogunlugu basliyor', 4),
  ('user_message', 'ankara', NULL, '🚀 Basliyorum', 2),
  ('session_completed', 'bursa', NULL, '25 dakikalik seans tamamlandi', 3),
  ('user_message', 'istanbul', NULL, '💪 Yapabiliriz', 2),
  ('city_milestone', 'istanbul', NULL, 'Istanbul bu hafta 100 saat odak gecti!', 5),
  ('session_started', 'antalya', NULL, '50 dakikalik odak seansi', 2),
  ('user_message', 'diyarbakir', NULL, '🤝 Birlikte guclu', 2),
  ('session_completed', 'trabzon', NULL, 'Seans basariyla tamamlandi', 3),
  ('user_message', 'konya', NULL, '🍵 Cay molasi', 2),
  ('city_activity_change', 'gaziantep', NULL, 'Sabah enerjisi yuksek!', 4),
  ('session_started', 'kayseri', NULL, '25 dakikalik Pomodoro basladi', 2),
  ('user_message', 'eskisehir', NULL, '✅ Bitti! Harika hissediyorum', 2)
ON CONFLICT DO NOTHING;
