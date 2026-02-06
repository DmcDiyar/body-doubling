-- ============================================================
-- SESSIZ ORTAK - MVP 1 DATABASE SCHEMA
-- Version: 1.0.0
-- Date: 2026-02-05
-- ============================================================
-- Tüm tablolar, indexler, RLS policies, fonksiyonlar ve seed data
-- UI'da görünen HER element DB'de karşılığa sahip.
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. USERS TABLE
-- ============================================================
-- Auth.users ile 1:1 ilişki (Supabase Auth trigger ile oluşur)
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  avatar_id INTEGER NOT NULL DEFAULT 1 CHECK (avatar_id BETWEEN 1 AND 4),

  -- Preferences
  preferred_times TEXT[] DEFAULT '{}',
  music_preference TEXT NOT NULL DEFAULT 'lofi' CHECK (music_preference IN ('lofi', 'classical', 'silence')),
  language TEXT NOT NULL DEFAULT 'tr' CHECK (language IN ('tr', 'en')),

  -- Stats (UI'da Dashboard'da gösterilen)
  total_sessions INTEGER NOT NULL DEFAULT 0,
  completed_sessions INTEGER NOT NULL DEFAULT 0,
  total_minutes INTEGER NOT NULL DEFAULT 0,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_session_date DATE,

  -- Trust System
  trust_score INTEGER NOT NULL DEFAULT 100 CHECK (trust_score BETWEEN 0 AND 200),

  -- Gamification
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,

  -- Flags
  is_premium BOOLEAN NOT NULL DEFAULT false,
  is_banned BOOLEAN NOT NULL DEFAULT false,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.users IS 'Ana kullanıcı profili. Auth.users ile 1:1.';
COMMENT ON COLUMN public.users.trust_score IS 'Başlangıç 100. 0-200 arası. Eşleşme önceliğini belirler.';
COMMENT ON COLUMN public.users.avatar_id IS 'MVP: 1-4 arası ücretsiz avatar.';

-- ============================================================
-- 2. SESSIONS TABLE
-- ============================================================
-- Tek doğruluk kaynağı: sessions.status
-- UI asla kendi karar vermez, DB state'ini yansıtır
CREATE TABLE public.sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Session config
  duration INTEGER NOT NULL DEFAULT 25 CHECK (duration IN (15, 25, 50)),
  mode TEXT NOT NULL DEFAULT 'duo' CHECK (mode IN ('duo', 'solo')),
  theme TEXT NOT NULL DEFAULT 'rainy_cafe',

  -- State machine: waiting → active → completed | abandoned
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'completed', 'abandoned')),

  -- Timestamps
  scheduled_start TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.sessions IS 'Her seans kaydı. Status tek doğruluk kaynağı.';
COMMENT ON COLUMN public.sessions.status IS 'State machine: waiting → active → completed | abandoned';

-- ============================================================
-- 3. SESSION_PARTICIPANTS TABLE
-- ============================================================
-- Session ile User arasında many-to-many (duo = 2, solo = 1)
CREATE TABLE public.session_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  -- Participation state
  joined_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'completed', 'left_early', 'no_show')),

  -- Goal (UI'da Session Screen'de gösterilen)
  session_goal TEXT DEFAULT '',
  goal_completed BOOLEAN DEFAULT false,

  -- Rating (Session End ekranında)
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),

  -- Gamification impact
  trust_score_change INTEGER NOT NULL DEFAULT 0,
  xp_earned INTEGER NOT NULL DEFAULT 0,

  -- Unique: bir kullanıcı aynı session'a 1 kez katılabilir
  UNIQUE(session_id, user_id)
);

COMMENT ON TABLE public.session_participants IS 'Session-User ilişkisi. Rating, goal, XP burada tutulur.';

-- ============================================================
-- 4. MATCHING_QUEUE TABLE
-- ============================================================
-- Realtime eşleşme kuyruğu. FIFO + trust ağırlıklı.
CREATE TABLE public.matching_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  -- Match preferences
  duration INTEGER NOT NULL DEFAULT 25 CHECK (duration IN (15, 25, 50)),
  theme TEXT NOT NULL DEFAULT 'rainy_cafe',

  -- Priority: trust_score bazlı
  -- Trust < 50 → sadece solo (kuyruğa alınmaz)
  -- Trust 50-69 → priority 0 (düşük)
  -- Trust 70+ → priority 1 (normal)
  -- Trust 90+ → priority 2 (öncelikli)
  priority INTEGER NOT NULL DEFAULT 1 CHECK (priority BETWEEN 0 AND 2),

  -- Status
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'matched', 'expired', 'cancelled')),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 seconds'),

  -- Bir kullanıcı aynı anda sadece 1 kez kuyrukta olabilir
  UNIQUE(user_id)
);

COMMENT ON TABLE public.matching_queue IS 'Eşleşme kuyruğu. FIFO + trust ağırlıklı. 30sn timeout.';

-- ============================================================
-- 5. USER_PRESENCE_LOGS TABLE
-- ============================================================
-- Measured presence: session sırasında heartbeat kayıtları
CREATE TABLE public.user_presence_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,

  -- Presence state
  status TEXT NOT NULL CHECK (status IN ('active', 'idle', 'away')),

  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.user_presence_logs IS 'Session sırasında kullanıcı aktivite logları. Measured presence.';

-- ============================================================
-- 6. TRUST_EVENTS TABLE
-- ============================================================
-- Audit log: tüm trust_score değişimleri kaydedilir
CREATE TABLE public.trust_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL,

  -- Event details
  event_type TEXT NOT NULL CHECK (event_type IN (
    'session_completed',    -- +2
    'rating_5_star',        -- +2
    'rating_4_star',        -- +1
    'rating_1_star',        -- -2
    'early_exit_mild',      -- -4 (ilk 5dk)
    'early_exit_moderate',  -- -8 (5-15dk arası)
    'early_exit_severe',    -- -15 (15dk sonrası)
    'no_show'               -- -20
  )),
  score_change INTEGER NOT NULL,
  score_before INTEGER NOT NULL,
  score_after INTEGER NOT NULL,
  description TEXT DEFAULT '',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.trust_events IS 'Trust score audit log. Tüm değişimler kaydedilir.';

-- ============================================================
-- 7. ACHIEVEMENTS TABLE
-- ============================================================
-- Rozet tanımları (seed data ile doldurulur)
CREATE TABLE public.achievements (
  id INTEGER PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '🏆',
  requirement JSONB NOT NULL,
  rarity TEXT NOT NULL DEFAULT 'common' CHECK (rarity IN ('common', 'rare', 'epic', 'legendary'))
);

COMMENT ON TABLE public.achievements IS 'Achievement/rozet tanımları. Seed data.';

-- ============================================================
-- 8. USER_ACHIEVEMENTS TABLE
-- ============================================================
CREATE TABLE public.user_achievements (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  achievement_id INTEGER NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, achievement_id)
);

COMMENT ON TABLE public.user_achievements IS 'Kullanıcının kazandığı rozetler.';

-- ============================================================
-- 9. USER_LIMITS TABLE
-- ============================================================
-- Free tier: 3 seans/gün
CREATE TABLE public.user_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  sessions_used INTEGER NOT NULL DEFAULT 0,
  max_sessions INTEGER NOT NULL DEFAULT 3,

  UNIQUE(user_id, date)
);

COMMENT ON TABLE public.user_limits IS 'Günlük seans limiti. Free: 3/gün, Premium: sınırsız.';


-- ============================================================
-- INDEXES
-- ============================================================
-- Users
CREATE INDEX idx_users_trust_score ON public.users(trust_score);
CREATE INDEX idx_users_last_active ON public.users(last_active_at);
CREATE INDEX idx_users_is_banned ON public.users(is_banned) WHERE is_banned = true;

-- Sessions
CREATE INDEX idx_sessions_status ON public.sessions(status);
CREATE INDEX idx_sessions_created_at ON public.sessions(created_at);

-- Session Participants
CREATE INDEX idx_sp_session_id ON public.session_participants(session_id);
CREATE INDEX idx_sp_user_id ON public.session_participants(user_id);
CREATE INDEX idx_sp_status ON public.session_participants(status);

-- Matching Queue
CREATE INDEX idx_mq_status ON public.matching_queue(status) WHERE status = 'waiting';
CREATE INDEX idx_mq_duration_theme ON public.matching_queue(duration, theme) WHERE status = 'waiting';
CREATE INDEX idx_mq_priority ON public.matching_queue(priority DESC, created_at ASC) WHERE status = 'waiting';

-- Presence Logs
CREATE INDEX idx_presence_session ON public.user_presence_logs(session_id, created_at);
CREATE INDEX idx_presence_user_session ON public.user_presence_logs(user_id, session_id);

-- Trust Events
CREATE INDEX idx_trust_user ON public.trust_events(user_id, created_at);

-- User Limits
CREATE INDEX idx_limits_user_date ON public.user_limits(user_id, date);


-- ============================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matching_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_presence_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trust_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_limits ENABLE ROW LEVEL SECURITY;

-- USERS policies
CREATE POLICY "Users can read own profile"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can read partner profiles in sessions"
  ON public.users FOR SELECT
  USING (
    id IN (
      SELECT sp.user_id FROM public.session_participants sp
      WHERE sp.session_id IN (
        SELECT sp2.session_id FROM public.session_participants sp2
        WHERE sp2.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- SESSIONS policies
CREATE POLICY "Users can read own sessions"
  ON public.sessions FOR SELECT
  USING (
    id IN (
      SELECT session_id FROM public.session_participants
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Authenticated users can create sessions"
  ON public.sessions FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Session status can be updated by participants"
  ON public.sessions FOR UPDATE
  USING (
    id IN (
      SELECT session_id FROM public.session_participants
      WHERE user_id = auth.uid()
    )
  );

-- SESSION_PARTICIPANTS policies
CREATE POLICY "Users can read participants of own sessions"
  ON public.session_participants FOR SELECT
  USING (
    session_id IN (
      SELECT session_id FROM public.session_participants
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own participation"
  ON public.session_participants FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own participation"
  ON public.session_participants FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- MATCHING_QUEUE policies
CREATE POLICY "Users can manage own queue entry"
  ON public.matching_queue FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can read waiting queue for match count"
  ON public.matching_queue FOR SELECT
  USING (status = 'waiting');

-- USER_PRESENCE_LOGS policies
CREATE POLICY "Users can insert own presence"
  ON public.user_presence_logs FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can read session presence"
  ON public.user_presence_logs FOR SELECT
  USING (
    session_id IN (
      SELECT session_id FROM public.session_participants
      WHERE user_id = auth.uid()
    )
  );

-- TRUST_EVENTS policies
CREATE POLICY "Users can read own trust events"
  ON public.trust_events FOR SELECT
  USING (user_id = auth.uid());

-- ACHIEVEMENTS policies (public read)
CREATE POLICY "Anyone can read achievements"
  ON public.achievements FOR SELECT
  USING (true);

-- USER_ACHIEVEMENTS policies
CREATE POLICY "Users can read own achievements"
  ON public.user_achievements FOR SELECT
  USING (user_id = auth.uid());

-- USER_LIMITS policies
CREATE POLICY "Users can read own limits"
  ON public.user_limits FOR SELECT
  USING (user_id = auth.uid());


-- ============================================================
-- FUNCTIONS
-- ============================================================

-- 1. Auto-create user profile on auth signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$;

-- Trigger: auth.users insert → public.users insert
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- 2. Calculate matching priority from trust score
CREATE OR REPLACE FUNCTION public.get_match_priority(p_trust_score INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_trust_score < 50 THEN
    RETURN -1; -- Solo only, kuyruğa alınmaz
  ELSIF p_trust_score < 70 THEN
    RETURN 0;  -- Düşük öncelik
  ELSIF p_trust_score < 90 THEN
    RETURN 1;  -- Normal
  ELSE
    RETURN 2;  -- Öncelikli
  END IF;
END;
$$;


-- 3. Find and execute match (FIFO + trust priority)
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
  v_user_priority INTEGER;
BEGIN
  -- Kullanıcının trust score'unu al
  SELECT trust_score INTO v_user_trust FROM public.users WHERE id = p_user_id;

  -- Priority hesapla
  v_user_priority := public.get_match_priority(v_user_trust);

  -- Trust < 50 ise solo mode
  IF v_user_priority = -1 THEN
    RETURN NULL;
  END IF;

  -- Uygun partner bul (FIFO + priority)
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
  ORDER BY mq.priority DESC, mq.created_at ASC
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


-- 4. Update trust score with audit log
CREATE OR REPLACE FUNCTION public.update_trust_score(
  p_user_id UUID,
  p_session_id UUID,
  p_event_type TEXT,
  p_score_change INTEGER
)
RETURNS INTEGER -- new trust score
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_score INTEGER;
  v_new_score INTEGER;
BEGIN
  -- Mevcut score al
  SELECT trust_score INTO v_current_score
  FROM public.users
  WHERE id = p_user_id
  FOR UPDATE;

  -- Yeni score hesapla (0-200 arası clamp)
  v_new_score := GREATEST(0, LEAST(200, v_current_score + p_score_change));

  -- Users tablosunu güncelle
  UPDATE public.users
  SET trust_score = v_new_score
  WHERE id = p_user_id;

  -- Audit log yaz
  INSERT INTO public.trust_events (user_id, session_id, event_type, score_change, score_before, score_after)
  VALUES (p_user_id, p_session_id, p_event_type, p_score_change, v_current_score, v_new_score);

  RETURN v_new_score;
END;
$$;


-- 5. Complete session and award XP/streak
CREATE OR REPLACE FUNCTION public.complete_session(
  p_session_id UUID,
  p_user_id UUID,
  p_rating INTEGER DEFAULT NULL,
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
BEGIN
  -- Session bilgisini al
  SELECT * INTO v_session FROM public.sessions WHERE id = p_session_id;

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Session not found';
  END IF;

  -- Base XP: session tamamlama
  v_xp_earned := 50;
  v_trust_change := 2; -- session_completed: +2

  -- Goal completed bonus
  IF p_goal_completed THEN
    v_xp_earned := v_xp_earned + 10;
  END IF;

  -- Rating trust impact
  IF p_rating IS NOT NULL THEN
    IF p_rating = 5 THEN
      v_xp_earned := v_xp_earned + 10;
    ELSIF p_rating = 4 THEN
      v_xp_earned := v_xp_earned + 5;
    END IF;
  END IF;

  -- Session participant güncelle
  UPDATE public.session_participants
  SET status = 'completed',
      left_at = NOW(),
      rating = p_rating,
      goal_completed = p_goal_completed,
      xp_earned = v_xp_earned,
      trust_score_change = v_trust_change
  WHERE session_id = p_session_id AND user_id = p_user_id;

  -- Trust score güncelle
  PERFORM public.update_trust_score(p_user_id, p_session_id, 'session_completed', v_trust_change);

  -- Rating bazlı trust (partner'ın rating'i sonra ayrıca işlenir)

  -- Streak hesapla
  SELECT current_streak, last_session_date
  INTO v_streak, v_last_date
  FROM public.users
  WHERE id = p_user_id;

  IF v_last_date IS NULL OR v_last_date < v_today - 1 THEN
    -- Streak kırıldı veya ilk seans
    v_streak := 1;
  ELSIF v_last_date = v_today - 1 THEN
    -- Ardışık gün, streak artır
    v_streak := v_streak + 1;
  END IF;
  -- v_last_date = v_today ise streak zaten sayılmış, değişme

  -- Streak XP bonus
  IF v_last_date IS DISTINCT FROM v_today THEN
    v_xp_earned := v_xp_earned + 20; -- daily streak bonus
  END IF;

  -- User stats güncelle
  UPDATE public.users
  SET total_sessions = total_sessions + 1,
      completed_sessions = completed_sessions + 1,
      total_minutes = total_minutes + v_session.duration,
      current_streak = v_streak,
      longest_streak = GREATEST(longest_streak, v_streak),
      last_session_date = v_today,
      xp = xp + v_xp_earned,
      level = GREATEST(1, FLOOR(SQRT((xp + v_xp_earned) / 100.0))::INTEGER + 1),
      last_active_at = NOW()
  WHERE id = p_user_id;

  -- User limits güncelle
  INSERT INTO public.user_limits (user_id, date, sessions_used, max_sessions)
  VALUES (p_user_id, v_today, 1, CASE WHEN (SELECT is_premium FROM public.users WHERE id = p_user_id) THEN 999 ELSE 3 END)
  ON CONFLICT (user_id, date)
  DO UPDATE SET sessions_used = public.user_limits.sessions_used + 1;

  -- Sonuç döndür
  v_result := jsonb_build_object(
    'xp_earned', v_xp_earned,
    'trust_change', v_trust_change,
    'new_streak', v_streak,
    'goal_completed', p_goal_completed
  );

  RETURN v_result;
END;
$$;


-- 6. Handle early exit
CREATE OR REPLACE FUNCTION public.handle_early_exit(
  p_session_id UUID,
  p_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session RECORD;
  v_minutes_elapsed INTEGER;
  v_trust_change INTEGER;
  v_event_type TEXT;
BEGIN
  SELECT * INTO v_session FROM public.sessions WHERE id = p_session_id;

  IF v_session.started_at IS NOT NULL THEN
    v_minutes_elapsed := EXTRACT(EPOCH FROM (NOW() - v_session.started_at)) / 60;
  ELSE
    v_minutes_elapsed := 0;
  END IF;

  -- Trust cezası hesapla
  IF v_minutes_elapsed < 5 THEN
    v_trust_change := -4;
    v_event_type := 'early_exit_mild';
  ELSIF v_minutes_elapsed < 15 THEN
    v_trust_change := -8;
    v_event_type := 'early_exit_moderate';
  ELSE
    v_trust_change := -15;
    v_event_type := 'early_exit_severe';
  END IF;

  -- Participant güncelle
  UPDATE public.session_participants
  SET status = 'left_early',
      left_at = NOW(),
      trust_score_change = v_trust_change
  WHERE session_id = p_session_id AND user_id = p_user_id;

  -- Trust güncelle
  PERFORM public.update_trust_score(p_user_id, p_session_id, v_event_type, v_trust_change);

  -- Session'ı abandoned yap eğer kimse kalmadıysa
  IF NOT EXISTS (
    SELECT 1 FROM public.session_participants
    WHERE session_id = p_session_id AND status IN ('waiting', 'active')
  ) THEN
    UPDATE public.sessions SET status = 'abandoned', ended_at = NOW()
    WHERE id = p_session_id;
  END IF;
END;
$$;


-- 7. Handle no-show
CREATE OR REPLACE FUNCTION public.handle_no_show(
  p_session_id UUID,
  p_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Participant güncelle
  UPDATE public.session_participants
  SET status = 'no_show',
      trust_score_change = -20
  WHERE session_id = p_session_id AND user_id = p_user_id;

  -- Trust güncelle (-20)
  PERFORM public.update_trust_score(p_user_id, p_session_id, 'no_show', -20);
END;
$$;


-- 8. Check daily session limit
CREATE OR REPLACE FUNCTION public.check_session_limit(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_premium BOOLEAN;
  v_used INTEGER;
BEGIN
  SELECT is_premium INTO v_is_premium FROM public.users WHERE id = p_user_id;

  IF v_is_premium THEN
    RETURN true;
  END IF;

  SELECT COALESCE(sessions_used, 0) INTO v_used
  FROM public.user_limits
  WHERE user_id = p_user_id AND date = CURRENT_DATE;

  RETURN COALESCE(v_used, 0) < 3;
END;
$$;


-- 9. Expire old matching queue entries
CREATE OR REPLACE FUNCTION public.expire_matching_queue()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.matching_queue
  SET status = 'expired'
  WHERE status = 'waiting' AND expires_at < NOW();
END;
$$;


-- 10. Process partner rating (trust impact on rated user)
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
  v_trust_change INTEGER;
  v_event_type TEXT;
BEGIN
  -- Partner'ı bul
  SELECT user_id INTO v_partner_id
  FROM public.session_participants
  WHERE session_id = p_session_id AND user_id != p_rater_id
  LIMIT 1;

  IF v_partner_id IS NULL THEN
    RETURN; -- Solo mode, partner yok
  END IF;

  -- Rating'e göre trust impact
  IF p_rating = 5 THEN
    v_trust_change := 2;
    v_event_type := 'rating_5_star';
  ELSIF p_rating = 4 THEN
    v_trust_change := 1;
    v_event_type := 'rating_4_star';
  ELSIF p_rating = 1 THEN
    v_trust_change := -2;
    v_event_type := 'rating_1_star';
  ELSE
    RETURN; -- 2-3 yıldız neutral
  END IF;

  -- Partner'ın trust score'unu güncelle
  PERFORM public.update_trust_score(v_partner_id, p_session_id, v_event_type, v_trust_change);
END;
$$;


-- ============================================================
-- REALTIME SUBSCRIPTIONS
-- ============================================================
-- Bu tablolarda realtime değişiklikleri yayınla
ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.session_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.matching_queue;


-- ============================================================
-- SEED DATA: ACHIEVEMENTS
-- ============================================================
INSERT INTO public.achievements (id, code, name, description, icon, requirement, rarity) VALUES
  (1, 'FIRST_SESSION', 'İlk Adım', 'İlk seansını tamamla', '🎯', '{"type": "sessions", "value": 1}', 'common'),
  (2, 'STREAK_7', 'Ateş Başlangıcı', '7 günlük streak', '🔥', '{"type": "streak", "value": 7}', 'common'),
  (3, 'STREAK_30', 'Alev Ustası', '30 günlük streak', '🔥', '{"type": "streak", "value": 30}', 'rare'),
  (4, 'FOCUS_500', 'Derin Odak', '500 dakika odaklanma', '💎', '{"type": "total_minutes", "value": 500}', 'rare'),
  (5, 'SESSIONS_10', 'Düzenli', '10 seans tamamla', '📚', '{"type": "sessions", "value": 10}', 'common'),
  (6, 'SESSIONS_50', 'Kararlı', '50 seans tamamla', '💪', '{"type": "sessions", "value": 50}', 'rare'),
  (7, 'SESSIONS_100', 'Yüzüncü Kulüp', '100 seans tamamla', '💯', '{"type": "sessions", "value": 100}', 'epic'),
  (8, 'TRUST_120', 'Güvenilir', 'Trust score 120+', '⭐', '{"type": "trust_score", "value": 120}', 'rare')
ON CONFLICT (id) DO NOTHING;
