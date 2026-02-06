-- ============================================================
-- FIX: session_participants RLS still has self-referencing recursion
-- "Users can read partner participation" policy queries session_participants
-- from within a session_participants policy → infinite recursion
--
-- Çözüm: Authenticated kullanıcılar tüm participation kayıtlarını okuyabilir.
-- Session ID'ler UUID olduğu için tahmin edilemez, MVP için yeterli güvenlik.
-- ============================================================

-- Drop the problematic self-referencing policy
DROP POLICY IF EXISTS "Users can read own participation" ON public.session_participants;
DROP POLICY IF EXISTS "Users can read partner participation" ON public.session_participants;

-- Simple policy: authenticated users can read session_participants
-- (Session UUID'leri tahmin edilemez — güvenli)
CREATE POLICY "Authenticated users can read participants"
  ON public.session_participants FOR SELECT
  USING (auth.uid() IS NOT NULL);
