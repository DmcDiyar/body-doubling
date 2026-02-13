-- ============================================================
-- 029: MATCHING ALGORİTMASI İYİLEŞTİRME
-- Date: 2026-02-13
-- ============================================================
-- 1. 90dk duration desteği (sessions + matching_queue CHECK)
-- 2. find_match: theme fallback (exact → any)
-- 3. matching_queue expires_at 30s → 60s
-- 4. get_queue_position RPC
-- ============================================================


-- ============================================================
-- 1. 90DK DURATION DESTEĞİ
-- ============================================================

-- Sessions: duration constraint güncelle
ALTER TABLE public.sessions
  DROP CONSTRAINT IF EXISTS sessions_duration_check;
ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_duration_check CHECK (duration IN (15, 25, 50, 90));

-- Matching queue: duration constraint güncelle
ALTER TABLE public.matching_queue
  DROP CONSTRAINT IF EXISTS matching_queue_duration_check;
ALTER TABLE public.matching_queue
  ADD CONSTRAINT matching_queue_duration_check CHECK (duration IN (15, 25, 50, 90));

-- Default expires_at: 30s → 60s
ALTER TABLE public.matching_queue
  ALTER COLUMN expires_at SET DEFAULT (NOW() + INTERVAL '60 seconds');


-- ============================================================
-- 2. FIND_MATCH V3 — Theme fallback + 90dk desteği
-- ============================================================

-- PostgreSQL cannot change parameter defaults with CREATE OR REPLACE
DROP FUNCTION IF EXISTS public.find_match(UUID, INTEGER, TEXT);

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
BEGIN
  -- Kullanıcının trust score'unu al
  SELECT trust_score INTO v_user_trust FROM public.users WHERE id = p_user_id;

  -- Trust < 50 ise solo mode
  IF v_user_trust < 50 THEN
    RETURN NULL;
  END IF;

  -- 1. İlk deneme: Exact match (aynı duration + aynı theme)
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
    ORDER BY
      (
        (LEAST(EXTRACT(EPOCH FROM (NOW() - mq.created_at))::FLOAT / v_max_wait_time, 1.0) * 1.0)
        + (((u.trust_score - 50)::FLOAT / 100.0) * 0.3)
        + (LEAST(EXTRACT(EPOCH FROM (NOW() - mq.created_at))::FLOAT / 60.0, 1.0) * 0.5 * 0.2)
      ) DESC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;
  END IF;

  -- Eşleşme bulunamadı
  IF v_partner_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Session oluştur (partner'ın tema tercihi de dikkate alınabilir)
  INSERT INTO public.sessions (duration, mode, theme, status, scheduled_start)
  VALUES (p_duration, 'duo', p_theme, 'waiting', NOW() + INTERVAL '30 seconds')
  RETURNING id INTO v_session_id;

  -- Her iki kullanıcıyı session'a ekle
  INSERT INTO public.session_participants (session_id, user_id, status)
  VALUES
    (v_session_id, p_user_id, 'waiting'),
    (v_session_id, v_partner_id, 'waiting');

  -- Her iki kullanıcıyı kuyruktan çıkar
  UPDATE public.matching_queue
  SET status = 'matched'
  WHERE id = v_partner_queue_id;

  UPDATE public.matching_queue
  SET status = 'matched'
  WHERE user_id = p_user_id AND status = 'waiting';

  RETURN v_session_id;
END;
$$;


-- ============================================================
-- 3. GET_QUEUE_POSITION — Kullanıcının kuyruktaki sırası
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_queue_position()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_entry RECORD;
  v_position INT;
  v_total INT;
BEGIN
  -- Kullanıcının kuyruk kaydını bul
  SELECT * INTO v_entry
  FROM matching_queue
  WHERE user_id = v_uid AND status = 'waiting'
  LIMIT 1;

  IF v_entry IS NULL THEN
    RETURN jsonb_build_object(
      'in_queue', false,
      'position', 0,
      'total_waiting', 0
    );
  END IF;

  -- Sıradaki pozisyon (aynı duration'da, daha önce girenler)
  SELECT COUNT(*) INTO v_position
  FROM matching_queue
  WHERE status = 'waiting'
    AND duration = v_entry.duration
    AND expires_at > NOW()
    AND created_at <= v_entry.created_at;

  -- Toplam bekleyen (aynı duration)
  SELECT COUNT(*) INTO v_total
  FROM matching_queue
  WHERE status = 'waiting'
    AND duration = v_entry.duration
    AND expires_at > NOW();

  RETURN jsonb_build_object(
    'in_queue', true,
    'position', v_position,
    'total_waiting', v_total,
    'duration', v_entry.duration,
    'expires_at', v_entry.expires_at,
    'seconds_remaining', GREATEST(0, EXTRACT(EPOCH FROM (v_entry.expires_at - NOW()))::INT)
  );
END;
$$;


-- ============================================================
-- 4. GRANT PERMISSIONS
-- ============================================================

GRANT EXECUTE ON FUNCTION public.find_match(UUID, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_queue_position() TO authenticated;
