-- ============================================================
-- 035: AYNAM SERTLEŞTİRME — Eksik Korumalar
-- Date: 2026-02-13
-- ============================================================
-- 1. xp_ledger tablosu (XP audit trail)
-- 2. trust_events UNIQUE constraint
-- 3. update_trust_score FOR UPDATE kilidi
-- 4. Idle seans tespiti (suspicious session)
-- 5. Tükenmişlik algılama
-- 6. Gerileme algılama
-- 7. Ritüel izleme event'leri
-- 8. Sahte streak koruması
-- 9. Aynı 2 kullanıcı 24 saat tekrar eşleşemez
-- 10. Seans arası minimum 5dk cooldown
-- 11. Kişisel rekor cache
-- 12. Geri dönüş algılama (comeback)
-- ============================================================


-- ============================================================
-- 1. XP_LEDGER — Her XP değişimi kayıt altında
-- ============================================================

CREATE TABLE IF NOT EXISTS public.xp_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
  amount INT NOT NULL,              -- pozitif = kazanç, negatif = ceza
  reason TEXT NOT NULL,             -- 'session_complete', 'quest_reward', 'idle_penalty', 'admin_adjust'
  xp_before INT NOT NULL,
  xp_after INT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_xp_ledger_user ON xp_ledger(user_id, created_at DESC);

ALTER TABLE xp_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_xp_ledger" ON xp_ledger
  FOR SELECT USING (auth.uid() = user_id);


-- ============================================================
-- 2. TRUST_EVENTS — Çift yazım koruması
-- ============================================================
-- Aynı session'da aynı event_type tekrarlanmamalı

-- Önce mevcut duplikatları temizle (güvenli)
DELETE FROM trust_events a
USING trust_events b
WHERE a.id > b.id
  AND a.user_id = b.user_id
  AND a.session_id = b.session_id
  AND a.event_type = b.event_type
  AND a.session_id IS NOT NULL;

-- Unique constraint ekle
CREATE UNIQUE INDEX IF NOT EXISTS idx_trust_events_unique_per_session
  ON trust_events(user_id, session_id, event_type)
  WHERE session_id IS NOT NULL;


-- ============================================================
-- 3. UPDATE_TRUST_SCORE — FOR UPDATE kilidi (race condition fix)
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_trust_score(
  p_user_id UUID,
  p_event_type TEXT,
  p_session_id UUID DEFAULT NULL,
  p_related_user_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_score_change INT;
  v_score_before INT;
  v_score_after INT;
  v_description TEXT;
  v_new_level TEXT;
BEGIN
  -- FOR UPDATE kilidi — race condition önleme
  SELECT trust_score INTO v_score_before
  FROM users WHERE id = p_user_id
  FOR UPDATE;

  IF v_score_before IS NULL THEN
    RETURN jsonb_build_object('error', 'user_not_found');
  END IF;

  -- Event type'a göre skor değişimi
  v_score_change := CASE p_event_type
    WHEN 'session_completed'     THEN 3
    WHEN 'solo_session_completed' THEN 1
    WHEN 'partner_rated_5_stars' THEN 5
    WHEN 'partner_rated_4_stars' THEN 3
    WHEN 'rating_5_star'         THEN 2
    WHEN 'rating_4_star'         THEN 1
    WHEN 'partner_rated_1_star'  THEN -5
    WHEN 'partner_rated_2_stars' THEN -3
    WHEN 'rating_1_star'         THEN -1
    WHEN 'early_exit_mild'       THEN -5
    WHEN 'early_exit_moderate'   THEN -10
    WHEN 'early_exit_severe'     THEN -20
    WHEN 'ghosting'              THEN -15
    WHEN 'no_show'               THEN -10
    WHEN 'reported_and_verified' THEN -30
    WHEN 'helpful_report'        THEN 5
    WHEN 'quest_weekly'          THEN 3
    WHEN 'quest_hidden'          THEN 5
    WHEN 'cooldown_skipped'      THEN -2
    WHEN 'match_broken'          THEN -8
    ELSE 0
  END;

  -- Açıklama
  v_description := CASE p_event_type
    WHEN 'session_completed'     THEN 'Seans tamamlandi'
    WHEN 'solo_session_completed' THEN 'Solo seans tamamlandi'
    WHEN 'partner_rated_5_stars' THEN 'Partner 5 yildiz verdi'
    WHEN 'partner_rated_4_stars' THEN 'Partner 4 yildiz verdi'
    WHEN 'partner_rated_1_star'  THEN 'Partner 1 yildiz verdi'
    WHEN 'early_exit_mild'       THEN 'Erken cikis (hafif)'
    WHEN 'early_exit_moderate'   THEN 'Erken cikis (orta)'
    WHEN 'early_exit_severe'     THEN 'Erken cikis (agir)'
    WHEN 'ghosting'              THEN 'Hayalet oldu'
    WHEN 'no_show'               THEN 'Gelmedi'
    ELSE p_event_type
  END;

  -- Sınırla (0-200)
  v_score_after := LEAST(200, GREATEST(0, v_score_before + v_score_change));

  -- Users tablosunu güncelle
  UPDATE users SET
    trust_score = v_score_after,
    trust_level = CASE
      WHEN v_score_after >= 180 THEN 'legend'
      WHEN v_score_after >= 150 THEN 'elite'
      WHEN v_score_after >= 120 THEN 'verified'
      WHEN v_score_after >= 80  THEN 'trusted'
      WHEN v_score_after >= 40  THEN 'newbie'
      ELSE 'restricted'
    END
  WHERE id = p_user_id;

  -- Trust event kaydet (duplikat engeli unique index ile)
  INSERT INTO trust_events (user_id, session_id, event_type, score_change,
    score_before, score_after, description, related_user_id, metadata)
  VALUES (p_user_id, p_session_id, p_event_type, v_score_change,
    v_score_before, v_score_after, v_description, p_related_user_id, p_metadata)
  ON CONFLICT DO NOTHING;

  SELECT trust_level INTO v_new_level FROM users WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'score_before', v_score_before,
    'score_after', v_score_after,
    'score_change', v_score_change,
    'trust_level', v_new_level
  );
END;
$$;


-- ============================================================
-- 4. IDLE SEANS TESPİTİ
-- ============================================================
-- Session tamamlanırken idle oranını kontrol et
-- %80'den fazla idle ise suspicious olarak işaretle

CREATE OR REPLACE FUNCTION public.detect_suspicious_session(
  p_session_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_logs INT;
  v_idle_logs INT;
  v_idle_ratio NUMERIC;
  v_is_suspicious BOOLEAN := false;
BEGIN
  -- Son seanstaki presence loglarını say
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status IN ('idle', 'away'))
  INTO v_total_logs, v_idle_logs
  FROM user_presence_logs
  WHERE session_id = p_session_id AND user_id = p_user_id;

  -- En az 3 log kaydı olmalı
  IF v_total_logs < 3 THEN
    RETURN false;
  END IF;

  v_idle_ratio := v_idle_logs::NUMERIC / v_total_logs::NUMERIC;

  -- %80'den fazla idle → şüpheli
  IF v_idle_ratio > 0.8 THEN
    v_is_suspicious := true;

    -- Kaydı oluştur (sessiz — kullanıcıya bildirim yok)
    INSERT INTO analytics_events (user_id, session_id, event_name, properties)
    VALUES (p_user_id, p_session_id, 'session_idle_flagged', jsonb_build_object(
      'idle_ratio', ROUND(v_idle_ratio, 2),
      'total_logs', v_total_logs,
      'idle_logs', v_idle_logs
    ));
  END IF;

  RETURN v_is_suspicious;
END;
$$;


-- ============================================================
-- 5. TÜKENMİŞLİK ALGILAMA
-- ============================================================

CREATE OR REPLACE FUNCTION public.detect_burnout_risk(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_7d_avg_minutes NUMERIC;
  v_30d_avg_minutes NUMERIC;
  v_7d_session_count INT;
  v_30d_weekly_avg NUMERIC;
  v_risk TEXT := 'none';
BEGIN
  -- Son 7 gün
  SELECT
    COALESCE(AVG(s.duration), 0),
    COUNT(*)
  INTO v_7d_avg_minutes, v_7d_session_count
  FROM sessions s
  JOIN session_participants sp ON sp.session_id = s.id
  WHERE sp.user_id = p_user_id
    AND sp.status = 'completed'
    AND s.started_at >= NOW() - INTERVAL '7 days';

  -- Son 30 gün
  SELECT
    COALESCE(AVG(s.duration), 0),
    COALESCE(COUNT(*)::NUMERIC / 4.0, 0)
  INTO v_30d_avg_minutes, v_30d_weekly_avg
  FROM sessions s
  JOIN session_participants sp ON sp.session_id = s.id
  WHERE sp.user_id = p_user_id
    AND sp.status = 'completed'
    AND s.started_at >= NOW() - INTERVAL '30 days';

  -- Tükenmişlik kontrolü
  IF v_30d_avg_minutes > 0 AND v_30d_weekly_avg > 0 THEN
    IF v_7d_avg_minutes < v_30d_avg_minutes * 0.6
       AND v_7d_session_count < v_30d_weekly_avg * 0.5 THEN
      v_risk := 'high';

      INSERT INTO analytics_events (user_id, event_name, properties)
      VALUES (p_user_id, 'burnout_risk_detected', jsonb_build_object(
        'risk_level', 'high',
        '7d_avg_minutes', ROUND(v_7d_avg_minutes),
        '30d_avg_minutes', ROUND(v_30d_avg_minutes),
        '7d_sessions', v_7d_session_count,
        '30d_weekly_avg', ROUND(v_30d_weekly_avg, 1)
      ))
      ON CONFLICT DO NOTHING;
    ELSIF v_7d_avg_minutes < v_30d_avg_minutes * 0.8
          AND v_7d_session_count < v_30d_weekly_avg * 0.7 THEN
      v_risk := 'medium';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'risk', v_risk,
    '7d_avg_minutes', ROUND(COALESCE(v_7d_avg_minutes, 0)),
    '30d_avg_minutes', ROUND(COALESCE(v_30d_avg_minutes, 0)),
    '7d_sessions', v_7d_session_count
  );
END;
$$;


-- ============================================================
-- 6. GERİLEME ALGILAMA
-- ============================================================

CREATE OR REPLACE FUNCTION public.detect_regression(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user RECORD;
  v_recent_sessions INT;
  v_is_regression BOOLEAN := false;
BEGIN
  SELECT current_streak, longest_streak, last_active_at
  INTO v_user FROM users WHERE id = p_user_id;

  IF v_user IS NULL THEN
    RETURN jsonb_build_object('regression', false);
  END IF;

  -- Son 7 günde tamamlanan seans sayısı
  SELECT COUNT(*) INTO v_recent_sessions
  FROM sessions s
  JOIN session_participants sp ON sp.session_id = s.id
  WHERE sp.user_id = p_user_id
    AND sp.status = 'completed'
    AND s.started_at >= NOW() - INTERVAL '7 days';

  -- Gerileme kriterleri
  IF v_user.current_streak < (v_user.longest_streak * 0.5)
     AND v_recent_sessions = 0
     AND v_user.last_active_at < NOW() - INTERVAL '3 days' THEN
    v_is_regression := true;

    INSERT INTO analytics_events (user_id, event_name, properties)
    VALUES (p_user_id, 'regression_detected', jsonb_build_object(
      'current_streak', v_user.current_streak,
      'longest_streak', v_user.longest_streak,
      'days_inactive', EXTRACT(DAY FROM (NOW() - v_user.last_active_at))
    ))
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'regression', v_is_regression,
    'current_streak', v_user.current_streak,
    'longest_streak', v_user.longest_streak,
    'recent_sessions', v_recent_sessions,
    'days_inactive', EXTRACT(DAY FROM (NOW() - COALESCE(v_user.last_active_at, NOW())))
  );
END;
$$;


-- ============================================================
-- 7. GERİ DÖNÜŞ ALGILAMA (COMEBACK)
-- ============================================================

CREATE OR REPLACE FUNCTION public.detect_comeback(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user RECORD;
  v_days_inactive INT;
BEGIN
  SELECT last_active_at, completed_sessions
  INTO v_user FROM users WHERE id = p_user_id;

  IF v_user IS NULL OR v_user.completed_sessions < 3 THEN
    RETURN false; -- Yeni kullanıcıda comeback olmaz
  END IF;

  v_days_inactive := EXTRACT(DAY FROM (NOW() - COALESCE(v_user.last_active_at, NOW())))::INT;

  -- 14+ gün inaktiflik sonrası geri dönüş
  IF v_days_inactive >= 14 THEN
    INSERT INTO analytics_events (user_id, event_name, properties)
    VALUES (p_user_id, 'comeback_detected', jsonb_build_object(
      'days_inactive', v_days_inactive,
      'previous_sessions', v_user.completed_sessions
    ));
    RETURN true;
  END IF;

  RETURN false;
END;
$$;


-- ============================================================
-- 8. SAHTE STREAK KORUMASI
-- ============================================================
-- complete_session çağrıldığında idle kontrolü yapan wrapper

CREATE OR REPLACE FUNCTION public.validate_session_quality(
  p_session_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_suspicious BOOLEAN;
  v_xp_modifier NUMERIC := 1.0;
  v_count_streak BOOLEAN := true;
BEGIN
  -- Idle oranı kontrol et
  v_suspicious := detect_suspicious_session(p_session_id, p_user_id);

  IF v_suspicious THEN
    v_xp_modifier := 0.5;   -- XP yarıya düşür
    v_count_streak := false;  -- Streak sayılmasın
  END IF;

  RETURN jsonb_build_object(
    'suspicious', v_suspicious,
    'xp_modifier', v_xp_modifier,
    'count_streak', v_count_streak
  );
END;
$$;


-- ============================================================
-- 9. AYNI 2 KULLANICI 24 SAAT TEKRAR EŞLEŞMESİN
-- ============================================================

CREATE OR REPLACE FUNCTION public.check_recent_match(
  p_user_a UUID,
  p_user_b UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recent_match BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM matches
    WHERE (
      (user_a_id = p_user_a AND user_b_id = p_user_b) OR
      (user_a_id = p_user_b AND user_b_id = p_user_a)
    )
    AND created_at > NOW() - INTERVAL '24 hours'
    AND state IN ('completed', 'active', 'preparing')
  ) INTO v_recent_match;

  RETURN v_recent_match; -- true = son 24 saatte eşleşmişler
END;
$$;


-- ============================================================
-- 10. SEANS ARASI MİNİMUM 5DK COOLDOWN
-- ============================================================

CREATE OR REPLACE FUNCTION public.check_session_cooldown(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_session_end TIMESTAMPTZ;
  v_seconds_since INT;
  v_min_cooldown INT := 300; -- 5 dakika = 300 saniye
BEGIN
  -- En son tamamlanan seansın bitiş zamanı
  SELECT MAX(COALESCE(s.ended_at, sp.left_at))
  INTO v_last_session_end
  FROM sessions s
  JOIN session_participants sp ON sp.session_id = s.id
  WHERE sp.user_id = p_user_id
    AND sp.status = 'completed'
    AND s.ended_at IS NOT NULL;

  IF v_last_session_end IS NULL THEN
    RETURN jsonb_build_object('allowed', true, 'remaining_seconds', 0);
  END IF;

  v_seconds_since := EXTRACT(EPOCH FROM (NOW() - v_last_session_end))::INT;

  IF v_seconds_since < v_min_cooldown THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'remaining_seconds', v_min_cooldown - v_seconds_since,
      'last_session_end', v_last_session_end
    );
  END IF;

  RETURN jsonb_build_object('allowed', true, 'remaining_seconds', 0);
END;
$$;


-- ============================================================
-- 11. KİŞİSEL REKOR CACHE — Metadata JSONB'ye yaz
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_personal_records_cache(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_records JSONB;
  v_tz TEXT;
BEGIN
  SELECT timezone INTO v_tz FROM users WHERE id = p_user_id;
  v_tz := COALESCE(v_tz, 'Europe/Istanbul');

  SELECT jsonb_build_object(
    'records', jsonb_build_object(
      'longest_session_minutes', COALESCE((
        SELECT MAX(EXTRACT(EPOCH FROM (
          COALESCE(sp.left_at, s.ended_at) - sp.joined_at
        )) / 60.0)::INT
        FROM sessions s
        JOIN session_participants sp ON sp.session_id = s.id
        WHERE sp.user_id = p_user_id AND sp.status = 'completed'
      ), 0),
      'max_sessions_per_day', COALESCE((
        SELECT MAX(cnt) FROM (
          SELECT COUNT(*) AS cnt
          FROM sessions s
          JOIN session_participants sp ON sp.session_id = s.id
          WHERE sp.user_id = p_user_id AND sp.status = 'completed'
          GROUP BY DATE(s.started_at AT TIME ZONE v_tz)
        ) sub
      ), 0),
      'latest_hour', COALESCE((
        SELECT MAX(EXTRACT(HOUR FROM s.started_at AT TIME ZONE v_tz))::INT
        FROM sessions s
        JOIN session_participants sp ON sp.session_id = s.id
        WHERE sp.user_id = p_user_id AND sp.status = 'completed'
      ), 0),
      'updated_at', NOW()
    )
  ) INTO v_records;

  UPDATE users
  SET metadata = COALESCE(metadata, '{}') || v_records
  WHERE id = p_user_id;
END;
$$;


-- ============================================================
-- 12. XP DEĞİŞİMİ KAYIT FONKSİYONU
-- ============================================================

CREATE OR REPLACE FUNCTION public.log_xp_change(
  p_user_id UUID,
  p_amount INT,
  p_reason TEXT,
  p_session_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_xp_before INT;
BEGIN
  SELECT xp INTO v_xp_before FROM users WHERE id = p_user_id;

  INSERT INTO xp_ledger (user_id, session_id, amount, reason, xp_before, xp_after, metadata)
  VALUES (p_user_id, p_session_id, p_amount, p_reason, v_xp_before, v_xp_before + p_amount, p_metadata);
END;
$$;


-- ============================================================
-- 13. CRON GÜNLENMESİNE EK KONTROLLER
-- ============================================================

CREATE OR REPLACE FUNCTION public.cron_behavioral_checks()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_burnout_count INT := 0;
  v_regression_count INT := 0;
  v_comeback_count INT := 0;
  v_stagnation_count INT := 0;
  v_user RECORD;
  v_result JSONB;
BEGIN
  -- Aktif kullanıcılarda (son 60 günde seans yapmış) tükenmişlik ve gerileme tara
  FOR v_user IN
    SELECT DISTINCT sp.user_id
    FROM session_participants sp
    JOIN sessions s ON s.id = sp.session_id
    WHERE sp.status = 'completed'
      AND s.started_at >= NOW() - INTERVAL '60 days'
  LOOP
    -- Tükenmişlik
    v_result := detect_burnout_risk(v_user.user_id);
    IF (v_result->>'risk') = 'high' THEN
      v_burnout_count := v_burnout_count + 1;
    END IF;

    -- Gerileme
    v_result := detect_regression(v_user.user_id);
    IF (v_result->>'regression')::BOOLEAN THEN
      v_regression_count := v_regression_count + 1;
    END IF;
  END LOOP;

  -- Maturity stage güncelle (tüm kullanıcılar)
  -- (update_maturity_stage auth.uid() kullanıyor, cron'da doğrudan güncelle)
  UPDATE users SET maturity_stage = CASE
    WHEN completed_sessions >= 15 AND EXTRACT(DAY FROM (NOW() - created_at)) >= 30 THEN 'mastery'
    WHEN completed_sessions >= 10 AND EXTRACT(DAY FROM (NOW() - created_at)) >= 14 THEN 'growth'
    WHEN completed_sessions >= 3 AND EXTRACT(DAY FROM (NOW() - created_at)) >= 3 THEN 'formation'
    ELSE 'discovery'
  END
  WHERE maturity_stage != CASE
    WHEN completed_sessions >= 15 AND EXTRACT(DAY FROM (NOW() - created_at)) >= 30 THEN 'mastery'
    WHEN completed_sessions >= 10 AND EXTRACT(DAY FROM (NOW() - created_at)) >= 14 THEN 'growth'
    WHEN completed_sessions >= 3 AND EXTRACT(DAY FROM (NOW() - created_at)) >= 3 THEN 'formation'
    ELSE 'discovery'
  END;
  GET DIAGNOSTICS v_stagnation_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'burnout_alerts', v_burnout_count,
    'regression_alerts', v_regression_count,
    'stage_updates', v_stagnation_count,
    'ran_at', NOW()
  );
END;
$$;


-- ============================================================
-- 14. GRANT PERMISSIONS
-- ============================================================

GRANT EXECUTE ON FUNCTION public.detect_suspicious_session(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_burnout_risk(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_regression(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_comeback(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_session_quality(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_recent_match(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_session_cooldown(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_personal_records_cache(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_xp_change(UUID, INT, TEXT, UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cron_behavioral_checks() TO authenticated;
