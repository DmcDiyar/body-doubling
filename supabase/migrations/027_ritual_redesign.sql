-- ============================================================
-- SESSIZ ORTAK - RITUAL & MATCHING REDESIGN
-- Version: 1.0.0
-- Date: 2026-02-13
-- ============================================================
-- New RPCs for the redesigned flow:
--   1. get_live_stats() — FOMO panel live stats
--   2. get_recent_matches() — Recent matches feed
--   3. get_weekly_progress() — Results screen weekly progress
--   4. save_user_intent() — Save/retrieve last intent
--   5. mark_match_ready_v2() — Enhanced: returns partner preview
-- ============================================================


-- ============================================================
-- 0. ADD last_intent COLUMN TO USERS
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'last_intent'
  ) THEN
    ALTER TABLE public.users ADD COLUMN last_intent TEXT DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'last_duration'
  ) THEN
    ALTER TABLE public.users ADD COLUMN last_duration INTEGER DEFAULT 25;
  END IF;
END $$;

COMMENT ON COLUMN public.users.last_intent IS 'Son seçilen intent (bitirmek, baslamak, sakin_kalmak, var_olmak). Adaptive intent için.';
COMMENT ON COLUMN public.users.last_duration IS 'Son seçilen seans süresi. Adaptive intent için.';


-- ============================================================
-- 1. GET_LIVE_STATS — FOMO Panel için canlı istatistikler
-- Döner: active_users, today_sessions, waiting_by_duration
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_live_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active_users INT;
  v_today_sessions INT;
  v_today_minutes INT;
  v_waiting_25 INT;
  v_waiting_15 INT;
  v_waiting_50 INT;
BEGIN
  -- Şu anda aktif kullanıcılar
  SELECT COUNT(DISTINCT sp.user_id) INTO v_active_users
  FROM session_participants sp
  JOIN sessions s ON s.id = sp.session_id
  WHERE s.status IN ('active', 'preparing')
    AND sp.status IN ('active', 'joined', 'waiting');

  -- Bugün tamamlanan seanslar
  SELECT COUNT(*), COALESCE(SUM(s.duration), 0)
  INTO v_today_sessions, v_today_minutes
  FROM session_participants sp
  JOIN sessions s ON s.id = sp.session_id
  WHERE sp.status = 'completed'
    AND s.started_at::DATE = CURRENT_DATE;

  -- Kuyrukta bekleyenler (süreye göre)
  SELECT COUNT(*) INTO v_waiting_15
  FROM matching_queue
  WHERE status = 'waiting' AND duration = 15 AND expires_at > NOW();

  SELECT COUNT(*) INTO v_waiting_25
  FROM matching_queue
  WHERE status = 'waiting' AND duration = 25 AND expires_at > NOW();

  SELECT COUNT(*) INTO v_waiting_50
  FROM matching_queue
  WHERE status = 'waiting' AND duration = 50 AND expires_at > NOW();

  RETURN jsonb_build_object(
    'active_users', COALESCE(v_active_users, 0),
    'today_sessions', COALESCE(v_today_sessions, 0),
    'today_minutes', COALESCE(v_today_minutes, 0),
    'waiting', jsonb_build_object(
      '15', COALESCE(v_waiting_15, 0),
      '25', COALESCE(v_waiting_25, 0),
      '50', COALESCE(v_waiting_50, 0)
    )
  );
END;
$$;


-- ============================================================
-- 2. GET_RECENT_MATCHES — Son eşleşmeler feed (FOMO)
-- Son 10 eşleşmeyi anonim olarak döner
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_recent_matches(
  p_limit INT DEFAULT 5
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_matches JSONB := '[]'::JSONB;
  v_match RECORD;
BEGIN
  FOR v_match IN
    SELECT
      m.id,
      m.pomodoro_duration,
      m.state::TEXT AS match_state,
      m.created_at,
      -- Anonim isimler (ilk harf + ***)
      LEFT(ua.name, 1) || '***' AS user_a_name,
      LEFT(ub.name, 1) || '***' AS user_b_name,
      -- Zaman farkı
      EXTRACT(EPOCH FROM (NOW() - m.created_at))::INT AS seconds_ago
    FROM matches m
    JOIN users ua ON m.user_a_id = ua.id
    JOIN users ub ON m.user_b_id = ub.id
    WHERE m.created_at > NOW() - INTERVAL '1 hour'
    ORDER BY m.created_at DESC
    LIMIT p_limit
  LOOP
    v_matches := v_matches || jsonb_build_object(
      'id', v_match.id,
      'duration', v_match.pomodoro_duration,
      'state', v_match.match_state,
      'user_a', v_match.user_a_name,
      'user_b', v_match.user_b_name,
      'seconds_ago', v_match.seconds_ago,
      'created_at', v_match.created_at
    );
  END LOOP;

  RETURN jsonb_build_object('matches', v_matches);
END;
$$;


-- ============================================================
-- 3. GET_WEEKLY_PROGRESS — Results ekranı haftalık ilerleme
-- Bu hafta kaç gün aktif, streak, sonraki rozete kalan
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_weekly_progress(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user RECORD;
  v_active_days INT;
  v_week_sessions INT;
  v_week_minutes INT;
  v_next_achievement TEXT;
  v_next_achievement_progress FLOAT;
  v_xp_to_next_level INT;
BEGIN
  -- Kullanıcı bilgileri
  SELECT current_streak, longest_streak, xp, level, completed_sessions
  INTO v_user
  FROM users WHERE id = p_user_id;

  IF v_user IS NULL THEN
    RETURN jsonb_build_object('error', 'user_not_found');
  END IF;

  -- Bu hafta aktif günler (Pazartesi'den itibaren)
  SELECT
    COUNT(DISTINCT s.started_at::DATE),
    COUNT(*),
    COALESCE(SUM(s.duration), 0)
  INTO v_active_days, v_week_sessions, v_week_minutes
  FROM session_participants sp
  JOIN sessions s ON s.id = sp.session_id
  WHERE sp.user_id = p_user_id
    AND sp.status = 'completed'
    AND s.started_at >= date_trunc('week', CURRENT_DATE);

  -- Sonraki seviyeye kalan XP
  v_xp_to_next_level := (v_user.level * v_user.level * 100) - COALESCE(v_user.xp, 0);
  IF v_xp_to_next_level < 0 THEN v_xp_to_next_level := 100; END IF;

  -- En yakın açılmamış rozet
  SELECT a.name, 
    CASE a.code
      WHEN 'SESSIONS_10' THEN LEAST(v_user.completed_sessions::FLOAT / 10.0, 0.99)
      WHEN 'SESSIONS_50' THEN LEAST(v_user.completed_sessions::FLOAT / 50.0, 0.99)
      WHEN 'SESSIONS_100' THEN LEAST(v_user.completed_sessions::FLOAT / 100.0, 0.99)
      WHEN 'STREAK_3' THEN LEAST(v_user.current_streak::FLOAT / 3.0, 0.99)
      WHEN 'STREAK_7' THEN LEAST(v_user.current_streak::FLOAT / 7.0, 0.99)
      WHEN 'STREAK_30' THEN LEAST(v_user.current_streak::FLOAT / 30.0, 0.99)
      ELSE 0.5
    END
  INTO v_next_achievement, v_next_achievement_progress
  FROM achievements a
  WHERE NOT EXISTS (
    SELECT 1 FROM user_achievements ua
    WHERE ua.user_id = p_user_id AND ua.achievement_id = a.id
  )
  ORDER BY
    CASE a.code
      WHEN 'STREAK_3' THEN LEAST(v_user.current_streak::FLOAT / 3.0, 0.99)
      WHEN 'STREAK_7' THEN LEAST(v_user.current_streak::FLOAT / 7.0, 0.99)
      WHEN 'SESSIONS_10' THEN LEAST(v_user.completed_sessions::FLOAT / 10.0, 0.99)
      WHEN 'SESSIONS_50' THEN LEAST(v_user.completed_sessions::FLOAT / 50.0, 0.99)
      ELSE 0.0
    END DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'active_days', COALESCE(v_active_days, 0),
    'total_days', 7,
    'week_sessions', COALESCE(v_week_sessions, 0),
    'week_minutes', COALESCE(v_week_minutes, 0),
    'current_streak', COALESCE(v_user.current_streak, 0),
    'xp_to_next_level', v_xp_to_next_level,
    'level', COALESCE(v_user.level, 1),
    'next_achievement', v_next_achievement,
    'next_achievement_progress', ROUND(COALESCE(v_next_achievement_progress, 0)::NUMERIC, 2)
  );
END;
$$;


-- ============================================================
-- 4. SAVE_USER_INTENT — Intent ve süre kaydet
-- Adaptive intent için kullanılır
-- ============================================================

CREATE OR REPLACE FUNCTION public.save_user_intent(
  p_intent TEXT,
  p_duration INT DEFAULT 25
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE users
  SET last_intent = p_intent,
      last_duration = p_duration,
      last_active_at = NOW()
  WHERE id = auth.uid();
END;
$$;


-- ============================================================
-- 5. GET_USER_INTENT — Son intent'i getir
-- Adaptive intent ekranı için
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_user_intent()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user RECORD;
  v_has_recent_session BOOLEAN;
BEGIN
  SELECT last_intent, last_duration, current_streak, last_session_date, name
  INTO v_user
  FROM users
  WHERE id = auth.uid();

  IF v_user IS NULL THEN
    RETURN jsonb_build_object('has_intent', false);
  END IF;

  -- Son 7 günde seans var mı? (adaptive intent göstermek için)
  v_has_recent_session := (
    v_user.last_session_date IS NOT NULL
    AND v_user.last_session_date >= CURRENT_DATE - 7
  );

  RETURN jsonb_build_object(
    'has_intent', v_user.last_intent IS NOT NULL AND v_has_recent_session,
    'last_intent', v_user.last_intent,
    'last_duration', COALESCE(v_user.last_duration, 25),
    'current_streak', COALESCE(v_user.current_streak, 0),
    'name', COALESCE(v_user.name, ''),
    'last_session_date', v_user.last_session_date::TEXT
  );
END;
$$;


-- ============================================================
-- 6. MARK_MATCH_READY V2 — Partner preview ile
-- Eski mark_match_ready'yi günceller, partner bilgisini döner
-- ============================================================

CREATE OR REPLACE FUNCTION public.mark_match_ready(
  p_match_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match RECORD;
  v_is_user_a BOOLEAN;
  v_both_ready BOOLEAN;
  v_partner_id UUID;
  v_partner RECORD;
  v_my_uid UUID := auth.uid();
BEGIN
  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;

  IF v_match IS NULL THEN
    RETURN jsonb_build_object('error', 'match_not_found');
  END IF;

  v_is_user_a := (v_my_uid = v_match.user_a_id);

  -- Determine partner
  IF v_is_user_a THEN
    v_partner_id := v_match.user_b_id;
  ELSE
    v_partner_id := v_match.user_a_id;
  END IF;

  -- Get partner preview (anonymous)
  SELECT
    LEFT(name, 1) || '***' AS display_name,
    completed_sessions,
    trust_score,
    current_streak,
    last_intent
  INTO v_partner
  FROM users WHERE id = v_partner_id;

  -- Mark ready
  IF v_is_user_a THEN
    UPDATE matches SET user_a_ready = true WHERE id = p_match_id;
    v_both_ready := v_match.user_b_ready;
  ELSE
    UPDATE matches SET user_b_ready = true WHERE id = p_match_id;
    v_both_ready := v_match.user_a_ready;
  END IF;

  -- If both ready, transition to active
  IF v_both_ready THEN
    UPDATE matches SET state = 'active' WHERE id = p_match_id;

    -- Also start the session
    UPDATE sessions
    SET status = 'active', started_at = NOW()
    WHERE id = v_match.session_id;

    RETURN jsonb_build_object(
      'both_ready', true,
      'match_state', 'active',
      'partner', jsonb_build_object(
        'name', COALESCE(v_partner.display_name, '?***'),
        'sessions', COALESCE(v_partner.completed_sessions, 0),
        'trust_score', COALESCE(v_partner.trust_score, 100),
        'streak', COALESCE(v_partner.current_streak, 0),
        'intent', v_partner.last_intent
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'both_ready', false,
    'match_state', 'preparing',
    'partner', jsonb_build_object(
      'name', COALESCE(v_partner.display_name, '?***'),
      'sessions', COALESCE(v_partner.completed_sessions, 0),
      'trust_score', COALESCE(v_partner.trust_score, 100),
      'streak', COALESCE(v_partner.current_streak, 0),
      'intent', v_partner.last_intent
    )
  );
END;
$$;


-- ============================================================
-- GRANT PERMISSIONS
-- ============================================================

GRANT EXECUTE ON FUNCTION public.get_live_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_recent_matches(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_weekly_progress(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_user_intent(TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_intent() TO authenticated;
-- mark_match_ready already granted in 008
