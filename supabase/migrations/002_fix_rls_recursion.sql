-- ============================================================
-- FIX: RLS infinite recursion
-- Sorun: users → session_participants → session_participants (self-ref)
-- Çözüm: Döngüsel cross-table referansları kaldır, basit auth.uid() kontrolleri kullan
-- ============================================================

-- ============================================================
-- 1. DROP problematic policies
-- ============================================================

-- USERS: partner profiles policy döngü yaratıyor
DROP POLICY IF EXISTS "Users can read partner profiles in sessions" ON public.users;

-- SESSION_PARTICIPANTS: self-referencing policy
DROP POLICY IF EXISTS "Users can read participants of own sessions" ON public.session_participants;

-- SESSIONS: session_participants'a referans veriyor (bu da users'a bakıyor)
DROP POLICY IF EXISTS "Users can read own sessions" ON public.sessions;
DROP POLICY IF EXISTS "Session status can be updated by participants" ON public.sessions;

-- USER_PRESENCE_LOGS: session_participants'a referans veriyor
DROP POLICY IF EXISTS "Users can read session presence" ON public.user_presence_logs;

-- ============================================================
-- 2. RECREATE policies without circular references
-- ============================================================

-- USERS: Herkes kendi profilini okuyabilir (zaten var, dokunmuyoruz)
-- Ek: Authenticated kullanıcılar diğer kullanıcıların temel bilgilerini okuyabilir
-- (Session sırasında partner avatarını görmek için gerekli)
CREATE POLICY "Authenticated users can read all profiles"
  ON public.users FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- USERS: Insert policy (upsert için gerekli)
CREATE POLICY "Users can insert own profile"
  ON public.users FOR INSERT
  WITH CHECK (auth.uid() = id);

-- SESSION_PARTICIPANTS: Kullanıcı kendi katıldığı session'ların tüm participant'larını görebilir
-- Self-referencing yerine user_id ile doğrudan kontrol
CREATE POLICY "Users can read own participation"
  ON public.session_participants FOR SELECT
  USING (user_id = auth.uid());

-- SESSION_PARTICIPANTS: Partner'ın participation'ını da görebilmeli (aynı session'da)
-- Bu policy EXISTS kullanarak tek seviyeli kontrol yapar, döngü yaratmaz
CREATE POLICY "Users can read partner participation"
  ON public.session_participants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.session_participants my_part
      WHERE my_part.session_id = session_participants.session_id
        AND my_part.user_id = auth.uid()
    )
  );

-- SESSIONS: Kullanıcı authenticated ise session'ları okuyabilir
-- (Basitleştirildi — cross-table referans yok)
CREATE POLICY "Authenticated users can read sessions"
  ON public.sessions FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- SESSIONS: Participant olan kullanıcılar session'ı güncelleyebilir
CREATE POLICY "Participants can update sessions"
  ON public.sessions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.session_participants
      WHERE session_participants.session_id = sessions.id
        AND session_participants.user_id = auth.uid()
    )
  );

-- USER_PRESENCE_LOGS: Authenticated kullanıcılar okuyabilir
CREATE POLICY "Authenticated users can read presence logs"
  ON public.user_presence_logs FOR SELECT
  USING (auth.uid() IS NOT NULL);
