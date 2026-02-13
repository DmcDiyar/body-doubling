-- ============================================================
-- 038: P3 ÖZELLİKLER — Mentor Sistemi + Evolving Badges + Analytics
-- Date: 2026-02-13
-- ============================================================
-- 1. analytics_events tablosu (037'deki eksik referans)
-- 2. Evolving badges: Bronz → Gümüş → Altın
-- 3. Mentor sistemi
-- ============================================================


-- ============================================================
-- 1. ANALYTICS EVENTS TABLOSU
-- ============================================================
-- 037'deki rescue_streak bu tabloya INSERT yapar, tablo yoktu

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  properties JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_user_event
  ON analytics_events(user_id, event_name, created_at DESC);

ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- Admin-only: kullanıcılar kendi eventlerini okuyamaz (gizli analitik)
CREATE POLICY "service_role_only" ON analytics_events
  FOR ALL USING (false);


-- ============================================================
-- 2. EVOLVING BADGES — Bronz → Gümüş → Altın
-- ============================================================
-- Mevcut achievements tablosuna tier sistemi ekle

ALTER TABLE public.achievements
  ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'gold'
  CHECK (tier IN ('bronze', 'silver', 'gold'));

ALTER TABLE public.achievements
  ADD COLUMN IF NOT EXISTS evolution_from INT DEFAULT NULL
  REFERENCES public.achievements(id);

-- user_achievements'a tier bilgisi ekle
ALTER TABLE public.user_achievements
  ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'gold'
  CHECK (tier IN ('bronze', 'silver', 'gold'));

ALTER TABLE public.user_achievements
  ADD COLUMN IF NOT EXISTS evolved_at TIMESTAMPTZ DEFAULT NULL;


-- Evolving badge tanımları:
-- Seri rozetleri: 3-gün (bronz), 7-gün (gümüş), 14-gün (altın)
-- Session rozetleri: 10 (bronz), 25 (gümüş), 50 (altın)
-- Dakika rozetleri: 500dk (bronz), 1000dk (gümüş), 5000dk (altın)

-- Mevcut rozetlere tier ata
UPDATE achievements SET tier = 'bronze' WHERE code IN ('STREAK_3', 'SESSIONS_10', 'FOCUS_500', 'DUO_10', 'FIRST_SESSION');
UPDATE achievements SET tier = 'silver' WHERE code IN ('STREAK_7', 'SESSIONS_25', 'MINUTES_1000', 'STREAK_14');
UPDATE achievements SET tier = 'gold'   WHERE code IN ('STREAK_30', 'SESSIONS_50', 'MINUTES_5000', 'SESSIONS_100', 'DUO_50', 'TRUST_150', 'PERFECT_WEEK');

-- evolution_from bağlantıları kur
UPDATE achievements SET evolution_from = (SELECT id FROM achievements WHERE code = 'STREAK_3')  WHERE code = 'STREAK_7';
UPDATE achievements SET evolution_from = (SELECT id FROM achievements WHERE code = 'STREAK_7')  WHERE code = 'STREAK_14';
UPDATE achievements SET evolution_from = (SELECT id FROM achievements WHERE code = 'STREAK_14') WHERE code = 'STREAK_30';

UPDATE achievements SET evolution_from = (SELECT id FROM achievements WHERE code = 'SESSIONS_10')  WHERE code = 'SESSIONS_25';
UPDATE achievements SET evolution_from = (SELECT id FROM achievements WHERE code = 'SESSIONS_25')  WHERE code = 'SESSIONS_50';
UPDATE achievements SET evolution_from = (SELECT id FROM achievements WHERE code = 'SESSIONS_50')  WHERE code = 'SESSIONS_100';

UPDATE achievements SET evolution_from = (SELECT id FROM achievements WHERE code = 'FOCUS_500')     WHERE code = 'MINUTES_1000';
UPDATE achievements SET evolution_from = (SELECT id FROM achievements WHERE code = 'MINUTES_1000')  WHERE code = 'MINUTES_5000';

UPDATE achievements SET evolution_from = (SELECT id FROM achievements WHERE code = 'DUO_10')  WHERE code = 'DUO_50';

-- Mevcut user_achievements'a doğru tier ata
UPDATE user_achievements ua SET tier = a.tier
FROM achievements a WHERE ua.achievement_id = a.id;


-- Evolving badge API: kullanıcının rozetlerini tier bilgisiyle getir
CREATE OR REPLACE FUNCTION public.get_badges_with_tiers(p_user_id UUID)
RETURNS TABLE(
  achievement_id INT,
  code TEXT,
  name TEXT,
  description TEXT,
  icon TEXT,
  rarity TEXT,
  tier TEXT,
  unlocked BOOLEAN,
  unlocked_at TIMESTAMPTZ,
  evolution_chain JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id AS achievement_id,
    a.code,
    a.name,
    a.description,
    a.icon,
    a.rarity,
    a.tier,
    ua.user_id IS NOT NULL AS unlocked,
    ua.unlocked_at,
    -- Evrim zinciri: bu rozetin geldiği ve gittiği rozetler
    CASE WHEN a.evolution_from IS NOT NULL OR EXISTS (
      SELECT 1 FROM achievements a2 WHERE a2.evolution_from = a.id
    ) THEN
      jsonb_build_object(
        'from', (SELECT jsonb_build_object('code', a3.code, 'tier', a3.tier, 'name', a3.name)
                 FROM achievements a3 WHERE a3.id = a.evolution_from),
        'to', (SELECT jsonb_agg(jsonb_build_object('code', a4.code, 'tier', a4.tier, 'name', a4.name))
               FROM achievements a4 WHERE a4.evolution_from = a.id)
      )
    ELSE NULL END AS evolution_chain
  FROM achievements a
  LEFT JOIN user_achievements ua ON ua.achievement_id = a.id AND ua.user_id = p_user_id
  ORDER BY a.tier = 'bronze', a.tier = 'silver', a.tier = 'gold', a.id;
END;
$$;


-- ============================================================
-- 3. MENTOR SİSTEMİ
-- ============================================================
-- Tecrübeli kullanıcılar (mastery stage) yeni kullanıcılara mentor olabilir.
-- Mentor-mentee ilişkisi, mentor'un oturumlarına mentee'yi otomatik eşleştirmez
-- ama sonuçlarını paylaşır (ör: "Mentorun bugün 3 seans yaptı").

CREATE TABLE IF NOT EXISTS public.mentor_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  mentee_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'ended', 'paused')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ DEFAULT NULL,
  -- İstatistikler
  mentor_sessions_during INT NOT NULL DEFAULT 0,
  mentee_sessions_during INT NOT NULL DEFAULT 0,
  UNIQUE(mentor_id, mentee_id)
);

CREATE INDEX IF NOT EXISTS idx_mentor_active
  ON mentor_relationships(mentor_id, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_mentee_active
  ON mentor_relationships(mentee_id, status) WHERE status = 'active';

ALTER TABLE mentor_relationships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_own_relationships" ON mentor_relationships
  FOR SELECT USING (auth.uid() = mentor_id OR auth.uid() = mentee_id);


-- Mentor olmak için kriterler: mastery stage + 50+ seans + trust >= 100
CREATE OR REPLACE FUNCTION public.become_mentor()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_user RECORD;
  v_existing INT;
BEGIN
  SELECT maturity_stage, completed_sessions, trust_score, metadata
  INTO v_user FROM users WHERE id = v_uid;

  IF v_user IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'user_not_found');
  END IF;

  -- Kriter kontrolü
  IF v_user.maturity_stage NOT IN ('growth', 'mastery') THEN
    RETURN jsonb_build_object('success', false, 'reason', 'stage_too_low', 'required', 'growth+');
  END IF;

  IF v_user.completed_sessions < 50 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'sessions_too_low', 'required', 50, 'current', v_user.completed_sessions);
  END IF;

  IF v_user.trust_score < 100 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'trust_too_low', 'required', 100, 'current', v_user.trust_score);
  END IF;

  -- Zaten aktif mentor ilişkisi var mı? (max 3)
  SELECT COUNT(*) INTO v_existing
  FROM mentor_relationships
  WHERE mentor_id = v_uid AND status = 'active';

  IF v_existing >= 3 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'max_mentees_reached', 'max', 3);
  END IF;

  -- metadata'da mentor flag set et
  UPDATE users SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"is_mentor": true}'::jsonb
  WHERE id = v_uid;

  RETURN jsonb_build_object('success', true, 'active_mentees', v_existing);
END;
$$;


-- Mentor bul (sistem eşleştirir: discovery/formation kullanıcısına uygun mentor)
CREATE OR REPLACE FUNCTION public.find_mentor()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_user RECORD;
  v_mentor RECORD;
  v_existing_mentor UUID;
BEGIN
  -- Parametre yerine v_uid
  SELECT maturity_stage, completed_sessions INTO v_user
  FROM users WHERE id = v_uid;

  IF v_user IS NULL THEN
    RETURN jsonb_build_object('found', false, 'reason', 'user_not_found');
  END IF;

  -- Sadece discovery/formation kullanıcıları mentor alabilir
  IF v_user.maturity_stage NOT IN ('discovery', 'formation') THEN
    RETURN jsonb_build_object('found', false, 'reason', 'stage_too_high');
  END IF;

  -- Zaten aktif mentoru var mı?
  SELECT mentor_id INTO v_existing_mentor
  FROM mentor_relationships
  WHERE mentee_id = v_uid AND status = 'active'
  LIMIT 1;

  IF v_existing_mentor IS NOT NULL THEN
    RETURN jsonb_build_object('found', false, 'reason', 'already_has_mentor', 'mentor_id', v_existing_mentor);
  END IF;

  -- Uygun mentor bul (en az müsait olanı, son aktif olana göre)
  SELECT u.id, u.name, u.completed_sessions, u.trust_score,
         (SELECT COUNT(*) FROM mentor_relationships mr WHERE mr.mentor_id = u.id AND mr.status = 'active') AS current_mentees
  INTO v_mentor
  FROM users u
  WHERE (u.metadata->>'is_mentor')::BOOLEAN = true
    AND u.maturity_stage IN ('growth', 'mastery')
    AND u.trust_score >= 100
    AND u.completed_sessions >= 50
    AND u.id != v_uid
    AND (SELECT COUNT(*) FROM mentor_relationships mr2 WHERE mr2.mentor_id = u.id AND mr2.status = 'active') < 3
  ORDER BY
    u.last_active_at DESC,
    u.trust_score DESC
  LIMIT 1;

  IF v_mentor IS NULL THEN
    RETURN jsonb_build_object('found', false, 'reason', 'no_available_mentors');
  END IF;

  -- Mentor ilişkisi kur
  INSERT INTO mentor_relationships (mentor_id, mentee_id)
  VALUES (v_mentor.id, v_uid);

  -- Bildirimleri gönder
  PERFORM emit_notification(
    v_mentor.id,
    'system',
    'Yeni Mentee! 🌱',
    'Bir kullanıcı sana mentor olarak atandı. İlerleme sayfandan takip edebilirsin.',
    jsonb_build_object('mentee_id', v_uid)
  );

  PERFORM emit_notification(
    v_uid,
    'system',
    'Mentorun Atandı! 🎓',
    v_mentor.name || ' artık senin mentorun. Yolculuğuna eşlik edecek.',
    jsonb_build_object('mentor_id', v_mentor.id, 'mentor_name', v_mentor.name)
  );

  RETURN jsonb_build_object(
    'found', true,
    'mentor_id', v_mentor.id,
    'mentor_name', v_mentor.name,
    'mentor_sessions', v_mentor.completed_sessions,
    'mentor_trust', v_mentor.trust_score
  );
END;
$$;


-- Mentor ilerleme özeti (mentor veya mentee çağırabilir)
CREATE OR REPLACE FUNCTION public.get_mentor_summary()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_as_mentor JSONB;
  v_as_mentee JSONB;
  v_rel RECORD;
BEGIN
  -- Mentor olarak
  SELECT jsonb_agg(jsonb_build_object(
    'mentee_id', mr.mentee_id,
    'mentee_name', u.name,
    'mentee_sessions', u.completed_sessions,
    'mentee_streak', u.current_streak,
    'mentee_stage', u.maturity_stage,
    'started_at', mr.started_at,
    'sessions_during', mr.mentee_sessions_during
  ))
  INTO v_as_mentor
  FROM mentor_relationships mr
  JOIN users u ON u.id = mr.mentee_id
  WHERE mr.mentor_id = v_uid AND mr.status = 'active';

  -- Mentee olarak
  SELECT jsonb_build_object(
    'mentor_id', mr.mentor_id,
    'mentor_name', u.name,
    'mentor_sessions', u.completed_sessions,
    'mentor_streak', u.current_streak,
    'mentor_trust', u.trust_score,
    'started_at', mr.started_at,
    'your_sessions_during', mr.mentee_sessions_during,
    'mentor_sessions_during', mr.mentor_sessions_during
  )
  INTO v_as_mentee
  FROM mentor_relationships mr
  JOIN users u ON u.id = mr.mentor_id
  WHERE mr.mentee_id = v_uid AND mr.status = 'active'
  LIMIT 1;

  RETURN jsonb_build_object(
    'is_mentor', COALESCE((SELECT (metadata->>'is_mentor')::BOOLEAN FROM users WHERE id = v_uid), false),
    'as_mentor', v_as_mentor,
    'as_mentee', v_as_mentee
  );
END;
$$;


-- Mentor ilişkisi istatistik güncelle (complete_session'dan sonra çağrılır)
CREATE OR REPLACE FUNCTION public.update_mentor_stats(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Kullanıcı mentor ise → mentor_sessions_during artır
  UPDATE mentor_relationships
  SET mentor_sessions_during = mentor_sessions_during + 1
  WHERE mentor_id = p_user_id AND status = 'active';

  -- Kullanıcı mentee ise → mentee_sessions_during artır
  UPDATE mentor_relationships
  SET mentee_sessions_during = mentee_sessions_during + 1
  WHERE mentee_id = p_user_id AND status = 'active';
END;
$$;


-- Bildirim tiplerini güncelle (mentor bildirimleri + sezon)
-- notifications.type CHECK constraint'ini genişlet
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'badge_unlocked', 'level_up', 'streak_risk', 'streak_milestone',
    'session_reminder', 'weekly_summary', 'system',
    'season_complete', 'streak_rescued', 'mentor_assigned',
    'burnout_warning', 'comeback_detected'
  ));


-- ============================================================
-- 4. COMPLETE_SESSION'A MENTOR STATS EKLE
-- ============================================================
-- Not: 036'da complete_session ve complete_solo_session güncellendi.
-- Şimdi onlara mentor stats çağrısı eklemek yerine, trigger kullanıyoruz.

CREATE OR REPLACE FUNCTION public.trigger_mentor_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    PERFORM update_mentor_stats(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_participant_complete_mentor ON session_participants;
CREATE TRIGGER on_participant_complete_mentor
  AFTER UPDATE OF status ON session_participants
  FOR EACH ROW
  WHEN (NEW.status = 'completed')
  EXECUTE FUNCTION trigger_mentor_stats();


-- ============================================================
-- 5. GRANT PERMISSIONS
-- ============================================================

GRANT EXECUTE ON FUNCTION public.get_badges_with_tiers(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.become_mentor() TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_mentor() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_mentor_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_mentor_stats(UUID) TO authenticated;
