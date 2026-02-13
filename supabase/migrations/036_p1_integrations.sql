-- ============================================================
-- 036: P1 ENTEGRASYONLAR — Sertleştirme Fonksiyonlarını Mevcut Akışlara Bağla
-- Date: 2026-02-13
-- ============================================================
-- 1. complete_session → validate_session_quality + log_xp_change + update_personal_records_cache
-- 2. complete_solo_session → aynı entegrasyonlar
-- 3. find_match → check_recent_match
-- 4. cron_daily_maintenance → invariant + behavioral checks
-- ============================================================


-- ============================================================
-- 1. COMPLETE_SESSION — Sertleştirme entegrasyonu
-- ============================================================
-- Değişiklikler:
--   a. validate_session_quality çağır → suspicious ise XP modifier uygula
--   b. log_xp_change ile XP audit trail yaz
--   c. update_personal_records_cache çağır
--   d. total_minutes = gerçek süre (duration değil)

CREATE OR REPLACE FUNCTION public.complete_session(
  p_session_id UUID,
  p_user_id UUID,
  p_rating INTEGER DEFAULT NULL,
  p_goal_completed BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session RECORD;
  v_xp_earned INTEGER := 0;
  v_trust_change INTEGER := 0;
  v_streak INTEGER;
  v_last_date DATE;
  v_today DATE := CURRENT_DATE;
  v_result JSONB;
  v_remaining INTEGER;
  v_quality JSONB;
  v_xp_modifier NUMERIC := 1.0;
  v_count_streak BOOLEAN := true;
  v_actual_minutes INTEGER;
  v_participant RECORD;
BEGIN
  -- Session bilgisini al
  SELECT * INTO v_session FROM public.sessions WHERE id = p_session_id;

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Session not found';
  END IF;

  -- Idempotent: zaten completed ise tekrar işleme
  IF EXISTS (
    SELECT 1 FROM public.session_participants
    WHERE session_id = p_session_id AND user_id = p_user_id AND status = 'completed'
  ) THEN
    RETURN jsonb_build_object(
      'xp_earned', 0,
      'trust_change', 0,
      'new_streak', (SELECT current_streak FROM public.users WHERE id = p_user_id),
      'goal_completed', false
    );
  END IF;

  -- ★ SERTLEŞTIRME: Seans kalitesi kontrol et (idle detection)
  v_quality := validate_session_quality(p_session_id, p_user_id);
  v_xp_modifier := (v_quality->>'xp_modifier')::NUMERIC;
  v_count_streak := (v_quality->>'count_streak')::BOOLEAN;

  -- Gerçek çalışılan süreyi hesapla (seçilen duration'ınız değil)
  SELECT EXTRACT(EPOCH FROM (NOW() - sp.joined_at)) / 60.0
  INTO v_actual_minutes
  FROM session_participants sp
  WHERE sp.session_id = p_session_id AND sp.user_id = p_user_id;
  v_actual_minutes := GREATEST(COALESCE(v_actual_minutes, v_session.duration), 1);

  -- Base XP + trust
  v_xp_earned := 50;
  v_trust_change := 2;

  -- Goal completed bonus
  IF p_goal_completed THEN
    v_xp_earned := v_xp_earned + 10;
  END IF;

  -- Rating XP bonus
  IF p_rating IS NOT NULL THEN
    IF p_rating = 5 THEN
      v_xp_earned := v_xp_earned + 10;
    ELSIF p_rating = 4 THEN
      v_xp_earned := v_xp_earned + 5;
    END IF;
  END IF;

  -- Streak hesapla
  SELECT current_streak, last_session_date
  INTO v_streak, v_last_date
  FROM public.users
  WHERE id = p_user_id;

  IF v_count_streak THEN
    IF v_last_date IS NULL OR v_last_date < v_today - 1 THEN
      v_streak := 1;
    ELSIF v_last_date = v_today - 1 THEN
      v_streak := v_streak + 1;
    END IF;
    -- v_last_date = v_today ise streak zaten sayılmış

    -- Streak XP bonus (günde bir kez)
    IF v_last_date IS DISTINCT FROM v_today THEN
      v_xp_earned := v_xp_earned + 20;
    END IF;
  END IF;

  -- ★ SERTLEŞTIRME: XP modifier uygula (idle ise yarıya düşer)
  v_xp_earned := GREATEST(1, (v_xp_earned * v_xp_modifier)::INTEGER);

  -- Session participant güncelle
  UPDATE public.session_participants
  SET status = 'completed',
      left_at = NOW(),
      rating = p_rating,
      goal_completed = p_goal_completed,
      xp_earned = v_xp_earned,
      trust_score_change = v_trust_change
  WHERE session_id = p_session_id AND user_id = p_user_id;

  -- Trust score güncelle (yeni 5-param signature from 035)
  PERFORM public.update_trust_score(
    p_user_id, 'session_completed', p_session_id, NULL, '{}'::jsonb
  );

  -- User stats güncelle (total_minutes = gerçek süre)
  UPDATE public.users
  SET total_sessions = total_sessions + 1,
      completed_sessions = completed_sessions + 1,
      total_minutes = total_minutes + v_actual_minutes,
      current_streak = v_streak,
      longest_streak = GREATEST(longest_streak, v_streak),
      last_session_date = v_today,
      xp = xp + v_xp_earned,
      level = calc_level(xp + v_xp_earned),
      last_active_at = NOW()
  WHERE id = p_user_id;

  -- ★ SERTLEŞTIRME: XP audit trail
  PERFORM log_xp_change(
    p_user_id, v_xp_earned, 'session_complete', p_session_id,
    jsonb_build_object('suspicious', (v_quality->>'suspicious')::BOOLEAN, 'modifier', v_xp_modifier)
  );

  -- ★ SERTLEŞTIRME: Kişisel rekor cache güncelle
  PERFORM update_personal_records_cache(p_user_id);

  -- User limits güncelle
  INSERT INTO public.user_limits (user_id, date, sessions_used, max_sessions)
  VALUES (
    p_user_id, v_today, 1,
    CASE WHEN (SELECT is_premium FROM public.users WHERE id = p_user_id) THEN 999 ELSE 3 END
  )
  ON CONFLICT (user_id, date)
  DO UPDATE SET sessions_used = public.user_limits.sessions_used + 1;

  -- Session status: tüm participant'lar completed mı?
  PERFORM 1 FROM public.sessions WHERE id = p_session_id FOR UPDATE;

  SELECT COUNT(*) INTO v_remaining
  FROM public.session_participants
  WHERE session_id = p_session_id
    AND status IN ('waiting', 'active');

  IF v_remaining = 0 THEN
    UPDATE public.sessions
    SET status = 'completed', ended_at = NOW()
    WHERE id = p_session_id AND status != 'completed';
  END IF;

  v_result := jsonb_build_object(
    'xp_earned', v_xp_earned,
    'trust_change', v_trust_change,
    'new_streak', v_streak,
    'goal_completed', p_goal_completed,
    'suspicious', (v_quality->>'suspicious')::BOOLEAN
  );

  RETURN v_result;
END;
$$;


-- ============================================================
-- 2. COMPLETE_SOLO_SESSION — Sertleştirme entegrasyonu
-- ============================================================

CREATE OR REPLACE FUNCTION public.complete_solo_session(
  p_session_id UUID,
  p_user_id UUID,
  p_goal_completed BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session RECORD;
  v_xp_earned INTEGER := 0;
  v_trust_change INTEGER := 0;
  v_streak INTEGER;
  v_last_date DATE;
  v_today DATE := CURRENT_DATE;
  v_result JSONB;
  v_user_trust INTEGER;
  v_is_rehabilitation BOOLEAN := false;
  v_new_xp INTEGER;
  v_new_level INTEGER;
  v_quality JSONB;
  v_xp_modifier NUMERIC := 1.0;
  v_count_streak BOOLEAN := true;
  v_actual_minutes INTEGER;
BEGIN
  SELECT * INTO v_session FROM public.sessions WHERE id = p_session_id;

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Session not found';
  END IF;

  -- ★ SERTLEŞTIRME: Seans kalitesi kontrol et
  v_quality := validate_session_quality(p_session_id, p_user_id);
  v_xp_modifier := (v_quality->>'xp_modifier')::NUMERIC;
  v_count_streak := (v_quality->>'count_streak')::BOOLEAN;

  -- Gerçek çalışılan süre
  SELECT EXTRACT(EPOCH FROM (NOW() - sp.joined_at)) / 60.0
  INTO v_actual_minutes
  FROM session_participants sp
  WHERE sp.session_id = p_session_id AND sp.user_id = p_user_id;
  v_actual_minutes := GREATEST(COALESCE(v_actual_minutes, v_session.duration), 1);

  -- Trust kontrol
  SELECT trust_score INTO v_user_trust FROM public.users WHERE id = p_user_id;

  IF v_user_trust < 50 THEN
    v_trust_change := 5;
    v_is_rehabilitation := true;
  ELSE
    v_trust_change := 2;
  END IF;

  -- Base XP
  v_xp_earned := 40;

  IF p_goal_completed THEN
    v_xp_earned := v_xp_earned + 10;
  END IF;

  -- Streak hesapla
  SELECT current_streak, last_session_date INTO v_streak, v_last_date
  FROM public.users WHERE id = p_user_id;

  IF v_count_streak THEN
    IF v_last_date = v_today THEN
      NULL;
    ELSIF v_last_date = v_today - 1 THEN
      v_streak := v_streak + 1;
    ELSE
      v_streak := 1;
    END IF;
  END IF;

  -- ★ SERTLEŞTIRME: XP modifier uygula
  v_xp_earned := GREATEST(1, (v_xp_earned * v_xp_modifier)::INTEGER);

  -- Yeni XP ve level hesapla
  SELECT xp INTO v_new_xp FROM users WHERE id = p_user_id;
  v_new_xp := COALESCE(v_new_xp, 0) + v_xp_earned;
  v_new_level := calc_level(v_new_xp);

  -- Kullanıcıyı güncelle (total_minutes = gerçek süre)
  UPDATE public.users
  SET
    xp = v_new_xp,
    level = v_new_level,
    total_sessions = total_sessions + 1,
    completed_sessions = completed_sessions + 1,
    total_minutes = total_minutes + v_actual_minutes,
    current_streak = v_streak,
    longest_streak = GREATEST(longest_streak, v_streak),
    last_session_date = v_today,
    last_active_at = NOW()
  WHERE id = p_user_id;

  -- ★ SERTLEŞTIRME: XP audit trail
  PERFORM log_xp_change(
    p_user_id, v_xp_earned, 'solo_session_complete', p_session_id,
    jsonb_build_object('suspicious', (v_quality->>'suspicious')::BOOLEAN, 'rehabilitation', v_is_rehabilitation)
  );

  -- ★ SERTLEŞTIRME: Kişisel rekor cache güncelle
  PERFORM update_personal_records_cache(p_user_id);

  -- Level-up bildirim
  IF v_new_level > calc_level(v_new_xp - v_xp_earned) THEN
    PERFORM emit_notification(
      p_user_id,
      'level_up',
      'Seviye Atladın! 🚀',
      'Artık seviye ' || v_new_level || ' oldun!',
      jsonb_build_object('new_level', v_new_level, 'xp', v_new_xp)
    );
  END IF;

  -- Trust güncelle (yeni 5-param signature)
  PERFORM public.update_trust_score(
    p_user_id,
    CASE WHEN v_is_rehabilitation THEN 'solo_session_completed' ELSE 'session_completed' END,
    p_session_id,
    NULL,
    jsonb_build_object('rehabilitation', v_is_rehabilitation)
  );

  -- Session'ı tamamla
  UPDATE public.sessions
  SET status = 'completed', ended_at = NOW()
  WHERE id = p_session_id;

  UPDATE public.session_participants
  SET status = 'completed', left_at = NOW(),
      xp_earned = v_xp_earned,
      trust_score_change = v_trust_change,
      goal_completed = p_goal_completed
  WHERE session_id = p_session_id AND user_id = p_user_id;

  -- Rozet kontrolü
  PERFORM check_badges(p_user_id, p_session_id);

  v_result := jsonb_build_object(
    'xp_earned', v_xp_earned,
    'trust_change', v_trust_change,
    'new_streak', v_streak,
    'new_level', v_new_level,
    'rehabilitation', v_is_rehabilitation,
    'suspicious', (v_quality->>'suspicious')::BOOLEAN
  );

  RETURN v_result;
END;
$$;


-- ============================================================
-- 3. FIND_MATCH — check_recent_match entegrasyonu
-- ============================================================
-- Son 24 saatte eşleşmiş 2 kullanıcı tekrar eşleşemez

CREATE OR REPLACE FUNCTION public.find_match(
  p_user_id UUID,
  p_duration INTEGER,
  p_theme TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner_queue_id UUID;
  v_partner_id UUID;
  v_session_id UUID;
  v_user_trust INTEGER;
  v_max_wait_time INTEGER := 60;
  v_cooldown JSONB;
BEGIN
  -- Kullanıcının trust score'unu al
  SELECT trust_score INTO v_user_trust FROM public.users WHERE id = p_user_id;

  -- Trust < 50 ise solo mode
  IF v_user_trust < 50 THEN
    RETURN NULL;
  END IF;

  -- ★ SERTLEŞTIRME: Seans arası cooldown kontrolü
  v_cooldown := check_session_cooldown(p_user_id);
  IF NOT (v_cooldown->>'allowed')::BOOLEAN THEN
    RETURN NULL;  -- Cooldown bitmemiş, eşleşme yapılmaz
  END IF;

  -- 1. İlk deneme: Exact match (aynı duration + aynı theme)
  --    ★ SERTLEŞTIRME: check_recent_match ile son 24h kontrolü
  SELECT mq.id, mq.user_id
  INTO v_partner_queue_id, v_partner_id
  FROM public.matching_queue mq
  JOIN public.users u ON mq.user_id = u.id
  WHERE mq.status = 'waiting'
    AND mq.user_id != p_user_id
    AND mq.duration = p_duration
    AND mq.theme = p_theme
    AND mq.expires_at > NOW()
    AND u.is_banned = false
    AND u.trust_score >= 50
    AND NOT check_recent_match(p_user_id, mq.user_id)  -- ★ 24h tekrar engeli
  ORDER BY
    (
      (LEAST(EXTRACT(EPOCH FROM (NOW() - mq.created_at))::FLOAT / v_max_wait_time, 1.0) * 1.0)
      + (((u.trust_score - 50)::FLOAT / 100.0) * 0.3)
      + (LEAST(EXTRACT(EPOCH FROM (NOW() - mq.created_at))::FLOAT / 60.0, 1.0) * 0.5 * 0.2)
    ) DESC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  -- 2. Fallback: Aynı duration, farklı theme
  IF v_partner_id IS NULL THEN
    SELECT mq.id, mq.user_id
    INTO v_partner_queue_id, v_partner_id
    FROM public.matching_queue mq
    JOIN public.users u ON mq.user_id = u.id
    WHERE mq.status = 'waiting'
      AND mq.user_id != p_user_id
      AND mq.duration = p_duration
      AND mq.expires_at > NOW()
      AND u.is_banned = false
      AND u.trust_score >= 50
      AND NOT check_recent_match(p_user_id, mq.user_id)  -- ★ 24h tekrar engeli
    ORDER BY
      (
        (LEAST(EXTRACT(EPOCH FROM (NOW() - mq.created_at))::FLOAT / v_max_wait_time, 1.0) * 1.0)
        + (((u.trust_score - 50)::FLOAT / 100.0) * 0.3)
        + (LEAST(EXTRACT(EPOCH FROM (NOW() - mq.created_at))::FLOAT / 60.0, 1.0) * 0.5 * 0.2)
      ) DESC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;
  END IF;

  IF v_partner_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Session oluştur
  INSERT INTO public.sessions (duration, mode, theme, status, scheduled_start)
  VALUES (p_duration, 'duo', p_theme, 'waiting', NOW() + INTERVAL '30 seconds')
  RETURNING id INTO v_session_id;

  INSERT INTO public.session_participants (session_id, user_id, status)
  VALUES
    (v_session_id, p_user_id, 'waiting'),
    (v_session_id, v_partner_id, 'waiting');

  UPDATE public.matching_queue
  SET status = 'matched'
  WHERE id = v_partner_queue_id;

  UPDATE public.matching_queue
  SET status = 'matched'
  WHERE user_id = p_user_id AND status = 'waiting';

  -- ★ SERTLEŞTIRME: Geri dönüş algılama (her iki kullanıcı)
  PERFORM detect_comeback(p_user_id);
  PERFORM detect_comeback(v_partner_id);

  RETURN v_session_id;
END;
$$;


-- ============================================================
-- 4. CRON_DAILY_MAINTENANCE — Sertleştirme kontrolleri ekle
-- ============================================================
-- Mevcut fonksiyona invariant + behavioral checks entegre et

CREATE OR REPLACE FUNCTION public.cron_daily_maintenance()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_streak_reset INT := 0;
  v_streak_risk INT := 0;
  v_notif_cleaned INT := 0;
  v_invariant_result JSONB;
  v_behavioral_result JSONB;
BEGIN
  -- 1. Kırılan streak'leri sıfırla (2+ gün öncesi — timezone koruması)
  UPDATE users
  SET current_streak = 0
  WHERE last_session_date < CURRENT_DATE - 1
    AND current_streak > 0;
  GET DIAGNOSTICS v_streak_reset = ROW_COUNT;

  -- 2. Streak risk bildirimleri (dün seans yapmamış ama streak > 3)
  INSERT INTO notifications (user_id, type, title, body, metadata)
  SELECT
    id,
    'streak_risk',
    'Serin tehlikede! 🔥',
    current_streak || ' günlük serin bugün kırılabilir. Kısa bir seans?',
    jsonb_build_object('current_streak', current_streak)
  FROM users
  WHERE last_session_date = CURRENT_DATE - 1
    AND current_streak >= 3
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.user_id = users.id
        AND n.type = 'streak_risk'
        AND n.created_at > NOW() - INTERVAL '20 hours'
    );
  GET DIAGNOSTICS v_streak_risk = ROW_COUNT;

  -- 3. 30+ günlük eski bildirimleri temizle
  DELETE FROM notifications WHERE created_at < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS v_notif_cleaned = ROW_COUNT;

  -- ★ SERTLEŞTIRME: 4. Invariant kontrolleri çalıştır
  v_invariant_result := cron_invariant_checks();

  -- ★ SERTLEŞTIRME: 5. Davranışsal kontroller çalıştır
  v_behavioral_result := cron_behavioral_checks();

  RETURN jsonb_build_object(
    'streaks_reset', v_streak_reset,
    'streak_risks_sent', v_streak_risk,
    'notifications_cleaned', v_notif_cleaned,
    'invariant_checks', v_invariant_result,
    'behavioral_checks', v_behavioral_result,
    'ran_at', NOW()
  );
END;
$$;


-- ============================================================
-- 5. GRANT PERMISSIONS
-- ============================================================
GRANT EXECUTE ON FUNCTION public.complete_session(UUID, UUID, INTEGER, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_solo_session(UUID, UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_match(UUID, INTEGER, TEXT) TO authenticated;
