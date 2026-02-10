-- ============================================================
-- 024: Rich Seed Data + display_name column
-- Zengin chat akisi: sehir + isim + mesaj formati
-- Saatlik yayilan, gercekci Turkce mesajlar
-- ============================================================

-- 1. Add display_name column for showing user names in chat
ALTER TABLE stream_events ADD COLUMN IF NOT EXISTS display_name TEXT;

-- 2. Update send_user_message to auto-populate display_name
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
  v_name TEXT;
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

  -- Get display name from auth metadata
  SELECT COALESCE(
    raw_user_meta_data->>'full_name',
    raw_user_meta_data->>'name',
    split_part(email, '@', 1)
  ) INTO v_name FROM auth.users WHERE id = v_user_id;

  -- Insert message with display name
  INSERT INTO stream_events (event_type, city_id, user_id, display_name, message, priority)
  VALUES ('user_message', p_city_id, v_user_id, v_name, p_message, 2);

  RETURN TRUE;
END;
$$;

-- 3. Delete old basic seed data (no display_name = old seed)
DELETE FROM stream_events WHERE user_id IS NULL;

-- 4. Rich seed data — 24 saate yayilan gercekci mesajlar
-- Her saat farkli sehirler, isimler, aktiviteler
INSERT INTO stream_events (event_type, city_id, display_name, message, priority, created_at) VALUES

-- ═══ GECE (00:00 - 06:00) — Gece kuslari ═══
('session_started',   'istanbul',   'Emre',    'gece kusu modunda (50dk)', 2, NOW() - INTERVAL '23 hours'),
('user_message',      'ankara',     'Zeynep',  '☕ Gece calismasi baslasin', 2, NOW() - INTERVAL '22 hours 45 minutes'),
('session_completed', 'istanbul',   'Emre',    '50dk tamamladi! Gece verimi harika', 3, NOW() - INTERVAL '22 hours 10 minutes'),
('session_started',   'izmir',      'Deniz',   'uyku tutmadi, odak zamani (25dk)', 2, NOW() - INTERVAL '21 hours 30 minutes'),
('user_message',      'eskisehir',  'Kaan',    '🌙 Gece sessizliginde calisiyorum', 2, NOW() - INTERVAL '21 hours'),
('session_completed', 'izmir',      'Deniz',   '25dk seansini tamamladi', 3, NOW() - INTERVAL '21 hours 5 minutes'),
('session_started',   'trabzon',    'Yusuf',   'erken kalktim, basliyorum (25dk)', 2, NOW() - INTERVAL '20 hours'),

-- ═══ SABAH (06:00 - 09:00) — Sabahci takim ═══
('city_activity_change', 'istanbul', NULL,      'sabah enerjisi yukseliyor', 4, NOW() - INTERVAL '19 hours'),
('session_started',   'ankara',     'Ayse',    'gunaydin! ilk seans (25dk)', 2, NOW() - INTERVAL '18 hours 50 minutes'),
('session_started',   'istanbul',   'Burak',   'sabah rutini basladi (50dk)', 2, NOW() - INTERVAL '18 hours 30 minutes'),
('user_message',      'konya',      'Fatma',   '🌅 Gunaydinn herkese', 2, NOW() - INTERVAL '18 hours 20 minutes'),
('session_started',   'gaziantep',  'Ali',     'kahve hazir, basliyorum (25dk)', 2, NOW() - INTERVAL '18 hours'),
('session_completed', 'ankara',     'Ayse',    'ilk seans tamam! Enerjik baslangic', 3, NOW() - INTERVAL '18 hours 25 minutes'),
('session_started',   'bursa',      'Selin',   'sabah yogasi bitti, odak zamani (25dk)', 2, NOW() - INTERVAL '17 hours 40 minutes'),
('user_message',      'istanbul',   'Merve',   '🚀 Bugun 3 seans hedefliyorum', 2, NOW() - INTERVAL '17 hours 30 minutes'),
('session_completed', 'gaziantep',  'Ali',     '25dk tamamladi, harika baslangic!', 3, NOW() - INTERVAL '17 hours 35 minutes'),
('session_started',   'diyarbakir', 'Mehmet',  'sabah seansina girdi (25dk)', 2, NOW() - INTERVAL '17 hours'),
('city_activity_change', 'ankara',  NULL,       'sabah yogunlugu basliyor', 4, NOW() - INTERVAL '17 hours 15 minutes'),

-- ═══ KUSLUK (09:00 - 12:00) — Yogun calisma ═══
('session_started',   'istanbul',   'Oguz',    'derin odak basladi (90dk)', 2, NOW() - INTERVAL '16 hours'),
('session_completed', 'bursa',      'Selin',   'sabah seansi tamam 💪', 3, NOW() - INTERVAL '15 hours 50 minutes'),
('session_started',   'izmir',      'Ceren',   'proje teslimi icin sprint (50dk)', 2, NOW() - INTERVAL '15 hours 30 minutes'),
('user_message',      'ankara',     'Baris',   '🎯 Bugun deadline var, full fokus', 2, NOW() - INTERVAL '15 hours 20 minutes'),
('session_started',   'antalya',    'Irem',    'tez calismasi (50dk)', 2, NOW() - INTERVAL '15 hours'),
('session_completed', 'diyarbakir', 'Mehmet',  '25dk tamamladi!', 3, NOW() - INTERVAL '14 hours 35 minutes'),
('city_milestone',    'istanbul',   NULL,       'Istanbul bu saat 20+ aktif kullanici!', 5, NOW() - INTERVAL '14 hours 30 minutes'),
('session_started',   'konya',      'Ahmet',   'basladi (25dk)', 2, NOW() - INTERVAL '14 hours'),
('session_completed', 'istanbul',   'Oguz',    '90dk maraton bitti! Efsane verim', 3, NOW() - INTERVAL '14 hours 30 minutes'),
('user_message',      'trabzon',    'Derya',   '💪 3. seansima girdim bugun', 2, NOW() - INTERVAL '14 hours 15 minutes'),
('session_started',   'kayseri',    'Tolga',   'ogle oncesi son sprint (25dk)', 2, NOW() - INTERVAL '13 hours 30 minutes'),

-- ═══ OGLE (12:00 - 14:00) — Ogle molasi sonrasi ═══
('user_message',      'istanbul',   'Elif',    '🍵 Ogle molasi, birazdan devam', 2, NOW() - INTERVAL '13 hours'),
('session_started',   'ankara',     'Murat',   'ogle sonrasi odak (25dk)', 2, NOW() - INTERVAL '12 hours 30 minutes'),
('session_completed', 'konya',      'Ahmet',   '25dk tamamladi, devam edecek', 3, NOW() - INTERVAL '12 hours 35 minutes'),
('session_started',   'konya',      'Ahmet',   'ikinci tur basladi (25dk)', 2, NOW() - INTERVAL '12 hours 20 minutes'),
('session_started',   'istanbul',   'Nisa',    'kahve molasi bitti, devam (50dk)', 2, NOW() - INTERVAL '12 hours'),
('city_activity_change', 'izmir',   NULL,       'ogle sonrasi hareketleniyor', 4, NOW() - INTERVAL '11 hours 50 minutes'),
('session_completed', 'izmir',      'Ceren',   '50dk sprint bitti! Teslim tamam 🎉', 3, NOW() - INTERVAL '11 hours 40 minutes'),

-- ═══ OGLEDEN SONRA (14:00 - 17:00) — Verimli saatler ═══
('session_started',   'gaziantep',  'Buse',    'antep kahvesi hazir, odak zamani (25dk)', 2, NOW() - INTERVAL '11 hours'),
('session_completed', 'ankara',     'Murat',   'seans tamamlandi, bir tane daha!', 3, NOW() - INTERVAL '10 hours 5 minutes'),
('session_started',   'adana',      'Can',     'sicakta odak (25dk)', 2, NOW() - INTERVAL '10 hours'),
('user_message',      'istanbul',   'Burak',   '✅ Bugunun 2. seansi tamam', 2, NOW() - INTERVAL '9 hours 50 minutes'),
('session_started',   'eskisehir',  'Ece',     'kutuphane seansi (50dk)', 2, NOW() - INTERVAL '9 hours 30 minutes'),
('session_completed', 'konya',      'Ahmet',   'ikinci seans da tamam! 🔥', 3, NOW() - INTERVAL '9 hours 55 minutes'),
('session_started',   'istanbul',   'Selin',   'aksama kadar son sprint (25dk)', 2, NOW() - INTERVAL '9 hours'),
('city_activity_change', 'istanbul', NULL,      'ogleden sonra yogunlugu zirvede', 4, NOW() - INTERVAL '8 hours 50 minutes'),
('session_completed', 'adana',      'Can',     '25dk tamamlandi', 3, NOW() - INTERVAL '8 hours 35 minutes'),
('session_started',   'trabzon',    'Yusuf',   'ucuncu seans, bugun formda (25dk)', 2, NOW() - INTERVAL '8 hours'),
('user_message',      'bursa',      'Deniz',   '🤝 Birlikte calisinca daha verimli', 2, NOW() - INTERVAL '7 hours 40 minutes'),

-- ═══ AKSAM (17:00 - 20:00) — Aksam seanslari ═══
('session_completed', 'eskisehir',  'Ece',     '50dk kutuphane seansi bitti!', 3, NOW() - INTERVAL '7 hours 30 minutes'),
('session_started',   'ankara',     'Zeynep',  'is cikisi odak (25dk)', 2, NOW() - INTERVAL '7 hours'),
('session_started',   'istanbul',   'Emre',    'aksam seansi (50dk)', 2, NOW() - INTERVAL '6 hours 30 minutes'),
('user_message',      'izmir',      'Ceren',   '🎯 Aksam rutinine basladim', 2, NOW() - INTERVAL '6 hours 20 minutes'),
('session_started',   'diyarbakir', 'Baris',   'aksam calismasi (25dk)', 2, NOW() - INTERVAL '6 hours'),
('city_milestone',    'ankara',     NULL,       'Ankara bugun 50 seansi gecti!', 5, NOW() - INTERVAL '5 hours 50 minutes'),
('session_completed', 'ankara',     'Zeynep',  'is sonrasi seans tamam, rahatladim', 3, NOW() - INTERVAL '5 hours 35 minutes'),
('session_started',   'antalya',    'Tolga',   'deniz manzarasinda odak (25dk)', 2, NOW() - INTERVAL '5 hours 15 minutes'),
('session_started',   'konya',      'Fatma',   'aksam seansi (25dk)', 2, NOW() - INTERVAL '5 hours'),
('user_message',      'gaziantep',  'Ali',     '💪 Bugun 4 seans yaptim!', 2, NOW() - INTERVAL '4 hours 40 minutes'),

-- ═══ GECE BASLANGICI (20:00 - 23:00) — Son aktiviteler ═══
('session_completed', 'istanbul',   'Emre',    '50dk aksam seansi tamam!', 3, NOW() - INTERVAL '4 hours 30 minutes'),
('session_started',   'istanbul',   'Merve',   'son seans, gunun kapanisi (25dk)', 2, NOW() - INTERVAL '4 hours'),
('session_started',   'izmir',      'Deniz',   'gece seansi (25dk)', 2, NOW() - INTERVAL '3 hours 30 minutes'),
('user_message',      'ankara',     'Murat',   '🌙 Son bir seans daha', 2, NOW() - INTERVAL '3 hours 15 minutes'),
('session_completed', 'konya',      'Fatma',   'gunun 3. seansi tamam! Harika gun', 3, NOW() - INTERVAL '3 hours'),
('session_started',   'bursa',      'Oguz',    'gece calismasi basladi (50dk)', 2, NOW() - INTERVAL '2 hours 45 minutes'),
('city_activity_change', 'istanbul', NULL,      'gece seanslari basliyor', 4, NOW() - INTERVAL '2 hours 30 minutes'),
('session_started',   'kayseri',    'Irem',    'sessiz gece odagi (25dk)', 2, NOW() - INTERVAL '2 hours'),
('session_completed', 'izmir',      'Deniz',   '25dk gece seansi tamamlandi', 3, NOW() - INTERVAL '1 hour 35 minutes'),
('user_message',      'diyarbakir', 'Mehmet',  '🔥 Gece enerjisi baska', 2, NOW() - INTERVAL '1 hour 30 minutes'),
('session_started',   'istanbul',   'Burak',   'son sprint (25dk)', 2, NOW() - INTERVAL '1 hour'),
('session_started',   'ankara',     'Elif',    'gece kusu odagi (25dk)', 2, NOW() - INTERVAL '45 minutes'),
('session_completed', 'kayseri',    'Irem',    'tamamladi! Iyi geceler 🌙', 3, NOW() - INTERVAL '35 minutes'),
('user_message',      'istanbul',   'Nisa',    '✨ Bu topluluk harika, iyi geceler', 2, NOW() - INTERVAL '20 minutes'),
('session_started',   'trabzon',    'Derya',   'odaklaniyorum (25dk)', 2, NOW() - INTERVAL '10 minutes'),
('user_message',      'konya',      'Ahmet',   '🚀 Hadi baslayalim!', 2, NOW() - INTERVAL '5 minutes')

ON CONFLICT DO NOTHING;
