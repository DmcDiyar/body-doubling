-- ============================================================
-- 037: P2 ÖZELLİKLER — Sezonluk Sıfırlama, Quest→Aynam, Streak Kurtarma
-- Date: 2026-02-13
-- ============================================================
-- 1. Sezonluk sıfırlama sistemi (90 gün)
-- 2. Streak kurtarma hakkı (ayda 1)
-- 3. Quest → Aynam bağlantısı (quest tamamlama → focus score'a etki)
-- ============================================================


-- ============================================================
-- 1. SEZONLUK SIFIRLAMA SİSTEMİ
-- ============================================================
-- users.season_start_date zaten 034'te eklendi
-- Bu fonksiyon sezon geçişini kontrol eder ve sezon metriklerini sıfırlar

-- Sezon verisi için yeni tablo
CREATE TABLE IF NOT EXISTS public.season_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  season_number INT NOT NULL,
  started_at DATE NOT NULL,
  ended_at DATE NOT NULL,
  -- Sezon istatistikleri (snapshot)
  total_sessions INT NOT NULL DEFAULT 0,
  completed_sessions INT NOT NULL DEFAULT 0,
  total_minutes INT NOT NULL DEFAULT 0,
  max_streak INT NOT NULL DEFAULT 0,
  focus_score_avg INT DEFAULT NULL,
  xp_earned INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_season_history_user ON season_history(user_id, season_number DESC);

ALTER TABLE season_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_seasons" ON season_history
  FOR SELECT USING (auth.uid() = user_id);


-- Sezon geçiş fonksiyonu
CREATE OR REPLACE FUNCTION public.check_season_transition(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user RECORD;
  v_season_days INT;
  v_season_number INT;
  v_season_sessions INT;
  v_season_minutes INT;
  v_season_xp INT;
BEGIN
  SELECT * INTO v_user FROM users WHERE id = p_user_id;
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('transition', false);
  END IF;

  -- Sezon başlangıç tarihi yoksa ayarla
  IF v_user.season_start_date IS NULL THEN
    UPDATE users SET season_start_date = CURRENT_DATE WHERE id = p_user_id;
    RETURN jsonb_build_object('transition', false, 'season_started', true);
  END IF;

  v_season_days := (CURRENT_DATE - v_user.season_start_date);

  -- 90 gün geçmemişse çık
  IF v_season_days < 90 THEN
    RETURN jsonb_build_object(
      'transition', false,
      'days_remaining', 90 - v_season_days,
      'season_day', v_season_days
    );
  END IF;

  -- Kaçıncı sezon?
  SELECT COALESCE(MAX(season_number), 0) + 1
  INTO v_season_number
  FROM season_history WHERE user_id = p_user_id;

  -- Sezon istatistiklerini hesapla (sezon başlangıcından beri)
  SELECT
    COUNT(*),
    COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(sp.left_at, s.ended_at) - sp.joined_at)) / 60.0), 0)::INT
  INTO v_season_sessions, v_season_minutes
  FROM sessions s
  JOIN session_participants sp ON sp.session_id = s.id
  WHERE sp.user_id = p_user_id
    AND sp.status = 'completed'
    AND DATE(s.started_at) >= v_user.season_start_date;

  -- Sezon XP'si
  SELECT COALESCE(SUM(amount), 0) INTO v_season_xp
  FROM xp_ledger
  WHERE user_id = p_user_id
    AND created_at >= v_user.season_start_date::TIMESTAMPTZ;

  -- Sezon geçmişine kaydet
  INSERT INTO season_history (
    user_id, season_number, started_at, ended_at,
    total_sessions, completed_sessions, total_minutes,
    max_streak, xp_earned
  ) VALUES (
    p_user_id, v_season_number, v_user.season_start_date, CURRENT_DATE,
    v_season_sessions, v_season_sessions, v_season_minutes,
    v_user.longest_streak, v_season_xp
  );

  -- Yeni sezon başlat (toplam veriler korunur, sadece season_start_date sıfırlanır)
  UPDATE users SET
    season_start_date = CURRENT_DATE
  WHERE id = p_user_id;

  -- Bildirim
  PERFORM emit_notification(
    p_user_id,
    'season_complete',
    'Sezon ' || v_season_number || ' Tamamlandı! 🏆',
    v_season_sessions || ' seans, ' || v_season_minutes || ' dakika. Yeni sezon başladı!',
    jsonb_build_object(
      'season_number', v_season_number,
      'sessions', v_season_sessions,
      'minutes', v_season_minutes,
      'xp', v_season_xp
    )
  );

  RETURN jsonb_build_object(
    'transition', true,
    'season_number', v_season_number,
    'sessions', v_season_sessions,
    'minutes', v_season_minutes,
    'xp', v_season_xp
  );
END;
$$;


-- ============================================================
-- 2. STREAK KURTARMA HAKKI (Ayda 1)
-- ============================================================

-- users tablosuna streak kurtarma alanları ekle
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS streak_rescues_used INT NOT NULL DEFAULT 0;
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS last_streak_rescue DATE DEFAULT NULL;

CREATE OR REPLACE FUNCTION public.rescue_streak(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user RECORD;
  v_days_since_rescue INT;
  v_previous_streak INT;
BEGIN
  SELECT * INTO v_user FROM users WHERE id = p_user_id;

  IF v_user IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'user_not_found');
  END IF;

  -- Streak zaten aktif mi?
  IF v_user.current_streak > 0 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'streak_active', 'current_streak', v_user.current_streak);
  END IF;

  -- Son kurtarma 30 günden yeni mi?
  IF v_user.last_streak_rescue IS NOT NULL THEN
    v_days_since_rescue := (CURRENT_DATE - v_user.last_streak_rescue);
    IF v_days_since_rescue < 30 THEN
      RETURN jsonb_build_object(
        'success', false,
        'reason', 'cooldown',
        'days_remaining', 30 - v_days_since_rescue
      );
    END IF;
  END IF;

  -- last_session_date dün mü veya bugün mü? (max 1 gün tolerans)
  IF v_user.last_session_date IS NULL OR v_user.last_session_date < CURRENT_DATE - 2 THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'too_late',
      'last_session', v_user.last_session_date
    );
  END IF;

  -- Kurtarma: longest_streak'i tekrar current_streak'e yaz (1 geri al)
  v_previous_streak := GREATEST(1, COALESCE(
    (SELECT current_streak FROM users WHERE id = p_user_id
     -- En son streak değerini tahmin et: last_session_date farkı
    ), 1
  ));

  -- Aslında: dünkü streak = bugün 0 oldu, geri al
  -- Basit yaklaşım: current_streak = 1 (kurtarıldı), kullanıcı bugün seans yaparsa 2 olur
  UPDATE users SET
    current_streak = 1,
    last_session_date = CURRENT_DATE - 1, -- Dün seans yapmış gibi say
    last_streak_rescue = CURRENT_DATE,
    streak_rescues_used = streak_rescues_used + 1
  WHERE id = p_user_id;

  -- Kayıt
  INSERT INTO analytics_events (user_id, event_name, properties)
  VALUES (p_user_id, 'streak_rescued', jsonb_build_object(
    'rescue_number', v_user.streak_rescues_used + 1,
    'previous_longest', v_user.longest_streak
  ));

  -- Bildirim
  PERFORM emit_notification(
    p_user_id,
    'streak_rescued',
    'Serin Kurtarıldı! 🔥',
    'Streak kurtarma hakkını kullandın. Bugün seans yap ve serini devam ettir!',
    '{}'::jsonb
  );

  RETURN jsonb_build_object(
    'success', true,
    'new_streak', 1,
    'rescues_remaining', GREATEST(0, 1 - (v_user.streak_rescues_used + 1) % 1),
    'next_rescue_available', CURRENT_DATE + 30
  );
END;
$$;


-- Streak kurtarma durumunu sorgula
CREATE OR REPLACE FUNCTION public.get_streak_rescue_status(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user RECORD;
  v_available BOOLEAN := true;
  v_days_remaining INT := 0;
BEGIN
  SELECT current_streak, last_streak_rescue, streak_rescues_used, last_session_date
  INTO v_user FROM users WHERE id = p_user_id;

  IF v_user IS NULL THEN
    RETURN jsonb_build_object('available', false);
  END IF;

  -- Streak zaten aktif
  IF v_user.current_streak > 0 THEN
    v_available := false;
  END IF;

  -- 30 gün cooldown
  IF v_user.last_streak_rescue IS NOT NULL THEN
    v_days_remaining := 30 - (CURRENT_DATE - v_user.last_streak_rescue);
    IF v_days_remaining > 0 THEN
      v_available := false;
    ELSE
      v_days_remaining := 0;
    END IF;
  END IF;

  -- 2 günden uzun süre geçti mi
  IF v_user.last_session_date IS NULL OR v_user.last_session_date < CURRENT_DATE - 2 THEN
    v_available := false;
  END IF;

  RETURN jsonb_build_object(
    'available', v_available,
    'cooldown_days_remaining', v_days_remaining,
    'total_rescues_used', v_user.streak_rescues_used,
    'current_streak', v_user.current_streak,
    'last_session_date', v_user.last_session_date
  );
END;
$$;


-- ============================================================
-- 3. QUEST → AYNAM BAĞLANTISI
-- ============================================================
-- Quest tamamlandığında Aynam'daki Odak Skoru'na etki etsin
-- Mekanizma: Tamamlama bileşenine quest bonus ekle

-- get_focus_score'u güncelle: quest tamamlama → completion score bonus
CREATE OR REPLACE FUNCTION public.get_focus_score()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_user RECORD;
  v_active_days INT;
  v_consistency NUMERIC;
  v_completion NUMERIC;
  v_streak_score NUMERIC;
  v_volume NUMERIC;
  v_total NUMERIC;
  v_account_age INT;
  v_quest_bonus NUMERIC := 0;
  v_quest_data JSONB;
BEGIN
  -- Kullanıcı bilgilerini al
  SELECT completed_sessions, abandoned_sessions, current_streak,
         total_minutes, created_at, metadata
  INTO v_user
  FROM users WHERE id = v_uid;

  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ready', false, 'reason', 'user_not_found');
  END IF;

  v_account_age := EXTRACT(DAY FROM (NOW() - v_user.created_at));

  -- Minimum eşik: 10 seans + 7 gün
  IF v_user.completed_sessions < 10 OR v_account_age < 7 THEN
    RETURN jsonb_build_object(
      'ready', false,
      'reason', 'insufficient_data',
      'sessions_needed', GREATEST(0, 10 - v_user.completed_sessions),
      'days_needed', GREATEST(0, 7 - v_account_age)
    );
  END IF;

  -- 1) Tutarlılık: son 14 günde kaç farklı günde seans yapıldı
  SELECT COUNT(DISTINCT DATE(s.started_at AT TIME ZONE COALESCE(
    (SELECT timezone FROM users WHERE id = v_uid), 'Europe/Istanbul'
  )))
  INTO v_active_days
  FROM sessions s
  JOIN session_participants sp ON sp.session_id = s.id
  WHERE sp.user_id = v_uid
    AND sp.status = 'completed'
    AND s.started_at >= NOW() - INTERVAL '14 days';

  v_consistency := LEAST(1.0, v_active_days::NUMERIC / 14.0) * 25.0;

  -- 2) Tamamlama: completed / (completed + abandoned) + quest bonus
  IF (v_user.completed_sessions + v_user.abandoned_sessions) > 0 THEN
    v_completion := (v_user.completed_sessions::NUMERIC /
      (v_user.completed_sessions + v_user.abandoned_sessions)::NUMERIC) * 22.0;
  ELSE
    v_completion := 22.0;
  END IF;

  -- ★ Quest bonus (max 3 puan): aktif haftalık quest tamamlanmışsa +3
  v_quest_data := v_user.metadata->'quests'->'weekly';
  IF v_quest_data IS NOT NULL AND (v_quest_data->>'completed')::BOOLEAN = true THEN
    v_quest_bonus := 3.0;
  END IF;
  v_completion := LEAST(25.0, v_completion + v_quest_bonus);

  -- 3) Seri: min(current_streak, 25)
  v_streak_score := LEAST(v_user.current_streak, 25)::NUMERIC;

  -- 4) Hacim: min(total_minutes / 1500, 1) × 25
  v_volume := LEAST(v_user.total_minutes::NUMERIC / 1500.0, 1.0) * 25.0;

  -- Toplam
  v_total := v_consistency + v_completion + v_streak_score + v_volume;

  RETURN jsonb_build_object(
    'ready', true,
    'score', ROUND(v_total),
    'consistency', ROUND(v_consistency),
    'completion', ROUND(v_completion),
    'streak', ROUND(v_streak_score),
    'volume', ROUND(v_volume),
    'quest_bonus', ROUND(v_quest_bonus),
    'max_per_component', 25
  );
END;
$$;


-- ============================================================
-- 4. SEZON GEÇİŞİNİ CRON'A EKLE
-- ============================================================
-- cron_daily_maintenance'da sezon geçişini de kontrol et

-- get_aynam_data'da sezon bilgisi ekle
CREATE OR REPLACE FUNCTION public.get_season_info(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user RECORD;
  v_season_day INT;
  v_season_number INT;
  v_last_season RECORD;
BEGIN
  SELECT season_start_date INTO v_user FROM users WHERE id = p_user_id;

  v_season_day := COALESCE((CURRENT_DATE - v_user.season_start_date), 0);

  SELECT COALESCE(MAX(season_number), 0) INTO v_season_number
  FROM season_history WHERE user_id = p_user_id;

  -- Son sezon
  SELECT * INTO v_last_season
  FROM season_history
  WHERE user_id = p_user_id
  ORDER BY season_number DESC LIMIT 1;

  RETURN jsonb_build_object(
    'current_season', v_season_number + 1,
    'season_day', v_season_day,
    'season_total_days', 90,
    'days_remaining', GREATEST(0, 90 - v_season_day),
    'last_season', CASE WHEN v_last_season IS NOT NULL THEN
      jsonb_build_object(
        'sessions', v_last_season.total_sessions,
        'minutes', v_last_season.total_minutes,
        'max_streak', v_last_season.max_streak,
        'xp', v_last_season.xp_earned
      )
    ELSE NULL END
  );
END;
$$;


-- ============================================================
-- 5. GRANT PERMISSIONS
-- ============================================================

GRANT EXECUTE ON FUNCTION public.check_season_transition(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rescue_streak(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_streak_rescue_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_focus_score() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_season_info(UUID) TO authenticated;
