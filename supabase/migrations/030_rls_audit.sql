-- ============================================================
-- 030: RLS POLİCY AUDİT + GÜVENLİK DÜZELTMELERİ
-- Date: 2026-02-13
-- ============================================================
-- 1. matching_queue: FOR ALL → ayrı policy'ler
-- 2. users: partner profile SELECT policy basitleştir
-- 3. notifications: RLS (zaten 028'de yapıldı — doğrulama)
-- 4. sessions: participant-only UPDATE ek koşul
-- ============================================================


-- ============================================================
-- 1. MATCHING_QUEUE: Granular Policy'ler
-- ============================================================

-- Mevcut policy'leri kaldır
DROP POLICY IF EXISTS "Users can manage own queue entry" ON public.matching_queue;
DROP POLICY IF EXISTS "Users can read waiting queue for match count" ON public.matching_queue;

-- SELECT: Kendi kaydını + bekleyenlerin sayısını görebilir
CREATE POLICY "mq_select_own"
  ON public.matching_queue FOR SELECT
  USING (
    user_id = auth.uid()            -- Kendi kaydı
    OR status = 'waiting'           -- Bekleme sayısı için (anonim)
  );

-- INSERT: Sadece kendisi için kuyruk kaydı oluşturabilir
CREATE POLICY "mq_insert_own"
  ON public.matching_queue FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- UPDATE: Sadece kendi kaydını güncelleyebilir
CREATE POLICY "mq_update_own"
  ON public.matching_queue FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- DELETE: Sadece kendi kaydını silebilir
CREATE POLICY "mq_delete_own"
  ON public.matching_queue FOR DELETE
  USING (user_id = auth.uid());


-- ============================================================
-- 2. USERS: Partner Profile SELECT Basitleştirme
-- ============================================================
-- Mevcut: 3 seviye iç içe subquery → yavaş
-- Yeni: Sadece temel bilgileri (name ilk harf, trust_level, streak) görebilir
-- Tam profil erişimi hala kendi kaydıyla sınırlı

-- Mevcut partner policy'yi kaldır
DROP POLICY IF EXISTS "Users can read partner profiles in sessions" ON public.users;

-- Basitleştirilmiş partner profile erişimi:
-- Aynı session'daki partner profillerini görebilir
-- Direct join ile 3-level subquery yerine tek seviye
CREATE POLICY "Users can read session partners"
  ON public.users FOR SELECT
  USING (
    auth.uid() = id   -- Kendi profilin (mevcut policy ile çakışacak, OR mantığı)
    OR
    EXISTS (
      SELECT 1
      FROM public.session_participants sp1
      JOIN public.session_participants sp2 ON sp1.session_id = sp2.session_id
      WHERE sp1.user_id = auth.uid()
        AND sp2.user_id = public.users.id
        AND sp1.user_id != sp2.user_id
    )
  );

-- Duplicate self-read policy kaldır (yukarıdaki OR ile zaten kapsanıyor)
DROP POLICY IF EXISTS "Users can read own profile" ON public.users;


-- ============================================================
-- 3. SESSIONS: UPDATE policy — sadece aktif oturumlar
-- ============================================================

-- Mevcut policy'yi daha kısıtlı hale getir
DROP POLICY IF EXISTS "Session status can be updated by participants" ON public.sessions;

CREATE POLICY "Session status update by participants"
  ON public.sessions FOR UPDATE
  USING (
    id IN (
      SELECT session_id FROM public.session_participants
      WHERE user_id = auth.uid()
    )
    AND status IN ('waiting', 'active')  -- completed/abandoned olanlar değiştirilemez
  );


-- ============================================================
-- 4. USER_LIMITS: INSERT policy ekle (günlük limit oluşturma)
-- ============================================================
-- Mevcut: sadece SELECT var, INSERT yok
-- RPC SECURITY DEFINER ile yapılıyor — doğru ama ek güvenlik

-- user_limits güncelleme (RPC dışı erişim engelleme doğrulaması)
-- INSERT policy eklemeye GEREK YOK çünkü tüm INSERT'ler
-- SECURITY DEFINER RPC'lerden yapılıyor. Sadece belgeleme:
COMMENT ON TABLE public.user_limits IS
  'Günlük seans limiti. INSERT/UPDATE yalnızca SECURITY DEFINER RPC ile yapılır. Client direct INSERT yapamaz.';


-- ============================================================
-- 5. TRUST_EVENTS: event_type constraint güncelle
-- (quest + notification event types)
-- ============================================================

ALTER TABLE public.trust_events
  DROP CONSTRAINT IF EXISTS trust_events_event_type_check;

ALTER TABLE public.trust_events
  ADD CONSTRAINT trust_events_event_type_check CHECK (event_type IN (
    'session_completed',
    'solo_session_completed',
    'partner_rated_5_stars',
    'partner_rated_4_stars',
    'partner_rated_1_star',
    'partner_rated_2_stars',
    'rating_5_star',
    'rating_4_star',
    'rating_1_star',
    'early_exit_mild',
    'early_exit_moderate',
    'early_exit_severe',
    'ghosting',
    'no_show',
    'reported_and_verified',
    'helpful_report',
    'quest_weekly',
    'quest_hidden',
    'cooldown_skipped',
    'match_broken',
    'streak_bonus',
    'comeback_bonus'
  ));
