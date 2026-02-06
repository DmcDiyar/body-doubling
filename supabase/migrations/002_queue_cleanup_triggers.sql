-- ============================================================
-- MATCHING_QUEUE CLEANUP TRIGGERS
-- Version: 1.0.1
-- Date: 2026-02-06
-- Purpose: 409 Conflict Bug Fix - Automatic queue cleanup
-- ============================================================
-- Rule: User ∈ matching_queue XOR active_session (never both)
-- ============================================================

-- 1. Trigger Function: Clean queue when user joins a session
-- When a user is added to session_participants, remove them from matching_queue
CREATE OR REPLACE FUNCTION public.cleanup_queue_on_participation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Kullanıcı bir session'a katıldığında queue'dan sil
  -- Bu sayede asla hem queue'da hem session'da olamaz
  DELETE FROM public.matching_queue 
  WHERE user_id = NEW.user_id;
  
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.cleanup_queue_on_participation() IS 
  'Trigger: session_participants INSERT → matching_queue DELETE. 409 Conflict önleme.';

-- Trigger: session_participants INSERT
DROP TRIGGER IF EXISTS tr_cleanup_queue_on_join ON public.session_participants;
CREATE TRIGGER tr_cleanup_queue_on_join
AFTER INSERT ON public.session_participants
FOR EACH ROW EXECUTE FUNCTION public.cleanup_queue_on_participation();


-- 2. Trigger Function: Clean queue when session ends
-- When a session becomes 'completed' or 'abandoned', clean all participants from queue
CREATE OR REPLACE FUNCTION public.cleanup_queue_on_session_end()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Session completed veya abandoned olduğunda tüm katılımcıları queue'dan sil
  -- Edge case: Partner ayrıldı, kullanıcı solo devam etti, sonra çıktı
  IF NEW.status IN ('completed', 'abandoned') AND OLD.status NOT IN ('completed', 'abandoned') THEN
    DELETE FROM public.matching_queue 
    WHERE user_id IN (
      SELECT user_id FROM public.session_participants 
      WHERE session_id = NEW.id
    );
  END IF;
  
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.cleanup_queue_on_session_end() IS 
  'Trigger: sessions status → completed/abandoned → matching_queue cleanup for all participants.';

-- Trigger: sessions UPDATE (status değişimi)
DROP TRIGGER IF EXISTS tr_cleanup_queue_on_session_end ON public.sessions;
CREATE TRIGGER tr_cleanup_queue_on_session_end
AFTER UPDATE OF status ON public.sessions
FOR EACH ROW EXECUTE FUNCTION public.cleanup_queue_on_session_end();


-- 3. Trigger Function: Clean queue when session becomes active
-- Extra safety: when session goes to 'active', ensure no queue records remain
CREATE OR REPLACE FUNCTION public.cleanup_queue_on_session_active()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Session active olduğunda tüm katılımcıları queue'dan sil
  -- find_match RPC'si matched yapıyor ama DELETE garantisi için
  IF NEW.status = 'active' AND OLD.status = 'waiting' THEN
    DELETE FROM public.matching_queue 
    WHERE user_id IN (
      SELECT user_id FROM public.session_participants 
      WHERE session_id = NEW.id
    );
  END IF;
  
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.cleanup_queue_on_session_active() IS 
  'Trigger: sessions waiting → active → matching_queue cleanup for all participants.';

-- Trigger: sessions UPDATE (waiting → active)
DROP TRIGGER IF EXISTS tr_cleanup_queue_on_session_active ON public.sessions;
CREATE TRIGGER tr_cleanup_queue_on_session_active
AFTER UPDATE OF status ON public.sessions
FOR EACH ROW EXECUTE FUNCTION public.cleanup_queue_on_session_active();
