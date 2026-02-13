-- ============================================================
-- 028: ROZET GENİŞLETME + BİLDİRİM SİSTEMİ + XP REVİZYONU
-- Date: 2026-02-13
-- ============================================================
-- 1. 12 yeni rozet (mevcut 13 → 25)
-- 2. notifications tablosu
-- 3. Bildirim RPC'leri (get, mark_read, unread_count, emit)
-- 4. check_badges v2 (yeni rozetler dahil)
-- 5. XP level formülü güncelleme
-- ============================================================


-- ============================================================
-- 1. YENİ ROZETLER (14-25)
-- ============================================================

-- Mevcut rozetler (001'den): FIRST_SESSION(1), SESSIONS_10(2), SESSIONS_50(3),
-- SESSIONS_100(4), STREAK_7(5), STREAK_30(6), FOCUS_500(7), TRUST_120(8)
-- FOMO rozetleri (026'dan): STREAK_3(9), NIGHT_OWL(10), EARLY_BIRD(11),
-- MARATHON_90(12), FOCUS_50(13)
-- Bu migration: yeni ID'ler 14-24 (SESSIONS_100 ve STREAK_30 zaten var, atlanıyor)

INSERT INTO public.achievements (id, code, name, description, icon, requirement, rarity) VALUES
  (14, 'STREAK_14',     'İki Haftalık',          '14 günlük seri yap',                   '🔥', '{"type": "streak", "value": 14}',                 'epic'),
  (15, 'SESSIONS_25',   'Çeyrek Yüz',            '25 seans tamamla',                     '🎯', '{"type": "sessions", "value": 25}',               'common'),
  (16, 'MINUTES_1000',  'Bin Dakika',             '1000 dakika odaklan',                  '⏱️', '{"type": "minutes", "value": 1000}',              'epic'),
  (17, 'MINUTES_5000',  'Beş Bin',                '5000 dakika odaklan',                  '🏅', '{"type": "minutes", "value": 5000}',              'legendary'),
  (18, 'TRUST_150',     'Güven Efsanesi',         'Trust skoru 150''ye ulaş',             '🛡️', '{"type": "trust", "value": 150}',                 'legendary'),
  (19, 'DUO_10',        'İkili Uzman',            '10 duo seans tamamla',                 '🤝', '{"type": "duo_sessions", "value": 10}',           'rare'),
  (20, 'DUO_50',        'Ortak Ruh',              '50 duo seans tamamla',                 '💞', '{"type": "duo_sessions", "value": 50}',           'epic'),
  (21, 'WEEKEND',       'Hafta Sonu Savaşçısı',   'Cumartesi veya Pazar seans tamamla',   '🌴', '{"type": "day_of_week", "days": [6, 7]}',         'common'),
  (22, 'COMEBACK',      'Geri Dönüş',             '7+ gün sonra geri dön',               '🦅', '{"type": "comeback", "min_days": 7}',             'rare'),
  (23, 'PERFECT_WEEK',  'Mükemmel Hafta',         '7 gün üst üste seans yap',            '👑', '{"type": "streak", "value": 7}',                  'legendary')
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- 2. BİLDİRİM TABLOSU
-- ============================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  type TEXT NOT NULL CHECK (type IN (
    'badge_unlocked',
    'level_up',
    'streak_risk',
    'streak_milestone',
    'session_reminder',
    'weekly_summary',
    'system'
  )),

  title TEXT NOT NULL,
  body TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',

  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user
  ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON public.notifications(user_id, read) WHERE read = false;

COMMENT ON TABLE public.notifications IS 'Kullanıcı bildirimleri: rozet, level-up, streak risk, sistem.';

-- RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own notifications"
  ON public.notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- No direct INSERT from client — only via SECURITY DEFINER RPCs


-- ============================================================
-- 3. EMIT_NOTIFICATION — Internal helper (SECURITY DEFINER)
-- ============================================================

CREATE OR REPLACE FUNCTION public.emit_notification(
  p_user_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_body TEXT,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO notifications (user_id, type, title, body, metadata)
  VALUES (p_user_id, p_type, p_title, p_body, p_metadata)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;


-- ============================================================
-- 4. GET_NOTIFICATIONS — Son N bildirim
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_notifications(
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_items JSONB := '[]'::JSONB;
  v_unread INT;
  v_row RECORD;
BEGIN
  -- Unread count
  SELECT COUNT(*) INTO v_unread
  FROM notifications
  WHERE user_id = v_uid AND read = false;

  -- Latest notifications
  FOR v_row IN
    SELECT id, type, title, body, metadata, read, created_at
    FROM notifications
    WHERE user_id = v_uid
    ORDER BY created_at DESC
    LIMIT p_limit OFFSET p_offset
  LOOP
    v_items := v_items || jsonb_build_object(
      'id', v_row.id,
      'type', v_row.type,
      'title', v_row.title,
      'body', v_row.body,
      'metadata', v_row.metadata,
      'read', v_row.read,
      'created_at', v_row.created_at
    );
  END LOOP;

  RETURN jsonb_build_object(
    'notifications', v_items,
    'unread_count', COALESCE(v_unread, 0)
  );
END;
$$;


-- ============================================================
-- 5. MARK_NOTIFICATIONS_READ
-- ============================================================

CREATE OR REPLACE FUNCTION public.mark_notifications_read(
  p_ids UUID[]
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE notifications
  SET read = true
  WHERE id = ANY(p_ids)
    AND user_id = auth.uid()
    AND read = false;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


-- ============================================================
-- 6. GET_UNREAD_COUNT
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_unread_count()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)
    FROM notifications
    WHERE user_id = auth.uid() AND read = false
  );
END;
$$;


-- ============================================================
-- 7. CHECK_BADGES V2 — Tüm 25 rozeti kontrol et + bildirim
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
  v_duo_count INT;
  v_days_absent INT;
BEGIN
  -- User bilgileri
  SELECT total_sessions, completed_sessions, current_streak, longest_streak,
         trust_score, total_minutes, last_session_date
  INTO v_user
  FROM users WHERE id = p_user_id;

  IF v_user IS NULL THEN RETURN v_unlocked; END IF;

  -- Session bilgileri
  SELECT s.duration, s.started_at, s.mode
  INTO v_session
  FROM sessions s
  JOIN session_participants sp ON sp.session_id = s.id
  WHERE s.id = p_session_id AND sp.user_id = p_user_id;

  IF v_session.started_at IS NOT NULL THEN
    v_session_hour := EXTRACT(HOUR FROM v_session.started_at)::INT;
  END IF;

  -- Duo session count (for DUO badges)
  SELECT COUNT(*) INTO v_duo_count
  FROM session_participants sp
  JOIN sessions s ON s.id = sp.session_id
  WHERE sp.user_id = p_user_id
    AND sp.status = 'completed'
    AND s.mode = 'duo';

  -- Days absent (for COMEBACK badge)
  IF v_user.last_session_date IS NOT NULL THEN
    v_days_absent := CURRENT_DATE - v_user.last_session_date;
  ELSE
    v_days_absent := 999;
  END IF;

  -- Her rozeti kontrol et
  FOR v_achievement IN
    SELECT id, code, name, description, icon, requirement FROM achievements ORDER BY id
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

      WHEN 'SESSIONS_25' THEN
        IF v_user.completed_sessions >= 25 THEN
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

      WHEN 'STREAK_14' THEN
        IF v_user.current_streak >= 14 OR v_user.longest_streak >= 14 THEN
          INSERT INTO user_achievements (user_id, achievement_id) VALUES (p_user_id, v_achievement.id);
          v_unlocked := array_append(v_unlocked, v_achievement.code);
        END IF;

      WHEN 'STREAK_30' THEN
        IF v_user.current_streak >= 30 OR v_user.longest_streak >= 30 THEN
          INSERT INTO user_achievements (user_id, achievement_id) VALUES (p_user_id, v_achievement.id);
          v_unlocked := array_append(v_unlocked, v_achievement.code);
        END IF;

      WHEN 'PERFECT_WEEK' THEN
        IF v_user.current_streak >= 7 THEN
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

      WHEN 'WEEKEND' THEN
        IF EXTRACT(ISODOW FROM CURRENT_DATE)::INT IN (6, 7) THEN
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

      -- Total minutes badges
      WHEN 'FOCUS_500' THEN
        IF COALESCE(v_user.total_minutes, 0) >= 500 THEN
          INSERT INTO user_achievements (user_id, achievement_id) VALUES (p_user_id, v_achievement.id);
          v_unlocked := array_append(v_unlocked, v_achievement.code);
        END IF;

      WHEN 'MINUTES_1000' THEN
        IF COALESCE(v_user.total_minutes, 0) >= 1000 THEN
          INSERT INTO user_achievements (user_id, achievement_id) VALUES (p_user_id, v_achievement.id);
          v_unlocked := array_append(v_unlocked, v_achievement.code);
        END IF;

      WHEN 'MINUTES_5000' THEN
        IF COALESCE(v_user.total_minutes, 0) >= 5000 THEN
          INSERT INTO user_achievements (user_id, achievement_id) VALUES (p_user_id, v_achievement.id);
          v_unlocked := array_append(v_unlocked, v_achievement.code);
        END IF;

      -- Trust badge
      WHEN 'TRUST_120' THEN
        IF v_user.trust_score >= 120 THEN
          INSERT INTO user_achievements (user_id, achievement_id) VALUES (p_user_id, v_achievement.id);
          v_unlocked := array_append(v_unlocked, v_achievement.code);
        END IF;

      WHEN 'TRUST_150' THEN
        IF v_user.trust_score >= 150 THEN
          INSERT INTO user_achievements (user_id, achievement_id) VALUES (p_user_id, v_achievement.id);
          v_unlocked := array_append(v_unlocked, v_achievement.code);
        END IF;

      -- Duo badges
      WHEN 'DUO_10' THEN
        IF v_duo_count >= 10 THEN
          INSERT INTO user_achievements (user_id, achievement_id) VALUES (p_user_id, v_achievement.id);
          v_unlocked := array_append(v_unlocked, v_achievement.code);
        END IF;

      WHEN 'DUO_50' THEN
        IF v_duo_count >= 50 THEN
          INSERT INTO user_achievements (user_id, achievement_id) VALUES (p_user_id, v_achievement.id);
          v_unlocked := array_append(v_unlocked, v_achievement.code);
        END IF;

      -- Comeback badge
      WHEN 'COMEBACK' THEN
        IF v_days_absent >= 7 AND v_days_absent < 999 THEN
          INSERT INTO user_achievements (user_id, achievement_id) VALUES (p_user_id, v_achievement.id);
          v_unlocked := array_append(v_unlocked, v_achievement.code);
        END IF;

    ELSE
      NULL; -- Bilinmeyen rozet, atla
    END CASE;
  END LOOP;

  -- Emit notifications for each unlocked badge
  FOR i IN 1..COALESCE(array_length(v_unlocked, 1), 0) LOOP
    PERFORM emit_notification(
      p_user_id,
      'badge_unlocked',
      'Yeni Rozet Açıldı! 🎉',
      v_unlocked[i] || ' rozeti kazandın!',
      jsonb_build_object('badge_code', v_unlocked[i])
    );
  END LOOP;

  RETURN v_unlocked;
END;
$$;


-- ============================================================
-- 8. XP LEVEL FORMÜLÜ GÜNCELLEMESİ
-- level = floor(sqrt(xp / 100)) + 1  (logaritmik)
-- L1=0, L2=100, L3=400, L4=900, L5=1600...
-- ============================================================

-- Helper: XP'den level hesapla
CREATE OR REPLACE FUNCTION public.calc_level(p_xp INT)
RETURNS INT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN GREATEST(1, FLOOR(SQRT(GREATEST(p_xp, 0)::FLOAT / 100.0))::INT + 1);
END;
$$;

-- Mevcut kullanıcıların level'larını güncelle
UPDATE public.users
SET level = GREATEST(1, FLOOR(SQRT(GREATEST(xp, 0)::FLOAT / 100.0))::INT + 1);

-- complete_solo_session içindeki level hesabını güncelle
-- (Bu fonksiyon 004_trust_system_enhancements.sql'de tanımlı, burada sadece level satırını override ediyoruz)
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
BEGIN
  -- Session bilgisini al
  SELECT * INTO v_session FROM public.sessions WHERE id = p_session_id;

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Session not found';
  END IF;

  -- Kullanıcının trust'ını kontrol et
  SELECT trust_score INTO v_user_trust FROM public.users WHERE id = p_user_id;

  -- Rehabilitation mode mu?
  IF v_user_trust < 50 THEN
    v_trust_change := 5;
    v_is_rehabilitation := true;
  ELSE
    v_trust_change := 2;
  END IF;

  -- Base XP
  v_xp_earned := 40;

  -- Goal bonus
  IF p_goal_completed THEN
    v_xp_earned := v_xp_earned + 10;
  END IF;

  -- Streak hesapla
  SELECT current_streak, last_session_date INTO v_streak, v_last_date
  FROM public.users WHERE id = p_user_id;

  IF v_last_date = v_today THEN
    NULL;
  ELSIF v_last_date = v_today - 1 THEN
    v_streak := v_streak + 1;
  ELSE
    v_streak := 1;
  END IF;

  -- Yeni XP ve level hesapla (logaritmik formül)
  SELECT xp INTO v_new_xp FROM users WHERE id = p_user_id;
  v_new_xp := COALESCE(v_new_xp, 0) + v_xp_earned;
  v_new_level := calc_level(v_new_xp);

  -- Kullanıcıyı güncelle
  UPDATE public.users
  SET
    xp = v_new_xp,
    level = v_new_level,
    total_sessions = total_sessions + 1,
    completed_sessions = completed_sessions + 1,
    total_minutes = total_minutes + v_session.duration,
    current_streak = v_streak,
    longest_streak = GREATEST(longest_streak, v_streak),
    last_session_date = v_today,
    last_active_at = NOW()
  WHERE id = p_user_id;

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

  -- Trust güncelle
  PERFORM public.update_trust_score(
    p_user_id,
    p_session_id,
    CASE WHEN v_is_rehabilitation THEN 'solo_session_completed' ELSE 'session_completed' END,
    v_trust_change,
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

  -- Sonuç
  v_result := jsonb_build_object(
    'xp_earned', v_xp_earned,
    'trust_change', v_trust_change,
    'new_streak', v_streak,
    'new_level', v_new_level,
    'rehabilitation', v_is_rehabilitation
  );

  RETURN v_result;
END;
$$;


-- ============================================================
-- 9. GRANT PERMISSIONS
-- ============================================================

GRANT EXECUTE ON FUNCTION public.emit_notification(UUID, TEXT, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_notifications(INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_notifications_read(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_unread_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.calc_level(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_badges(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_solo_session(UUID, UUID, BOOLEAN) TO authenticated;
