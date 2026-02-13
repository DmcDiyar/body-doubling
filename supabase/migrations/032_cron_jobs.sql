-- ============================================================
-- 032: CRON JOB'LAR
-- Date: 2026-02-13
-- ============================================================
-- 3 cron fonksiyonu:
--   1. cron_cleanup_orphan_sessions() — her 5dk
--   2. cron_daily_maintenance()       — her gün 03:00 UTC
--   3. cron_weekly_cleanup()          — her Pazartesi 04:00 UTC
--
-- NOT: pg_cron schedule komutları Supabase Pro plan gerektirir.
--      Free plan'da bu fonksiyonları manuel veya Vercel Cron
--      ile çağırabilirsiniz.
-- ============================================================


-- ============================================================
-- 1. ORPHAN SESSION CLEANUP — Her 5 dakika
-- ============================================================
-- Sorunlar:
--   - 3+ saat aktif kalan session yok edilmeli
--   - Süresi dolmuş kuyruk kayıtları temizlenmeli
--   - Phantom participants temizlenmeli

CREATE OR REPLACE FUNCTION public.cron_cleanup_orphan_sessions()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orphan_sessions INT := 0;
  v_orphan_participants INT := 0;
  v_expired_queue INT := 0;
  v_stale_matches INT := 0;
BEGIN
  -- 1. 3+ saat aktif/waiting kalan session'ları abandon et
  WITH abandoned AS (
    UPDATE sessions
    SET status = 'abandoned', ended_at = NOW()
    WHERE status IN ('waiting', 'active')
      AND created_at < NOW() - INTERVAL '3 hours'
    RETURNING id
  )
  SELECT COUNT(*) INTO v_orphan_sessions FROM abandoned;

  -- 2. Orphan participants: session'ı abandoned/completed ama participant hala active/waiting
  WITH fixed_participants AS (
    UPDATE session_participants sp
    SET status = 'left_early', left_at = NOW()
    FROM sessions s
    WHERE sp.session_id = s.id
      AND s.status IN ('abandoned', 'completed')
      AND sp.status IN ('waiting', 'active')
    RETURNING sp.id
  )
  SELECT COUNT(*) INTO v_orphan_participants FROM fixed_participants;

  -- 3. Süresi dolmuş kuyruk kayıtları
  WITH expired AS (
    UPDATE matching_queue
    SET status = 'expired'
    WHERE status = 'waiting'
      AND expires_at < NOW()
    RETURNING id
  )
  SELECT COUNT(*) INTO v_expired_queue FROM expired;

  -- 4. 1+ saat preparing kalan match'leri broken yap
  WITH stale AS (
    UPDATE matches
    SET state = 'broken', broken_reason = 'timeout'
    WHERE state = 'preparing'
      AND created_at < NOW() - INTERVAL '1 hour'
    RETURNING id
  )
  SELECT COUNT(*) INTO v_stale_matches FROM stale;

  RETURN jsonb_build_object(
    'orphan_sessions', v_orphan_sessions,
    'orphan_participants', v_orphan_participants,
    'expired_queue', v_expired_queue,
    'stale_matches', v_stale_matches,
    'executed_at', NOW()
  );
END;
$$;


-- ============================================================
-- 2. DAILY MAINTENANCE — Her gün 03:00 UTC
-- ============================================================
-- Sorunlar:
--   - Streak kırılma kontrolü (dün seans yapıp bugün yapmamışlar)
--   - Streak risk bildirimi
--   - Eski notification'ları temizle (30+ gün)

CREATE OR REPLACE FUNCTION public.cron_daily_maintenance()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_broken_streaks INT := 0;
  v_risk_notifications INT := 0;
  v_cleaned_notifications INT := 0;
  v_user RECORD;
BEGIN
  -- 1. Streak kırılma: dün seans yapıp bugün yapmamışlar (eğer seans yapmışlarsa streak artmıştır)
  -- Bu kontrol gece 03:00'te çalışır, yani "dün" = 2 gün önce
  UPDATE users
  SET current_streak = 0
  WHERE last_session_date IS NOT NULL
    AND last_session_date < CURRENT_DATE - 1
    AND current_streak > 0;

  GET DIAGNOSTICS v_broken_streaks = ROW_COUNT;

  -- 2. Streak risk bildirimi: dün seans yapmış + streak >= 3 olan kullanıcılar
  -- Bugün seans yapmazlarsa streak kırılacak
  FOR v_user IN
    SELECT id, current_streak, name
    FROM users
    WHERE last_session_date = CURRENT_DATE - 1
      AND current_streak >= 3
  LOOP
    PERFORM emit_notification(
      v_user.id,
      'streak_risk',
      'Seri Risk Altında! ⚡',
      v_user.current_streak || ' günlük serin bugün seans yapmazsan sıfırlanacak!',
      jsonb_build_object('streak', v_user.current_streak)
    );
    v_risk_notifications := v_risk_notifications + 1;
  END LOOP;

  -- 3. Streak milestone bildirimi: bugün milestone'a ulaşanlar
  FOR v_user IN
    SELECT id, current_streak
    FROM users
    WHERE last_session_date = CURRENT_DATE
      AND current_streak IN (3, 7, 14, 30, 50, 100)
  LOOP
    PERFORM emit_notification(
      v_user.id,
      'streak_milestone',
      v_user.current_streak || ' Günlük Seri! 🔥',
      'Harika gidiyorsun! ' || v_user.current_streak || ' gün üst üste odaklandın!',
      jsonb_build_object('streak', v_user.current_streak)
    );
  END LOOP;

  -- 4. 30 günden eski bildirimleri sil
  WITH cleaned AS (
    DELETE FROM notifications
    WHERE created_at < NOW() - INTERVAL '30 days'
    RETURNING id
  )
  SELECT COUNT(*) INTO v_cleaned_notifications FROM cleaned;

  RETURN jsonb_build_object(
    'broken_streaks', v_broken_streaks,
    'risk_notifications', v_risk_notifications,
    'cleaned_notifications', v_cleaned_notifications,
    'executed_at', NOW()
  );
END;
$$;


-- ============================================================
-- 3. WEEKLY CLEANUP — Her Pazartesi 04:00 UTC
-- ============================================================
-- Sorunlar:
--   - Eski presence log'ları sil (30+ gün)
--   - Eski matching_queue kayıtlarını sil (7+ gün, matched/expired/cancelled)
--   - Eski trust_events'i arşivle (90+ gün) — metadata'ya archived: true

CREATE OR REPLACE FUNCTION public.cron_weekly_cleanup()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_presence_deleted INT := 0;
  v_queue_deleted INT := 0;
  v_trust_archived INT := 0;
BEGIN
  -- 1. 30 günden eski presence log'ları sil
  WITH deleted AS (
    DELETE FROM user_presence_logs
    WHERE created_at < NOW() - INTERVAL '30 days'
    RETURNING id
  )
  SELECT COUNT(*) INTO v_presence_deleted FROM deleted;

  -- 2. 7 günden eski, aktif olmayan kuyruk kayıtlarını sil
  WITH deleted AS (
    DELETE FROM matching_queue
    WHERE status IN ('matched', 'expired', 'cancelled')
      AND created_at < NOW() - INTERVAL '7 days'
    RETURNING id
  )
  SELECT COUNT(*) INTO v_queue_deleted FROM deleted;

  -- 3. 90 günden eski trust_events — metadata'ya archived flag ekle
  -- (Silmek yerine arşivliyoruz — audit trail korunmalı)
  WITH archived AS (
    UPDATE trust_events
    SET metadata = COALESCE(metadata, '{}'::JSONB) || '{"archived": true}'::JSONB
    WHERE created_at < NOW() - INTERVAL '90 days'
      AND (metadata IS NULL OR NOT (metadata ? 'archived'))
    RETURNING id
  )
  SELECT COUNT(*) INTO v_trust_archived FROM archived;

  RETURN jsonb_build_object(
    'presence_deleted', v_presence_deleted,
    'queue_deleted', v_queue_deleted,
    'trust_archived', v_trust_archived,
    'executed_at', NOW()
  );
END;
$$;


-- ============================================================
-- 4. PG_CRON SCHEDULE (Opsiyonel — Pro plan gerektirir)
-- ============================================================
-- Aşağıdaki komutları Supabase SQL Editor'da çalıştırın:
--
-- SELECT cron.schedule(
--   'cleanup-orphan-sessions',
--   '*/5 * * * *',
--   $$SELECT cron_cleanup_orphan_sessions()$$
-- );
--
-- SELECT cron.schedule(
--   'daily-maintenance',
--   '0 3 * * *',
--   $$SELECT cron_daily_maintenance()$$
-- );
--
-- SELECT cron.schedule(
--   'weekly-cleanup',
--   '0 4 * * 1',
--   $$SELECT cron_weekly_cleanup()$$
-- );


-- ============================================================
-- 5. GRANT PERMISSIONS
-- ============================================================

GRANT EXECUTE ON FUNCTION public.cron_cleanup_orphan_sessions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cron_daily_maintenance() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cron_weekly_cleanup() TO authenticated;
