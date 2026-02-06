-- ============================================================
-- SESSIZ ORTAK - SESSION COMPLETION & RATING TRIGGERS
-- Version: 1.2.0
-- Date: 2026-02-06
-- ============================================================
-- Bu migration şunları ekler:
-- 1. process_partner_rating: Rating sonrası trust change
-- 2. handle_no_show: No-show detection trigger
-- 3. handle_early_exit: Ghosting/early exit penalties
-- ============================================================

-- Önce eski fonksiyonları temizle (parametre ismi çakışmalarını önle)
DROP FUNCTION IF EXISTS public.process_partner_rating(UUID, UUID, INTEGER);
DROP FUNCTION IF EXISTS public.handle_early_exit(UUID, UUID, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.handle_no_show(UUID, UUID);
DROP FUNCTION IF EXISTS public.handle_ghosting(UUID, UUID);
DROP FUNCTION IF EXISTS public.trigger_session_completion();

-- ============================================================
-- 1. PROCESS_PARTNER_RATING: Rating sonrası trust değişimi
-- ============================================================
CREATE OR REPLACE FUNCTION public.process_partner_rating(
  p_session_id UUID,
  p_rater_id UUID,
  p_rating INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner_id UUID;
  v_event_type TEXT;
  v_score_change INTEGER;
BEGIN
  -- Partner'ı bul
  SELECT user_id INTO v_partner_id
  FROM public.session_participants
  WHERE session_id = p_session_id
    AND user_id != p_rater_id
  LIMIT 1;

  IF v_partner_id IS NULL THEN
    RETURN; -- Solo session, rating yok
  END IF;

  -- Rating'e göre trust change belirle
  CASE p_rating
    WHEN 5 THEN
      v_event_type := 'partner_rated_5_stars';
      v_score_change := 5;
    WHEN 4 THEN
      v_event_type := 'partner_rated_4_stars';
      v_score_change := 2;
    WHEN 3 THEN
      -- Neutral, no change
      RETURN;
    WHEN 2 THEN
      v_event_type := 'partner_rated_2_stars';
      v_score_change := -2;
    WHEN 1 THEN
      v_event_type := 'partner_rated_1_star';
      v_score_change := -5;
    ELSE
      RETURN;
  END CASE;

  -- Trust score güncelle (partner'ın trust'ını)
  PERFORM public.update_trust_score(
    v_partner_id,
    p_session_id,
    v_event_type,
    v_score_change,
    p_rater_id,
    jsonb_build_object('rating', p_rating)
  );
END;
$$;


-- ============================================================
-- 2. HANDLE_EARLY_EXIT: Erken çıkış penalty
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_early_exit(
  p_session_id UUID,
  p_user_id UUID,
  p_elapsed_minutes INTEGER,
  p_total_duration INTEGER
)
RETURNS INTEGER -- penalty amount
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_percent_complete FLOAT;
  v_event_type TEXT;
  v_penalty INTEGER;
BEGIN
  v_percent_complete := p_elapsed_minutes::FLOAT / p_total_duration;

  -- Penalty hesapla
  IF v_percent_complete < 0.2 THEN
    -- İlk %20: Mild
    v_event_type := 'early_exit_mild';
    v_penalty := -4;
  ELSIF v_percent_complete < 0.6 THEN
    -- %20-60: Moderate
    v_event_type := 'early_exit_moderate';
    v_penalty := -8;
  ELSE
    -- %60+: Severe (neredeyse bitmişti)
    v_event_type := 'early_exit_severe';
    v_penalty := -15;
  END IF;

  -- Trust güncelle
  PERFORM public.update_trust_score(
    p_user_id,
    p_session_id,
    v_event_type,
    v_penalty,
    NULL,
    jsonb_build_object(
      'elapsed_minutes', p_elapsed_minutes,
      'total_duration', p_total_duration,
      'percent_complete', v_percent_complete
    )
  );

  -- Participant status güncelle
  UPDATE public.session_participants
  SET status = 'left_early',
      left_at = NOW(),
      trust_score_change = v_penalty
  WHERE session_id = p_session_id AND user_id = p_user_id;

  RETURN v_penalty;
END;
$$;


-- ============================================================
-- 3. HANDLE_NO_SHOW: Partner gelmedi
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_no_show(
  p_session_id UUID,
  p_no_show_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_waiting_partner_id UUID;
BEGIN
  -- No-show kullanıcının trust'ını düşür
  PERFORM public.update_trust_score(
    p_no_show_user_id,
    p_session_id,
    'no_show',
    -10,
    NULL,
    jsonb_build_object('reason', 'Did not join session within timeout')
  );

  -- Participant status güncelle
  UPDATE public.session_participants
  SET status = 'no_show',
      trust_score_change = -10
  WHERE session_id = p_session_id AND user_id = p_no_show_user_id;

  -- Bekleyen partner'a bonus ver
  SELECT user_id INTO v_waiting_partner_id
  FROM public.session_participants
  WHERE session_id = p_session_id
    AND user_id != p_no_show_user_id
    AND status = 'waiting'
  LIMIT 1;

  IF v_waiting_partner_id IS NOT NULL THEN
    -- Partner'a +1 trust (bekletildi)
    PERFORM public.update_trust_score(
      v_waiting_partner_id,
      p_session_id,
      'session_completed', -- Reuse event type, small bonus
      1,
      p_no_show_user_id,
      jsonb_build_object('reason', 'Partner no-show compensation')
    );

    -- Partner'ı yüksek öncelikle kuyruğa geri ekle
    INSERT INTO public.matching_queue (user_id, duration, theme, priority, status, expires_at)
    SELECT 
      v_waiting_partner_id,
      s.duration,
      s.theme,
      3, -- Yüksek öncelik
      'waiting',
      NOW() + INTERVAL '45 seconds'
    FROM public.sessions s WHERE s.id = p_session_id
    ON CONFLICT (user_id) DO UPDATE
    SET priority = 3, status = 'waiting', expires_at = NOW() + INTERVAL '45 seconds';
  END IF;

  -- Session'ı iptal et
  UPDATE public.sessions
  SET status = 'abandoned', ended_at = NOW()
  WHERE id = p_session_id;
END;
$$;


-- ============================================================
-- 4. HANDLE_GHOSTING: 5dk hareketsiz
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_ghosting(
  p_session_id UUID,
  p_ghost_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Ghosting penalty
  PERFORM public.update_trust_score(
    p_ghost_user_id,
    p_session_id,
    'ghosting',
    -20,
    NULL,
    jsonb_build_object('reason', 'Inactive for 5+ minutes during session')
  );

  -- Participant status güncelle
  UPDATE public.session_participants
  SET status = 'left_early',
      left_at = NOW(),
      trust_score_change = -20
  WHERE session_id = p_session_id AND user_id = p_ghost_user_id;
END;
$$;


-- ============================================================
-- 5. AUTO SESSION COMPLETION TRIGGER
-- ============================================================
-- Session tamamlandığında otomatik +2 trust
CREATE OR REPLACE FUNCTION public.trigger_session_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Session completed olduğunda katılımcılara trust ver
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    -- Tüm 'active' veya 'completed' status'lu katılımcılara +2 trust
    PERFORM public.update_trust_score(
      sp.user_id,
      NEW.id,
      CASE WHEN NEW.mode = 'solo' THEN 'solo_session_completed' ELSE 'session_completed' END,
      CASE WHEN NEW.mode = 'solo' AND u.trust_score < 50 THEN 5 ELSE 2 END,
      NULL,
      jsonb_build_object('mode', NEW.mode, 'duration', NEW.duration)
    )
    FROM public.session_participants sp
    JOIN public.users u ON sp.user_id = u.id
    WHERE sp.session_id = NEW.id
      AND sp.status IN ('active', 'completed');
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger oluştur
DROP TRIGGER IF EXISTS on_session_status_change ON public.sessions;
CREATE TRIGGER on_session_status_change
  AFTER UPDATE OF status ON public.sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_session_completion();


-- ============================================================
-- 6. GRANT PERMISSIONS
-- ============================================================
GRANT EXECUTE ON FUNCTION public.process_partner_rating(UUID, UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_early_exit(UUID, UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_no_show(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_ghosting(UUID, UUID) TO authenticated;
