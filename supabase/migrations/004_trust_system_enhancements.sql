-- ============================================================
-- SESSIZ ORTAK - TRUST SYSTEM ENHANCEMENTS
-- Version: 1.1.0
-- Date: 2026-02-06
-- ============================================================
-- Bu migration şunları ekler:
-- 1. trust_level column (users tablosuna)
-- 2. Güncellenmiş find_match fonksiyonu (spec'e uygun formula)
-- 3. Trust score update trigger (daily cap + auto level)
-- 4. Solo session trust bonus
-- 5. Rehabilitation tracking
-- ============================================================

-- ============================================================
-- 1. USERS: trust_level COLUMN EKLE
-- ============================================================
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS trust_level TEXT NOT NULL DEFAULT 'trusted'
CHECK (trust_level IN ('restricted', 'newbie', 'trusted', 'verified', 'elite', 'legend'));

-- Mevcut kullanıcıların trust_level'ını güncelle
UPDATE public.users
SET trust_level = CASE
  WHEN trust_score >= 150 THEN 'legend'
  WHEN trust_score >= 120 THEN 'elite'
  WHEN trust_score >= 90 THEN 'verified'
  WHEN trust_score >= 70 THEN 'trusted'
  WHEN trust_score >= 50 THEN 'newbie'
  ELSE 'restricted'
END;

-- Index for trust_level queries
CREATE INDEX IF NOT EXISTS idx_users_trust_level ON public.users(trust_level);

COMMENT ON COLUMN public.users.trust_level IS 'Trust seviyesi: restricted, newbie, trusted, verified, elite, legend';


-- ============================================================
-- 2. TRUST_EVENTS: EKSTRA EVENT TYPES & related_user_id
-- ============================================================
-- Yeni event types ekle (CHECK constraint'i güncelle)
ALTER TABLE public.trust_events
DROP CONSTRAINT IF EXISTS trust_events_event_type_check;

ALTER TABLE public.trust_events
ADD CONSTRAINT trust_events_event_type_check CHECK (event_type IN (
  'session_completed',        -- +2
  'solo_session_completed',   -- +5 (rehabilitasyon)
  'partner_rated_5_stars',    -- +5
  'partner_rated_4_stars',    -- +2
  'partner_rated_1_star',     -- -5
  'partner_rated_2_stars',    -- -2
  'rating_5_star',            -- +2 (eski format - compat)
  'rating_4_star',            -- +1 (eski format - compat)
  'rating_1_star',            -- -2 (eski format - compat)
  'early_exit_mild',          -- -4
  'early_exit_moderate',      -- -8
  'early_exit_severe',        -- -15
  'ghosting',                 -- -20
  'no_show',                  -- -10
  'reported_and_verified',    -- -50
  'helpful_report'            -- +5
));

-- related_user_id ekle (partner için)
ALTER TABLE public.trust_events
ADD COLUMN IF NOT EXISTS related_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- metadata JSONB ekle
ALTER TABLE public.trust_events
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';


-- ============================================================
-- 3. FIND_MATCH: SPEC'E UYGUN FORMULA
-- ============================================================
-- Yeni formül: match_score = (fifo × 1.0) + (trust_bonus × 0.3) + (wait_bonus × 0.2)

CREATE OR REPLACE FUNCTION public.find_match(
  p_user_id UUID,
  p_duration INTEGER,
  p_theme TEXT
)
RETURNS UUID -- session_id döner, NULL ise eşleşme yok
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner_queue_id UUID;
  v_partner_id UUID;
  v_session_id UUID;
  v_user_trust INTEGER;
  v_max_wait_time INTEGER := 30; -- saniye
BEGIN
  -- Kullanıcının trust score'unu al
  SELECT trust_score INTO v_user_trust FROM public.users WHERE id = p_user_id;

  -- Trust < 50 ise solo mode (eşleşemez)
  IF v_user_trust < 50 THEN
    RETURN NULL;
  END IF;

  -- Uygun partner bul: FIFO + Trust Priority + Wait Bonus formülü
  -- match_score = (fifo × 1.0) + (trust_bonus × 0.3) + (wait_bonus × 0.2)
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
    AND u.trust_score >= 50  -- Sadece eşleşebilen kullanıcılar
  ORDER BY
    (
      -- FIFO priority (weight: 1.0)
      -- Daha eski = daha düşük fifo score (önce eşleşmeli)
      -- Ama ORDER BY DESC yapıyoruz, yani yüksek score = önce
      -- fifo = (max_wait - wait_time) / max_wait → Yeni gelenler yüksek
      -- Biz FIFO istiyoruz, yani eski gelenler önce
      -- wait_time = extract... → Büyük = eski
      -- fifo_priority = wait_time / max_wait → Büyük = eski = önce
      (LEAST(EXTRACT(EPOCH FROM (NOW() - mq.created_at))::FLOAT / v_max_wait_time, 1.0) * 1.0)
      
      -- Trust bonus (weight: 0.3)
      -- trust_bonus = (trust_score - 50) / 100, range: 0.0 - 1.0
      + (((u.trust_score - 50)::FLOAT / 100.0) * 0.3)
      
      -- Wait bonus (weight: 0.2)  
      -- wait_bonus = min(wait_seconds / 30, 1.0) × 0.5
      + (LEAST(EXTRACT(EPOCH FROM (NOW() - mq.created_at))::FLOAT / 30.0, 1.0) * 0.5 * 0.2)
    ) DESC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  -- Eşleşme bulunamadı
  IF v_partner_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Session oluştur
  INSERT INTO public.sessions (duration, mode, theme, status, scheduled_start)
  VALUES (p_duration, 'duo', p_theme, 'waiting', NOW() + INTERVAL '30 seconds')
  RETURNING id INTO v_session_id;

  -- Her iki kullanıcıyı session'a ekle
  INSERT INTO public.session_participants (session_id, user_id, status)
  VALUES
    (v_session_id, p_user_id, 'waiting'),
    (v_session_id, v_partner_id, 'waiting');

  -- Partner'ı kuyruktan çıkar
  UPDATE public.matching_queue
  SET status = 'matched'
  WHERE id = v_partner_queue_id;

  -- Arayan kullanıcının queue kaydını da matched yap
  UPDATE public.matching_queue
  SET status = 'matched'
  WHERE user_id = p_user_id AND status = 'waiting';

  RETURN v_session_id;
END;
$$;


-- ============================================================
-- 4. GET_MATCH_PRIORITY: 6 SEVİYELİ
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_match_priority(p_trust_score INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_trust_score < 50 THEN
    RETURN -1;  -- Restricted: Solo only
  ELSIF p_trust_score < 70 THEN
    RETURN 0;   -- Newbie: Düşük öncelik
  ELSIF p_trust_score < 90 THEN
    RETURN 1;   -- Trusted: Normal
  ELSIF p_trust_score < 120 THEN
    RETURN 2;   -- Verified: Öncelikli
  ELSIF p_trust_score < 150 THEN
    RETURN 3;   -- Elite: VIP
  ELSE
    RETURN 4;   -- Legend: Instant
  END IF;
END;
$$;


-- ============================================================
-- 5. UPDATE_TRUST_WITH_LEVEL: TRUST DEĞİŞİNCE LEVEL'I DA GÜNCELLE
-- ============================================================
-- Önce eski fonksiyonu sil (farklı argüman listesiyle çakışma var)
DROP FUNCTION IF EXISTS public.update_trust_score(UUID, UUID, TEXT, INTEGER);

CREATE OR REPLACE FUNCTION public.update_trust_score(
  p_user_id UUID,
  p_session_id UUID,
  p_event_type TEXT,
  p_score_change INTEGER,
  p_related_user_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS INTEGER -- new trust score
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_score INTEGER;
  v_new_score INTEGER;
  v_new_level TEXT;
  v_today_change INTEGER;
  v_adjusted_change INTEGER;
BEGIN
  -- Mevcut score al
  SELECT trust_score INTO v_current_score
  FROM public.users
  WHERE id = p_user_id
  FOR UPDATE;

  -- Bugünkü toplam değişimi kontrol et (daily cap)
  SELECT COALESCE(SUM(score_change), 0) INTO v_today_change
  FROM public.trust_events
  WHERE user_id = p_user_id
    AND DATE(created_at) = CURRENT_DATE;

  -- Daily cap uygula: +20 max gain, -50 max loss
  IF p_score_change > 0 THEN
    -- Pozitif: max +20/gün
    v_adjusted_change := LEAST(p_score_change, GREATEST(0, 20 - v_today_change));
  ELSE
    -- Negatif: max -50/gün
    v_adjusted_change := GREATEST(p_score_change, LEAST(0, -50 - v_today_change));
  END IF;

  -- Yeni score hesapla (0-200 arası clamp)
  v_new_score := GREATEST(0, LEAST(200, v_current_score + v_adjusted_change));

  -- Yeni level hesapla
  v_new_level := CASE
    WHEN v_new_score >= 150 THEN 'legend'
    WHEN v_new_score >= 120 THEN 'elite'
    WHEN v_new_score >= 90 THEN 'verified'
    WHEN v_new_score >= 70 THEN 'trusted'
    WHEN v_new_score >= 50 THEN 'newbie'
    ELSE 'restricted'
  END;

  -- Users tablosunu güncelle (score + level)
  UPDATE public.users
  SET trust_score = v_new_score,
      trust_level = v_new_level
  WHERE id = p_user_id;

  -- Audit log yaz
  INSERT INTO public.trust_events (
    user_id, 
    session_id, 
    event_type, 
    score_change, 
    score_before, 
    score_after,
    related_user_id,
    metadata
  )
  VALUES (
    p_user_id, 
    p_session_id, 
    p_event_type, 
    v_adjusted_change, 
    v_current_score, 
    v_new_score,
    p_related_user_id,
    p_metadata
  );

  RETURN v_new_score;
END;
$$;


-- ============================================================
-- 6. SOLO SESSION COMPLETION: +5 TRUST (Rehabilitation)
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
BEGIN
  -- Session bilgisini al
  SELECT * INTO v_session FROM public.sessions WHERE id = p_session_id;

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Session not found';
  END IF;

  -- Kullanıcının trust'ını kontrol et
  SELECT trust_score INTO v_user_trust FROM public.users WHERE id = p_user_id;
  
  -- Rehabilitation mode mu? (trust < 50 idi)
  IF v_user_trust < 50 THEN
    v_trust_change := 5; -- Solo rehabilitation bonus
    v_is_rehabilitation := true;
  ELSE
    v_trust_change := 2; -- Normal solo completion
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
    -- Bugün zaten seans yapmış, streak değişmez
    NULL;
  ELSIF v_last_date = v_today - 1 THEN
    v_streak := v_streak + 1;
  ELSE
    v_streak := 1;
  END IF;

  -- Kullanıcıyı güncelle
  UPDATE public.users
  SET 
    xp = xp + v_xp_earned,
    level = 1 + (xp + v_xp_earned) / 500,
    total_sessions = total_sessions + 1,
    completed_sessions = completed_sessions + 1,
    total_minutes = total_minutes + v_session.duration,
    current_streak = v_streak,
    longest_streak = GREATEST(longest_streak, v_streak),
    last_session_date = v_today,
    last_active_at = NOW()
  WHERE id = p_user_id;

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

  -- Sonuç
  v_result := jsonb_build_object(
    'xp_earned', v_xp_earned,
    'trust_change', v_trust_change,
    'new_streak', v_streak,
    'rehabilitation', v_is_rehabilitation
  );

  RETURN v_result;
END;
$$;


-- ============================================================
-- 7. GRANT PERMISSIONS
-- ============================================================
GRANT EXECUTE ON FUNCTION public.find_match(UUID, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_match_priority(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_trust_score(UUID, UUID, TEXT, INTEGER, UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_solo_session(UUID, UUID, BOOLEAN) TO authenticated;

