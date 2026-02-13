-- ============================================================
-- 031: REALTIME CHANNEL OPTİMİZASYONU
-- Date: 2026-02-13
-- ============================================================
-- 1. Realtime publication'a tablo ekle
-- 2. match_heartbeat sadeleştirme (yalnızca timestamp güncelle)
-- 3. Realtime-aware index'ler
-- ============================================================


-- ============================================================
-- 1. SUPABASE REALTIME PUBLICATION
-- ============================================================
-- Supabase'de default olarak supabase_realtime publication var
-- Biz sadece gerekli tabloları ekliyoruz

-- Önce mevcut üyelikleri temizle (idempotent)
DO $$
BEGIN
  -- matching_queue
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'matching_queue'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.matching_queue;
  END IF;

  -- matches
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'matches'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.matches;
  END IF;

  -- sessions (status changes)
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions;
  END IF;

  -- notifications (in-app bildirimler)
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;

  -- session_participants (durum değişiklikleri)
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'session_participants'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.session_participants;
  END IF;
END $$;


-- ============================================================
-- 2. MATCH_HEARTBEAT V2 — Sadeleştirilmiş
-- ============================================================
-- Eski: her heartbeat'te partner durumunu kontrol ediyor
-- Yeni: sadece timestamp güncelle + partner_alive döndür
-- Partner timeout tespiti client-side yapılacak (daha az DB yükü)

CREATE OR REPLACE FUNCTION public.match_heartbeat(
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
  v_partner_last_hb TIMESTAMPTZ;
  v_partner_alive BOOLEAN;
  v_my_uid UUID := auth.uid();
BEGIN
  -- Lightweight: sadece gerekli kolonları oku
  SELECT id, user_a_id, user_b_id, state,
         user_a_last_heartbeat, user_b_last_heartbeat
  INTO v_match
  FROM matches WHERE id = p_match_id;

  IF v_match IS NULL THEN
    RETURN jsonb_build_object('error', 'match_not_found');
  END IF;

  IF v_my_uid != v_match.user_a_id AND v_my_uid != v_match.user_b_id THEN
    RETURN jsonb_build_object('error', 'not_in_match');
  END IF;

  v_is_user_a := (v_my_uid = v_match.user_a_id);

  -- Update heartbeat (no FOR UPDATE — less contention)
  IF v_is_user_a THEN
    UPDATE matches SET user_a_last_heartbeat = NOW() WHERE id = p_match_id;
    v_partner_last_hb := v_match.user_b_last_heartbeat;
  ELSE
    UPDATE matches SET user_b_last_heartbeat = NOW() WHERE id = p_match_id;
    v_partner_last_hb := v_match.user_a_last_heartbeat;
  END IF;

  -- Partner alive check (15 second threshold)
  v_partner_alive := (
    v_partner_last_hb IS NOT NULL
    AND v_partner_last_hb > NOW() - INTERVAL '15 seconds'
  );

  -- Auto-break match if partner timed out and match is still active
  IF NOT v_partner_alive AND v_match.state IN ('preparing', 'active') THEN
    UPDATE matches
    SET state = 'broken', broken_reason = 'partner_timeout'
    WHERE id = p_match_id
      AND state IN ('preparing', 'active');
  END IF;

  RETURN jsonb_build_object(
    'partner_alive', v_partner_alive,
    'match_state', CASE
      WHEN NOT v_partner_alive AND v_match.state IN ('preparing', 'active') THEN 'broken'
      ELSE v_match.state::TEXT
    END,
    'seconds_since_partner', CASE
      WHEN v_partner_last_hb IS NOT NULL
      THEN EXTRACT(EPOCH FROM (NOW() - v_partner_last_hb))::INT
      ELSE 999
    END
  );
END;
$$;


-- ============================================================
-- 3. REALTIME-AWARE INDEXES
-- ============================================================

-- matching_queue: status + created_at composite (realtime filter)
CREATE INDEX IF NOT EXISTS idx_mq_realtime
  ON public.matching_queue(status, created_at DESC)
  WHERE status = 'waiting';

-- matches: state filter for realtime
CREATE INDEX IF NOT EXISTS idx_matches_active_realtime
  ON public.matches(state)
  WHERE state IN ('preparing', 'active');

-- notifications: user + unread (realtime listener)
-- (Already created in 028 — skip if exists)


-- ============================================================
-- 4. GRANT PERMISSIONS
-- ============================================================

GRANT EXECUTE ON FUNCTION public.match_heartbeat(UUID) TO authenticated;
