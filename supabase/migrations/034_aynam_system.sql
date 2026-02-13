-- ============================================================
-- 034: AYNAM SİSTEMİ — Profil Analytics & Sertleştirme
-- Date: 2026-02-13
-- ============================================================
-- 1. users tablosuna yeni alanlar
-- 2. get_focus_score() — Odak Skoru hesaplama
-- 3. get_focus_heatmap() — Aktivite haritası
-- 4. get_personal_records() — Kişisel rekorlar
-- 5. get_weekly_comparison() — Haftalık kıyaslama
-- 6. get_aynam_data() — Tek RPC ile tüm profil verisi
-- 7. update_maturity_stage() — Aşama geçişi
-- 8. cron invariant kontrolleri
-- ============================================================


-- ============================================================
-- 1. USERS TABLOSUNA YENİ ALANLAR
-- ============================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Europe/Istanbul';

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS abandoned_sessions INT NOT NULL DEFAULT 0;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS maturity_stage TEXT NOT NULL DEFAULT 'discovery'
  CHECK (maturity_stage IN ('discovery', 'formation', 'growth', 'mastery'));

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS season_start_date DATE DEFAULT CURRENT_DATE;


-- ============================================================
-- 2. GET_FOCUS_SCORE — Odak Skoru (0-100)
-- ============================================================
-- Bileşenler (her biri 0-25):
--   Tutarlılık: son 14 günde aktif gün / 14
--   Tamamlama:  completed / (completed + abandoned)
--   Seri:       min(current_streak, 25)
--   Hacim:      min(total_minutes / 1500, 1)
-- NOT: 10 seanstan az veya 7 günden yeni hesapta NULL döner

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
BEGIN
  -- Kullanıcı bilgilerini al
  SELECT completed_sessions, abandoned_sessions, current_streak,
         total_minutes, created_at
  INTO v_user
  FROM users WHERE id = v_uid;

  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ready', false, 'reason', 'user_not_found');
  END IF;

  -- Hesap yaşı (gün)
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

  -- 2) Tamamlama: completed / (completed + abandoned)
  IF (v_user.completed_sessions + v_user.abandoned_sessions) > 0 THEN
    v_completion := (v_user.completed_sessions::NUMERIC /
      (v_user.completed_sessions + v_user.abandoned_sessions)::NUMERIC) * 25.0;
  ELSE
    v_completion := 25.0;
  END IF;

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
    'max_per_component', 25
  );
END;
$$;


-- ============================================================
-- 3. GET_FOCUS_HEATMAP — Son 14 gün aktivite haritası
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_focus_heatmap()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_tz TEXT;
  v_result JSONB := '[]'::JSONB;
BEGIN
  SELECT timezone INTO v_tz FROM users WHERE id = v_uid;
  v_tz := COALESCE(v_tz, 'Europe/Istanbul');

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::JSONB)
  INTO v_result
  FROM (
    SELECT
      d.day::DATE AS date,
      EXTRACT(DOW FROM d.day) AS day_of_week,
      COALESCE(counts.session_count, 0) AS session_count,
      COALESCE(counts.total_minutes, 0) AS total_minutes,
      CASE
        WHEN COALESCE(counts.total_minutes, 0) = 0 THEN 0
        WHEN counts.total_minutes <= 25 THEN 1
        WHEN counts.total_minutes <= 50 THEN 2
        WHEN counts.total_minutes <= 90 THEN 3
        ELSE 4
      END AS intensity
    FROM generate_series(
      (CURRENT_DATE - INTERVAL '13 days'),
      CURRENT_DATE,
      '1 day'
    ) AS d(day)
    LEFT JOIN (
      SELECT
        DATE(s.started_at AT TIME ZONE v_tz) AS session_date,
        COUNT(*) AS session_count,
        COALESCE(SUM(
          EXTRACT(EPOCH FROM (
            COALESCE(sp.left_at, s.ended_at, NOW()) - sp.joined_at
          )) / 60.0
        ), 0)::INT AS total_minutes
      FROM sessions s
      JOIN session_participants sp ON sp.session_id = s.id
      WHERE sp.user_id = v_uid
        AND sp.status = 'completed'
        AND s.started_at >= NOW() - INTERVAL '14 days'
      GROUP BY DATE(s.started_at AT TIME ZONE v_tz)
    ) counts ON counts.session_date = d.day::DATE
    ORDER BY d.day
  ) t;

  RETURN v_result;
END;
$$;


-- ============================================================
-- 4. GET_PERSONAL_RECORDS — Kişisel rekorlar
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_personal_records()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_longest_streak INT;
  v_longest_session INT;
  v_max_daily INT;
  v_latest_hour INT;
  v_tz TEXT;
BEGIN
  SELECT timezone INTO v_tz FROM users WHERE id = v_uid;
  v_tz := COALESCE(v_tz, 'Europe/Istanbul');

  -- En uzun seri (cached in users)
  SELECT longest_streak INTO v_longest_streak FROM users WHERE id = v_uid;

  -- En uzun seans (dakika)
  SELECT COALESCE(MAX(
    EXTRACT(EPOCH FROM (
      COALESCE(sp.left_at, s.ended_at) - sp.joined_at
    )) / 60.0
  ), 0)::INT
  INTO v_longest_session
  FROM sessions s
  JOIN session_participants sp ON sp.session_id = s.id
  WHERE sp.user_id = v_uid AND sp.status = 'completed';

  -- Bir günde en çok seans
  SELECT COALESCE(MAX(daily_count), 0)
  INTO v_max_daily
  FROM (
    SELECT COUNT(*) AS daily_count
    FROM sessions s
    JOIN session_participants sp ON sp.session_id = s.id
    WHERE sp.user_id = v_uid AND sp.status = 'completed'
    GROUP BY DATE(s.started_at AT TIME ZONE v_tz)
  ) sub;

  -- En geç saat
  SELECT COALESCE(MAX(EXTRACT(HOUR FROM s.started_at AT TIME ZONE v_tz)), 0)::INT
  INTO v_latest_hour
  FROM sessions s
  JOIN session_participants sp ON sp.session_id = s.id
  WHERE sp.user_id = v_uid AND sp.status = 'completed';

  RETURN jsonb_build_object(
    'longest_streak', COALESCE(v_longest_streak, 0),
    'longest_session_minutes', COALESCE(v_longest_session, 0),
    'max_sessions_per_day', COALESCE(v_max_daily, 0),
    'latest_hour', COALESCE(v_latest_hour, 0)
  );
END;
$$;


-- ============================================================
-- 5. GET_WEEKLY_COMPARISON — Bu hafta vs geçen hafta
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_weekly_comparison()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_tz TEXT;
  v_this_week_sessions INT;
  v_last_week_sessions INT;
  v_this_week_minutes INT;
  v_last_week_minutes INT;
  v_this_week_start DATE;
  v_last_week_start DATE;
  v_last_week_end DATE;
BEGIN
  SELECT timezone INTO v_tz FROM users WHERE id = v_uid;
  v_tz := COALESCE(v_tz, 'Europe/Istanbul');

  v_this_week_start := date_trunc('week', CURRENT_DATE)::DATE;
  v_last_week_start := v_this_week_start - 7;
  v_last_week_end := v_this_week_start - 1;

  -- Bu hafta
  SELECT COUNT(*), COALESCE(SUM(
    EXTRACT(EPOCH FROM (COALESCE(sp.left_at, s.ended_at, NOW()) - sp.joined_at)) / 60.0
  ), 0)::INT
  INTO v_this_week_sessions, v_this_week_minutes
  FROM sessions s
  JOIN session_participants sp ON sp.session_id = s.id
  WHERE sp.user_id = v_uid
    AND sp.status = 'completed'
    AND DATE(s.started_at AT TIME ZONE v_tz) >= v_this_week_start;

  -- Geçen hafta
  SELECT COUNT(*), COALESCE(SUM(
    EXTRACT(EPOCH FROM (COALESCE(sp.left_at, s.ended_at, NOW()) - sp.joined_at)) / 60.0
  ), 0)::INT
  INTO v_last_week_sessions, v_last_week_minutes
  FROM sessions s
  JOIN session_participants sp ON sp.session_id = s.id
  WHERE sp.user_id = v_uid
    AND sp.status = 'completed'
    AND DATE(s.started_at AT TIME ZONE v_tz) BETWEEN v_last_week_start AND v_last_week_end;

  RETURN jsonb_build_object(
    'this_week', jsonb_build_object(
      'sessions', v_this_week_sessions,
      'minutes', v_this_week_minutes
    ),
    'last_week', jsonb_build_object(
      'sessions', v_last_week_sessions,
      'minutes', v_last_week_minutes
    ),
    'session_trend', CASE
      WHEN v_this_week_sessions > v_last_week_sessions THEN 'up'
      WHEN v_this_week_sessions < v_last_week_sessions THEN 'down'
      ELSE 'stable' END,
    'minutes_trend', CASE
      WHEN v_this_week_minutes > v_last_week_minutes THEN 'up'
      WHEN v_this_week_minutes < v_last_week_minutes THEN 'down'
      ELSE 'stable' END
  );
END;
$$;


-- ============================================================
-- 6. GET_AYNAM_DATA — Ana profil RPC (tek çağrı)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_aynam_data()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_user RECORD;
  v_focus JSONB;
  v_heatmap JSONB;
  v_records JSONB;
  v_weekly JSONB;
  v_badges JSONB;
  v_streak_days JSONB;
  v_tz TEXT;
  v_dynamic_message TEXT;
BEGIN
  -- Maturity stage güncelle
  PERFORM update_maturity_stage();

  -- User bilgileri
  SELECT * INTO v_user FROM users WHERE id = v_uid;
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('error', 'user_not_found');
  END IF;

  v_tz := COALESCE(v_user.timezone, 'Europe/Istanbul');

  -- Alt RPC'leri çağır
  v_focus := get_focus_score();
  v_heatmap := get_focus_heatmap();
  v_records := get_personal_records();
  v_weekly := get_weekly_comparison();

  -- Rozetler
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'code', a.code,
    'name', a.name,
    'description', a.description,
    'icon', a.icon,
    'rarity', a.rarity,
    'unlocked', ua.unlocked_at IS NOT NULL,
    'unlocked_at', ua.unlocked_at
  )), '[]'::JSONB)
  INTO v_badges
  FROM achievements a
  LEFT JOIN user_achievements ua ON ua.achievement_id = a.id AND ua.user_id = v_uid
  ORDER BY a.id;

  -- Seri günleri (bu hafta)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'day', d.day::DATE,
    'day_of_week', EXTRACT(ISODOW FROM d.day),
    'had_session', EXISTS(
      SELECT 1 FROM sessions s
      JOIN session_participants sp ON sp.session_id = s.id
      WHERE sp.user_id = v_uid
        AND sp.status = 'completed'
        AND DATE(s.started_at AT TIME ZONE v_tz) = d.day::DATE
    )
  ) ORDER BY d.day), '[]'::JSONB)
  INTO v_streak_days
  FROM generate_series(
    date_trunc('week', CURRENT_DATE)::DATE,
    date_trunc('week', CURRENT_DATE)::DATE + 4,
    '1 day'
  ) AS d(day);

  -- Dinamik mesaj
  IF (v_weekly->>'session_trend') = 'up' THEN
    v_dynamic_message := 'Bu hafta ' ||
      ((v_weekly->'this_week'->>'sessions')::INT - (v_weekly->'last_week'->>'sessions')::INT)::TEXT ||
      ' seans daha fazla yaptın.';
  ELSIF v_user.current_streak >= 3 THEN
    v_dynamic_message := v_user.current_streak::TEXT || ' günlük serin devam ediyor.';
  ELSIF (v_weekly->>'minutes_trend') = 'up' THEN
    v_dynamic_message := 'Odak süren geçen haftaya göre arttı.';
  ELSE
    v_dynamic_message := NULL;
  END IF;

  -- Bugünkü seans sayısı
  RETURN jsonb_build_object(
    'user', jsonb_build_object(
      'name', v_user.name,
      'level', v_user.level,
      'xp', v_user.xp,
      'trust_score', v_user.trust_score,
      'trust_level', v_user.trust_level,
      'current_streak', v_user.current_streak,
      'longest_streak', v_user.longest_streak,
      'total_sessions', v_user.total_sessions,
      'completed_sessions', v_user.completed_sessions,
      'abandoned_sessions', v_user.abandoned_sessions,
      'total_minutes', v_user.total_minutes,
      'maturity_stage', v_user.maturity_stage,
      'created_at', v_user.created_at
    ),
    'focus_score', v_focus,
    'heatmap', v_heatmap,
    'records', v_records,
    'weekly', v_weekly,
    'badges', v_badges,
    'streak_days', v_streak_days,
    'dynamic_message', v_dynamic_message,
    'today_sessions', (
      SELECT COUNT(*) FROM sessions s
      JOIN session_participants sp ON sp.session_id = s.id
      WHERE sp.user_id = v_uid
        AND sp.status = 'completed'
        AND DATE(s.started_at AT TIME ZONE v_tz) = CURRENT_DATE
    ),
    'xp_for_next_level', (
      SELECT (((v_user.level) * (v_user.level)) * 100) -
             v_user.xp
    ),
    'xp_level_start', (
      SELECT (((v_user.level - 1) * (v_user.level - 1)) * 100)
    ),
    'xp_level_end', (
      SELECT (((v_user.level) * (v_user.level)) * 100)
    )
  );
END;
$$;


-- ============================================================
-- 7. UPDATE_MATURITY_STAGE — Aşama otomatik geçişi
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_maturity_stage()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_user RECORD;
  v_account_age INT;
  v_new_stage TEXT;
BEGIN
  SELECT completed_sessions, created_at, maturity_stage
  INTO v_user FROM users WHERE id = v_uid;

  IF v_user IS NULL THEN RETURN; END IF;

  v_account_age := EXTRACT(DAY FROM (NOW() - v_user.created_at));

  -- Aşama hesapla
  IF v_user.completed_sessions >= 15 AND v_account_age >= 30 THEN
    v_new_stage := 'mastery';
  ELSIF v_user.completed_sessions >= 10 AND v_account_age >= 14 THEN
    v_new_stage := 'growth';
  ELSIF v_user.completed_sessions >= 3 AND v_account_age >= 3 THEN
    v_new_stage := 'formation';
  ELSE
    v_new_stage := 'discovery';
  END IF;

  -- Sadece ileri geçiş (geri düşmez)
  IF v_new_stage != v_user.maturity_stage THEN
    CASE v_new_stage
      WHEN 'mastery' THEN
        UPDATE users SET maturity_stage = v_new_stage WHERE id = v_uid;
      WHEN 'growth' THEN
        IF v_user.maturity_stage IN ('discovery', 'formation') THEN
          UPDATE users SET maturity_stage = v_new_stage WHERE id = v_uid;
        END IF;
      WHEN 'formation' THEN
        IF v_user.maturity_stage = 'discovery' THEN
          UPDATE users SET maturity_stage = v_new_stage WHERE id = v_uid;
        END IF;
      ELSE NULL;
    END CASE;
  END IF;
END;
$$;


-- ============================================================
-- 8. CRON INVARIANT KONTROLLERİ
-- ============================================================

CREATE OR REPLACE FUNCTION public.cron_invariant_checks()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_level_fixes INT;
  v_streak_fixes INT;
  v_longest_fixes INT;
  v_trust_fixes INT;
  v_stage_updates INT;
BEGIN
  -- 1. Level ↔ XP tutarlılığı
  UPDATE users SET level = calc_level(xp) WHERE level != calc_level(xp);
  GET DIAGNOSTICS v_level_fixes = ROW_COUNT;

  -- 2. Streak ↔ last_session_date tutarlılığı
  UPDATE users SET current_streak = 0
  WHERE last_session_date < CURRENT_DATE - 1 AND current_streak > 0;
  GET DIAGNOSTICS v_streak_fixes = ROW_COUNT;

  -- 3. longest_streak >= current_streak
  UPDATE users SET longest_streak = current_streak
  WHERE current_streak > longest_streak;
  GET DIAGNOSTICS v_longest_fixes = ROW_COUNT;

  -- 4. Trust score sınır kontrolü
  UPDATE users SET trust_score = LEAST(200, GREATEST(0, trust_score))
  WHERE trust_score < 0 OR trust_score > 200;
  GET DIAGNOSTICS v_trust_fixes = ROW_COUNT;

  RETURN jsonb_build_object(
    'level_fixes', v_level_fixes,
    'streak_fixes', v_streak_fixes,
    'longest_streak_fixes', v_longest_fixes,
    'trust_fixes', v_trust_fixes,
    'ran_at', NOW()
  );
END;
$$;


-- ============================================================
-- 9. GRANT PERMISSIONS
-- ============================================================

GRANT EXECUTE ON FUNCTION public.get_focus_score() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_focus_heatmap() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_personal_records() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_weekly_comparison() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_aynam_data() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_maturity_stage() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cron_invariant_checks() TO authenticated;
