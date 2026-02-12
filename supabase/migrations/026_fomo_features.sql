-- ============================================================
-- 026: FOMO FEATURES — Pull FOMO Backend RPC'ler
-- 8 yeni RPC fonksiyonu + 5 yeni rozet seed verisi
-- Date: 2026-02-12
-- ============================================================
-- 1. get_focus_score        — 0-100 kompozit odak skoru (7 gün)
-- 2. get_focus_heatmap      — 7×4 zaman dilimi grid
-- 3. get_monthly_calendar   — Aylık seans takvimi
-- 4. get_personal_records   — Kişisel rekorlar
-- 5. get_silent_memory      — Desen algılama mesajları
-- 6. check_badges           — Seans sonrası rozet kontrolü
-- 7. get_user_badges        — Tüm rozetlerin durumu
-- 8. get_community_pulse    — Gerçek zamanlı topluluk nabzı
-- ============================================================


-- ============================================================
-- SEED DATA: 5 YENİ ROZET (mevcut 8'in üzerine)
-- ============================================================

INSERT INTO public.achievements (id, code, name, description, icon, requirement, rarity) VALUES
  (9,  'STREAK_3',    'Üç Günlük',   '3 günlük seri yap',           '🌱', '{"type": "streak", "value": 3}',          'common'),
  (10, 'NIGHT_OWL',   'Gece Kuşu',   '22:00 sonrası seans tamamla', '🦉', '{"type": "time_range", "min_hour": 22}',  'rare'),
  (11, 'EARLY_BIRD',  'Erken Kuş',   '08:00 öncesi seans tamamla',  '🐦', '{"type": "time_range", "max_hour": 8}',   'rare'),
  (12, 'MARATHON_90', 'Maratoncu',    '90 dakikalık seans tamamla',  '🏆', '{"type": "duration", "value": 90}',       'epic'),
  (13, 'FOCUS_50',    'Derin Dalış',  '50 dakikalık seans tamamla',  '🌊', '{"type": "duration", "value": 50}',       'common')
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- 1. GET_FOCUS_SCORE — 0-100 kompozit odak skoru
-- 4 bileşen (her biri 0-25):
--   consistency: 7 günde kaç gün aktif
--   completion:  başlanmış seanslardaki tamamlama oranı
--   streak:      mevcut seri / 7
--   volume:      toplam dakika / 175 (7×25dk hedef)
-- Trend: önceki 7 güne kıyasla
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_focus_score(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_streak INT;
  -- Current 7 days
  v_active_days_cur INT;
  v_started_cur INT;
  v_completed_cur INT;
  v_minutes_cur INT;
  -- Previous 7 days
  v_active_days_prev INT;
  v_started_prev INT;
  v_completed_prev INT;
  v_minutes_prev INT;
  v_streak_prev INT;
  -- Scores
  v_consistency FLOAT;
  v_completion FLOAT;
  v_streak_score FLOAT;
  v_volume FLOAT;
  v_score INT;
  v_prev_score INT;
  v_trend TEXT;
BEGIN
  -- Get current streak
  SELECT current_streak INTO v_streak FROM users WHERE id = p_user_id;
  v_streak := COALESCE(v_streak, 0);

  -- Current 7 days stats
  SELECT
    COUNT(DISTINCT s.started_at::DATE),
    COUNT(*),
    COUNT(*) FILTER (WHERE sp.status = 'completed'),
    COALESCE(SUM(s.duration) FILTER (WHERE sp.status = 'completed'), 0)
  INTO v_active_days_cur, v_started_cur, v_completed_cur, v_minutes_cur
  FROM session_participants sp
  JOIN sessions s ON s.id = sp.session_id
  WHERE sp.user_id = p_user_id
    AND sp.status IN ('completed', 'left_early', 'no_show')
    AND s.started_at >= NOW() - INTERVAL '7 days';

  -- Previous 7 days stats (days 8-14 ago)
  SELECT
    COUNT(DISTINCT s.started_at::DATE),
    COUNT(*),
    COUNT(*) FILTER (WHERE sp.status = 'completed'),
    COALESCE(SUM(s.duration) FILTER (WHERE sp.status = 'completed'), 0)
  INTO v_active_days_prev, v_started_prev, v_completed_prev, v_minutes_prev
  FROM session_participants sp
  JOIN sessions s ON s.id = sp.session_id
  WHERE sp.user_id = p_user_id
    AND sp.status IN ('completed', 'left_early', 'no_show')
    AND s.started_at >= NOW() - INTERVAL '14 days'
    AND s.started_at < NOW() - INTERVAL '7 days';

  -- Calculate current score components (each 0-25)
  v_consistency := LEAST(v_active_days_cur::FLOAT / 7.0, 1.0) * 25.0;

  IF v_started_cur > 0 THEN
    v_completion := (v_completed_cur::FLOAT / v_started_cur) * 25.0;
  ELSE
    v_completion := 0;
  END IF;

  v_streak_score := LEAST(v_streak::FLOAT / 7.0, 1.0) * 25.0;
  v_volume := LEAST(v_minutes_cur::FLOAT / 175.0, 1.0) * 25.0;

  v_score := ROUND(v_consistency + v_completion + v_streak_score + v_volume)::INT;

  -- Calculate previous score (estimate streak from previous week)
  -- We don't know exact prev streak, use active_days as proxy
  v_streak_prev := LEAST(v_active_days_prev, 7);

  IF v_started_prev > 0 THEN
    v_prev_score := ROUND(
      LEAST(v_active_days_prev::FLOAT / 7.0, 1.0) * 25.0 +
      (v_completed_prev::FLOAT / v_started_prev) * 25.0 +
      LEAST(v_streak_prev::FLOAT / 7.0, 1.0) * 25.0 +
      LEAST(v_minutes_prev::FLOAT / 175.0, 1.0) * 25.0
    )::INT;
  ELSE
    v_prev_score := 0;
  END IF;

  -- Trend
  IF v_score > v_prev_score + 5 THEN
    v_trend := 'up';
  ELSIF v_score < v_prev_score - 5 THEN
    v_trend := 'down';
  ELSE
    v_trend := 'stable';
  END IF;

  RETURN jsonb_build_object(
    'score', v_score,
    'breakdown', jsonb_build_object(
      'consistency', ROUND(v_consistency::NUMERIC, 1),
      'completion', ROUND(v_completion::NUMERIC, 1),
      'streak', ROUND(v_streak_score::NUMERIC, 1),
      'volume', ROUND(v_volume::NUMERIC, 1)
    ),
    'trend', v_trend,
    'previous_score', v_prev_score
  );
END;
$$;


-- ============================================================
-- 2. GET_FOCUS_HEATMAP — 7 gün × 4 zaman dilimi grid
-- Zaman dilimleri: sabah(06-11), ogle(12-16), aksam(17-21), gece(22-05)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_focus_heatmap(
  p_user_id UUID,
  p_days INT DEFAULT 7
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB := '[]'::JSONB;
  v_day RECORD;
  v_date DATE;
  v_slots JSONB;
  v_sabah RECORD;
  v_ogle RECORD;
  v_aksam RECORD;
  v_gece RECORD;
BEGIN
  FOR v_day IN
    SELECT d::DATE AS dt
    FROM generate_series(
      CURRENT_DATE - (p_days - 1),
      CURRENT_DATE,
      '1 day'::INTERVAL
    ) d
  LOOP
    v_date := v_day.dt;

    -- Sabah (06-11)
    SELECT
      COALESCE(COUNT(*), 0) AS sessions,
      COALESCE(SUM(s.duration), 0) AS minutes
    INTO v_sabah
    FROM session_participants sp
    JOIN sessions s ON s.id = sp.session_id
    WHERE sp.user_id = p_user_id
      AND sp.status = 'completed'
      AND s.started_at::DATE = v_date
      AND EXTRACT(HOUR FROM s.started_at) BETWEEN 6 AND 11;

    -- Ogle (12-16)
    SELECT
      COALESCE(COUNT(*), 0) AS sessions,
      COALESCE(SUM(s.duration), 0) AS minutes
    INTO v_ogle
    FROM session_participants sp
    JOIN sessions s ON s.id = sp.session_id
    WHERE sp.user_id = p_user_id
      AND sp.status = 'completed'
      AND s.started_at::DATE = v_date
      AND EXTRACT(HOUR FROM s.started_at) BETWEEN 12 AND 16;

    -- Aksam (17-21)
    SELECT
      COALESCE(COUNT(*), 0) AS sessions,
      COALESCE(SUM(s.duration), 0) AS minutes
    INTO v_aksam
    FROM session_participants sp
    JOIN sessions s ON s.id = sp.session_id
    WHERE sp.user_id = p_user_id
      AND sp.status = 'completed'
      AND s.started_at::DATE = v_date
      AND EXTRACT(HOUR FROM s.started_at) BETWEEN 17 AND 21;

    -- Gece (22-05) — split across midnight
    SELECT
      COALESCE(COUNT(*), 0) AS sessions,
      COALESCE(SUM(s.duration), 0) AS minutes
    INTO v_gece
    FROM session_participants sp
    JOIN sessions s ON s.id = sp.session_id
    WHERE sp.user_id = p_user_id
      AND sp.status = 'completed'
      AND s.started_at::DATE = v_date
      AND (EXTRACT(HOUR FROM s.started_at) >= 22
           OR EXTRACT(HOUR FROM s.started_at) < 6);

    v_slots := jsonb_build_object(
      'sabah', jsonb_build_object('sessions', v_sabah.sessions, 'minutes', v_sabah.minutes),
      'ogle', jsonb_build_object('sessions', v_ogle.sessions, 'minutes', v_ogle.minutes),
      'aksam', jsonb_build_object('sessions', v_aksam.sessions, 'minutes', v_aksam.minutes),
      'gece', jsonb_build_object('sessions', v_gece.sessions, 'minutes', v_gece.minutes)
    );

    v_result := v_result || jsonb_build_object(
      'date', v_date::TEXT,
      'dow', EXTRACT(ISODOW FROM v_date)::INT,
      'slots', v_slots
    );
  END LOOP;

  RETURN jsonb_build_object('days', v_result);
END;
$$;


-- ============================================================
-- 3. GET_MONTHLY_CALENDAR — Aylık seans takvimi
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_monthly_calendar(
  p_user_id UUID,
  p_year INT,
  p_month INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start_date DATE;
  v_end_date DATE;
  v_days JSONB := '[]'::JSONB;
  v_day RECORD;
  v_day_data RECORD;
  v_total_active INT := 0;
  v_total_sessions INT := 0;
  v_total_minutes INT := 0;
BEGIN
  v_start_date := make_date(p_year, p_month, 1);
  v_end_date := (v_start_date + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

  FOR v_day IN
    SELECT d::DATE AS dt
    FROM generate_series(v_start_date, v_end_date, '1 day'::INTERVAL) d
  LOOP
    SELECT
      COUNT(*) AS sessions,
      COALESCE(SUM(s.duration), 0) AS minutes,
      COUNT(*) FILTER (WHERE sp.status = 'completed') AS completed
    INTO v_day_data
    FROM session_participants sp
    JOIN sessions s ON s.id = sp.session_id
    WHERE sp.user_id = p_user_id
      AND sp.status IN ('completed', 'left_early')
      AND s.started_at::DATE = v_day.dt;

    v_days := v_days || jsonb_build_object(
      'day', EXTRACT(DAY FROM v_day.dt)::INT,
      'sessions', v_day_data.sessions,
      'minutes', v_day_data.minutes,
      'completed', v_day_data.completed > 0
    );

    IF v_day_data.sessions > 0 THEN
      v_total_active := v_total_active + 1;
    END IF;
    v_total_sessions := v_total_sessions + v_day_data.sessions;
    v_total_minutes := v_total_minutes + v_day_data.minutes;
  END LOOP;

  RETURN jsonb_build_object(
    'year', p_year,
    'month', p_month,
    'days', v_days,
    'total_active_days', v_total_active,
    'total_sessions', v_total_sessions,
    'total_minutes', v_total_minutes
  );
END;
$$;


-- ============================================================
-- 4. GET_PERSONAL_RECORDS — Kişisel rekorlar
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_personal_records(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_longest_streak INT;
  v_longest_session INT;
  v_most_day_date DATE;
  v_most_day_count INT;
  v_earliest_hour INT;
  v_earliest_date DATE;
  v_latest_hour INT;
  v_latest_date DATE;
  v_total_active_days INT;
  v_first_session_date DATE;
BEGIN
  -- Longest streak (from users table)
  SELECT longest_streak INTO v_longest_streak
  FROM users WHERE id = p_user_id;

  -- Longest single session (completed)
  SELECT s.duration INTO v_longest_session
  FROM session_participants sp
  JOIN sessions s ON s.id = sp.session_id
  WHERE sp.user_id = p_user_id AND sp.status = 'completed'
  ORDER BY s.duration DESC
  LIMIT 1;

  -- Most sessions in a single day
  SELECT s.started_at::DATE, COUNT(*) INTO v_most_day_date, v_most_day_count
  FROM session_participants sp
  JOIN sessions s ON s.id = sp.session_id
  WHERE sp.user_id = p_user_id AND sp.status = 'completed'
  GROUP BY s.started_at::DATE
  ORDER BY COUNT(*) DESC
  LIMIT 1;

  -- Earliest session
  SELECT EXTRACT(HOUR FROM s.started_at)::INT, s.started_at::DATE
  INTO v_earliest_hour, v_earliest_date
  FROM session_participants sp
  JOIN sessions s ON s.id = sp.session_id
  WHERE sp.user_id = p_user_id
    AND sp.status = 'completed'
    AND EXTRACT(HOUR FROM s.started_at) BETWEEN 4 AND 12
  ORDER BY EXTRACT(HOUR FROM s.started_at) ASC
  LIMIT 1;

  -- Latest session
  SELECT EXTRACT(HOUR FROM s.started_at)::INT, s.started_at::DATE
  INTO v_latest_hour, v_latest_date
  FROM session_participants sp
  JOIN sessions s ON s.id = sp.session_id
  WHERE sp.user_id = p_user_id
    AND sp.status = 'completed'
    AND EXTRACT(HOUR FROM s.started_at) >= 18
  ORDER BY EXTRACT(HOUR FROM s.started_at) DESC
  LIMIT 1;

  -- Total unique active days
  SELECT COUNT(DISTINCT s.started_at::DATE) INTO v_total_active_days
  FROM session_participants sp
  JOIN sessions s ON s.id = sp.session_id
  WHERE sp.user_id = p_user_id AND sp.status = 'completed';

  -- First session date
  SELECT MIN(s.started_at::DATE) INTO v_first_session_date
  FROM session_participants sp
  JOIN sessions s ON s.id = sp.session_id
  WHERE sp.user_id = p_user_id AND sp.status = 'completed';

  RETURN jsonb_build_object(
    'longest_streak', COALESCE(v_longest_streak, 0),
    'longest_session_minutes', COALESCE(v_longest_session, 0),
    'most_sessions_in_day', CASE
      WHEN v_most_day_date IS NOT NULL THEN
        jsonb_build_object('date', v_most_day_date::TEXT, 'count', v_most_day_count)
      ELSE NULL
    END,
    'earliest_session', CASE
      WHEN v_earliest_hour IS NOT NULL THEN
        jsonb_build_object('hour', v_earliest_hour, 'date', v_earliest_date::TEXT)
      ELSE NULL
    END,
    'latest_session', CASE
      WHEN v_latest_hour IS NOT NULL THEN
        jsonb_build_object('hour', v_latest_hour, 'date', v_latest_date::TEXT)
      ELSE NULL
    END,
    'total_active_days', COALESCE(v_total_active_days, 0),
    'first_session_date', v_first_session_date::TEXT
  );
END;
$$;


-- ============================================================
-- 5. GET_SILENT_MEMORY — Desen algılama mesajları
-- Max 3 mesaj, öncelik sırasına göre
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_silent_memory(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user RECORD;
  v_messages JSONB := '[]'::JSONB;
  v_msg_count INT := 0;
  v_current_hour INT;
  v_days_absent INT;
  v_xp_to_next INT;
  v_best_dow INT;
  v_best_dow_name TEXT;
  v_same_time_exists BOOLEAN;
  v_dow_names TEXT[] := ARRAY['Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi','Pazar'];
BEGIN
  -- Get user info
  SELECT current_streak, last_session_date, xp, level
  INTO v_user
  FROM users WHERE id = p_user_id;

  IF v_user IS NULL THEN RETURN jsonb_build_object('messages', '[]'::JSONB); END IF;

  v_current_hour := EXTRACT(HOUR FROM NOW())::INT;

  -- 1. STREAK RISK (priority 1) — "Bugün seans yapmazsan serin sıfırlanır"
  IF v_msg_count < 3
     AND v_user.last_session_date = CURRENT_DATE - 1
     AND v_current_hour >= 18
     AND v_user.current_streak >= 2
  THEN
    v_messages := v_messages || jsonb_build_object(
      'type', 'streak_risk',
      'text', 'Bugün seans yapmazsan ' || v_user.current_streak || ' günlük serin sıfırlanır!',
      'priority', 1
    );
    v_msg_count := v_msg_count + 1;
  END IF;

  -- 2. ABSENCE (priority 2) — "Seni N gündür görmedik"
  IF v_user.last_session_date IS NOT NULL THEN
    v_days_absent := CURRENT_DATE - v_user.last_session_date;
  ELSE
    v_days_absent := 999;
  END IF;

  IF v_msg_count < 3 AND v_days_absent >= 3 AND v_days_absent < 999 THEN
    v_messages := v_messages || jsonb_build_object(
      'type', 'absence',
      'text', 'Seni ' || v_days_absent || ' gündür görmedik. Geri dönmek için harika bir gün!',
      'priority', 2
    );
    v_msg_count := v_msg_count + 1;
  END IF;

  -- 3. SAME TIME LAST WEEK (priority 3) — "Geçen hafta bu saatte buradaydın"
  IF v_msg_count < 3 THEN
    SELECT EXISTS(
      SELECT 1
      FROM session_participants sp
      JOIN sessions s ON s.id = sp.session_id
      WHERE sp.user_id = p_user_id
        AND sp.status = 'completed'
        AND s.started_at::DATE = CURRENT_DATE - 7
        AND ABS(EXTRACT(HOUR FROM s.started_at) - v_current_hour) <= 1
    ) INTO v_same_time_exists;

    IF v_same_time_exists THEN
      v_messages := v_messages || jsonb_build_object(
        'type', 'same_time_last_week',
        'text', 'Geçen hafta tam bu saatlerde odaklanıyordun.',
        'priority', 3
      );
      v_msg_count := v_msg_count + 1;
    END IF;
  END IF;

  -- 4. MILESTONE NEAR (priority 4) — "Bir sonraki seviyeye N XP kaldı"
  v_xp_to_next := 100 - (COALESCE(v_user.xp, 0) % 100);
  IF v_msg_count < 3 AND v_xp_to_next <= 30 AND v_xp_to_next > 0 THEN
    v_messages := v_messages || jsonb_build_object(
      'type', 'milestone_near',
      'text', 'Seviye ' || (COALESCE(v_user.level, 1) + 1) || '''e sadece ' || v_xp_to_next || ' XP kaldı!',
      'priority', 4
    );
    v_msg_count := v_msg_count + 1;
  END IF;

  -- 5. BEST DAY (priority 5) — "En verimli günün genellikle Çarşamba"
  IF v_msg_count < 3 THEN
    SELECT EXTRACT(ISODOW FROM s.started_at)::INT INTO v_best_dow
    FROM session_participants sp
    JOIN sessions s ON s.id = sp.session_id
    WHERE sp.user_id = p_user_id
      AND sp.status = 'completed'
      AND s.started_at >= NOW() - INTERVAL '30 days'
    GROUP BY EXTRACT(ISODOW FROM s.started_at)
    ORDER BY COUNT(*) DESC
    LIMIT 1;

    IF v_best_dow IS NOT NULL THEN
      v_best_dow_name := v_dow_names[v_best_dow];
      IF EXTRACT(ISODOW FROM CURRENT_DATE)::INT = v_best_dow THEN
        v_messages := v_messages || jsonb_build_object(
          'type', 'best_day',
          'text', 'Bugün senin en verimli günün — ' || v_best_dow_name || '!',
          'priority', 5
        );
        v_msg_count := v_msg_count + 1;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('messages', v_messages);
END;
$$;


-- ============================================================
-- 6. CHECK_BADGES — Seans sonrası rozet kontrolü
-- Tüm 13 rozeti kontrol eder, yeni açılanları döner
-- ============================================================

CREATE OR REPLACE FUNCTION public.check_badges(
  p_user_id UUID,
  p_session_id UUID
)
RETURNS TEXT[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user RECORD;
  v_session RECORD;
  v_session_hour INT;
  v_unlocked TEXT[] := '{}';
  v_achievement RECORD;
  v_already_has BOOLEAN;
  v_total_min INT;
BEGIN
  -- User bilgileri
  SELECT total_sessions, completed_sessions, current_streak, longest_streak, trust_score
  INTO v_user
  FROM users WHERE id = p_user_id;

  IF v_user IS NULL THEN RETURN v_unlocked; END IF;

  -- Session bilgileri
  SELECT s.duration, s.started_at
  INTO v_session
  FROM sessions s
  JOIN session_participants sp ON sp.session_id = s.id
  WHERE s.id = p_session_id AND sp.user_id = p_user_id;

  IF v_session.started_at IS NOT NULL THEN
    v_session_hour := EXTRACT(HOUR FROM v_session.started_at)::INT;
  END IF;

  -- Her rozeti kontrol et
  FOR v_achievement IN
    SELECT id, code, requirement FROM achievements ORDER BY id
  LOOP
    -- Zaten açılmış mı?
    SELECT EXISTS(
      SELECT 1 FROM user_achievements
      WHERE user_id = p_user_id AND achievement_id = v_achievement.id
    ) INTO v_already_has;

    IF v_already_has THEN CONTINUE; END IF;

    -- Koşul kontrolü
    CASE v_achievement.code
      -- Session count badges
      WHEN 'FIRST_SESSION' THEN
        IF v_user.completed_sessions >= 1 THEN
          INSERT INTO user_achievements (user_id, achievement_id) VALUES (p_user_id, v_achievement.id);
          v_unlocked := array_append(v_unlocked, v_achievement.code);
        END IF;

      WHEN 'SESSIONS_10' THEN
        IF v_user.completed_sessions >= 10 THEN
          INSERT INTO user_achievements (user_id, achievement_id) VALUES (p_user_id, v_achievement.id);
          v_unlocked := array_append(v_unlocked, v_achievement.code);
        END IF;

      WHEN 'SESSIONS_50' THEN
        IF v_user.completed_sessions >= 50 THEN
          INSERT INTO user_achievements (user_id, achievement_id) VALUES (p_user_id, v_achievement.id);
          v_unlocked := array_append(v_unlocked, v_achievement.code);
        END IF;

      WHEN 'SESSIONS_100' THEN
        IF v_user.completed_sessions >= 100 THEN
          INSERT INTO user_achievements (user_id, achievement_id) VALUES (p_user_id, v_achievement.id);
          v_unlocked := array_append(v_unlocked, v_achievement.code);
        END IF;

      -- Streak badges
      WHEN 'STREAK_3' THEN
        IF v_user.current_streak >= 3 THEN
          INSERT INTO user_achievements (user_id, achievement_id) VALUES (p_user_id, v_achievement.id);
          v_unlocked := array_append(v_unlocked, v_achievement.code);
        END IF;

      WHEN 'STREAK_7' THEN
        IF v_user.current_streak >= 7 OR v_user.longest_streak >= 7 THEN
          INSERT INTO user_achievements (user_id, achievement_id) VALUES (p_user_id, v_achievement.id);
          v_unlocked := array_append(v_unlocked, v_achievement.code);
        END IF;

      WHEN 'STREAK_30' THEN
        IF v_user.current_streak >= 30 OR v_user.longest_streak >= 30 THEN
          INSERT INTO user_achievements (user_id, achievement_id) VALUES (p_user_id, v_achievement.id);
          v_unlocked := array_append(v_unlocked, v_achievement.code);
        END IF;

      -- Time-based badges
      WHEN 'NIGHT_OWL' THEN
        IF v_session_hour IS NOT NULL AND v_session_hour >= 22 THEN
          INSERT INTO user_achievements (user_id, achievement_id) VALUES (p_user_id, v_achievement.id);
          v_unlocked := array_append(v_unlocked, v_achievement.code);
        END IF;

      WHEN 'EARLY_BIRD' THEN
        IF v_session_hour IS NOT NULL AND v_session_hour >= 4 AND v_session_hour < 8 THEN
          INSERT INTO user_achievements (user_id, achievement_id) VALUES (p_user_id, v_achievement.id);
          v_unlocked := array_append(v_unlocked, v_achievement.code);
        END IF;

      -- Duration badges
      WHEN 'MARATHON_90' THEN
        IF v_session.duration IS NOT NULL AND v_session.duration >= 90 THEN
          INSERT INTO user_achievements (user_id, achievement_id) VALUES (p_user_id, v_achievement.id);
          v_unlocked := array_append(v_unlocked, v_achievement.code);
        END IF;

      WHEN 'FOCUS_50' THEN
        IF v_session.duration IS NOT NULL AND v_session.duration >= 50 THEN
          INSERT INTO user_achievements (user_id, achievement_id) VALUES (p_user_id, v_achievement.id);
          v_unlocked := array_append(v_unlocked, v_achievement.code);
        END IF;

      -- Total minutes badge
      WHEN 'FOCUS_500' THEN
        SELECT total_minutes INTO v_total_min FROM users WHERE id = p_user_id;
        IF COALESCE(v_total_min, 0) >= 500 THEN
          INSERT INTO user_achievements (user_id, achievement_id) VALUES (p_user_id, v_achievement.id);
          v_unlocked := array_append(v_unlocked, v_achievement.code);
        END IF;

      -- Trust badge
      WHEN 'TRUST_120' THEN
        IF v_user.trust_score >= 120 THEN
          INSERT INTO user_achievements (user_id, achievement_id) VALUES (p_user_id, v_achievement.id);
          v_unlocked := array_append(v_unlocked, v_achievement.code);
        END IF;

    ELSE
      -- Bilinmeyen rozet, atla
      NULL;
    END CASE;
  END LOOP;

  RETURN v_unlocked;
END;
$$;


-- ============================================================
-- 7. GET_USER_BADGES — Tüm rozetlerin açık/kilitli durumu
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_user_badges(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_badges JSONB := '[]'::JSONB;
  v_achievement RECORD;
  v_unlocked_at TIMESTAMPTZ;
  v_total INT := 0;
  v_unlocked_count INT := 0;
BEGIN
  FOR v_achievement IN
    SELECT id, code, name, description, icon, rarity
    FROM achievements
    ORDER BY id
  LOOP
    v_total := v_total + 1;

    SELECT ua.unlocked_at INTO v_unlocked_at
    FROM user_achievements ua
    WHERE ua.user_id = p_user_id AND ua.achievement_id = v_achievement.id;

    IF v_unlocked_at IS NOT NULL THEN
      v_unlocked_count := v_unlocked_count + 1;
    END IF;

    v_badges := v_badges || jsonb_build_object(
      'code', v_achievement.code,
      'name', v_achievement.name,
      'description', v_achievement.description,
      'icon', v_achievement.icon,
      'rarity', v_achievement.rarity,
      'unlocked', v_unlocked_at IS NOT NULL,
      'unlocked_at', CASE WHEN v_unlocked_at IS NOT NULL THEN v_unlocked_at::TEXT ELSE NULL END
    );
  END LOOP;

  RETURN jsonb_build_object(
    'badges', v_badges,
    'total', v_total,
    'unlocked', v_unlocked_count
  );
END;
$$;


-- ============================================================
-- 8. GET_COMMUNITY_PULSE — Gerçek zamanlı topluluk nabzı
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_community_pulse()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active_users INT;
  v_today_sessions INT;
  v_today_minutes INT;
  v_peak_hour INT;
  v_msg TEXT;
BEGIN
  -- Şu anda aktif kullanıcılar (active veya preparing seanslar)
  SELECT COUNT(DISTINCT sp.user_id) INTO v_active_users
  FROM session_participants sp
  JOIN sessions s ON s.id = sp.session_id
  WHERE s.status IN ('active', 'preparing')
    AND sp.status IN ('active', 'joined');

  -- Bugün tamamlanan seanslar
  SELECT COUNT(*), COALESCE(SUM(s.duration), 0)
  INTO v_today_sessions, v_today_minutes
  FROM session_participants sp
  JOIN sessions s ON s.id = sp.session_id
  WHERE sp.status = 'completed'
    AND s.started_at::DATE = CURRENT_DATE;

  -- Bugünün en yoğun saati
  SELECT EXTRACT(HOUR FROM s.started_at)::INT INTO v_peak_hour
  FROM session_participants sp
  JOIN sessions s ON s.id = sp.session_id
  WHERE sp.status = 'completed'
    AND s.started_at::DATE = CURRENT_DATE
  GROUP BY EXTRACT(HOUR FROM s.started_at)
  ORDER BY COUNT(*) DESC
  LIMIT 1;

  -- Mesaj
  v_active_users := COALESCE(v_active_users, 0);
  IF v_active_users > 0 THEN
    v_msg := 'Şu anda ' || v_active_users || ' kişi odaklanıyor';
  ELSE
    v_msg := 'Şu anda kimse aktif değil — ilk sen başla!';
  END IF;

  RETURN jsonb_build_object(
    'active_users', v_active_users,
    'today_sessions', COALESCE(v_today_sessions, 0),
    'today_minutes', COALESCE(v_today_minutes, 0),
    'peak_hour', v_peak_hour,
    'active_now_message', v_msg
  );
END;
$$;


-- ============================================================
-- GRANT PERMISSIONS
-- ============================================================

GRANT EXECUTE ON FUNCTION public.get_focus_score(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_focus_heatmap(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_monthly_calendar(UUID, INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_personal_records(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_silent_memory(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_badges(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_badges(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_community_pulse() TO authenticated;
