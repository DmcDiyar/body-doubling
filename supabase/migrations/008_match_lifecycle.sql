-- ============================================================
-- SESSIZ ORTAK - MATCH LIFECYCLE (MVP 1.5 Critical Fix)
-- Version: 1.0.0
-- Date: 2026-02-06
-- ============================================================
-- Fixes:
--   1. Dual pomodoro selection (now single source)
--   2. Partner exit not handled (heartbeat + auto re-queue)
-- ============================================================


-- ============================================================
-- 1. MATCH STATE ENUM
-- ============================================================
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'match_state') THEN
    CREATE TYPE match_state AS ENUM (
      'preparing',   -- Both users in ritual/pre-session
      'active',      -- Session running
      'broken',      -- One user left
      'completed'    -- Session finished
    );
  END IF;
END $$;


-- ============================================================
-- 2. MATCHES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.sessions(id) ON DELETE CASCADE,
  user_a_id UUID NOT NULL REFERENCES public.users(id),
  user_b_id UUID NOT NULL REFERENCES public.users(id),
  pomodoro_duration INTEGER NOT NULL DEFAULT 25,
  state match_state NOT NULL DEFAULT 'preparing',
  broken_reason TEXT DEFAULT NULL,
  user_a_ready BOOLEAN DEFAULT false,
  user_b_ready BOOLEAN DEFAULT false,
  user_a_last_heartbeat TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  user_b_last_heartbeat TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_matches_session ON public.matches(session_id);
CREATE INDEX IF NOT EXISTS idx_matches_users ON public.matches(user_a_id, user_b_id);
CREATE INDEX IF NOT EXISTS idx_matches_state ON public.matches(state);

-- RLS
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their matches" ON public.matches;
CREATE POLICY "Users can view their matches"
  ON public.matches FOR SELECT
  USING (auth.uid() = user_a_id OR auth.uid() = user_b_id);

DROP POLICY IF EXISTS "Users can update their matches" ON public.matches;
CREATE POLICY "Users can update their matches"
  ON public.matches FOR UPDATE
  USING (auth.uid() = user_a_id OR auth.uid() = user_b_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_match_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS match_updated_at ON public.matches;
CREATE TRIGGER match_updated_at
  BEFORE UPDATE ON public.matches
  FOR EACH ROW EXECUTE FUNCTION update_match_timestamp();


-- ============================================================
-- 3. MATCH HEARTBEAT RPC
-- ============================================================
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
  v_partner_last_hb TIMESTAMP;
  v_partner_alive BOOLEAN;
  v_my_uid UUID := auth.uid();
BEGIN
  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  
  IF v_match IS NULL THEN
    RETURN jsonb_build_object('error', 'match_not_found');
  END IF;
  
  -- Check if user is part of match
  IF v_my_uid != v_match.user_a_id AND v_my_uid != v_match.user_b_id THEN
    RETURN jsonb_build_object('error', 'not_in_match');
  END IF;
  
  v_is_user_a := (v_my_uid = v_match.user_a_id);
  
  -- Update my heartbeat
  IF v_is_user_a THEN
    UPDATE matches SET user_a_last_heartbeat = NOW() WHERE id = p_match_id;
    v_partner_last_hb := v_match.user_b_last_heartbeat;
  ELSE
    UPDATE matches SET user_b_last_heartbeat = NOW() WHERE id = p_match_id;
    v_partner_last_hb := v_match.user_a_last_heartbeat;
  END IF;
  
  -- Check partner alive (15 second threshold)
  v_partner_alive := (v_partner_last_hb IS NOT NULL 
    AND v_partner_last_hb > NOW() - INTERVAL '15 seconds');
  
  -- If partner dead and match not already broken/completed
  IF NOT v_partner_alive AND v_match.state NOT IN ('broken', 'completed') THEN
    UPDATE matches 
    SET state = 'broken', broken_reason = 'partner_timeout'
    WHERE id = p_match_id;
    
    RETURN jsonb_build_object(
      'partner_alive', false,
      'match_state', 'broken',
      'broken_reason', 'partner_timeout'
    );
  END IF;
  
  RETURN jsonb_build_object(
    'partner_alive', v_partner_alive,
    'match_state', v_match.state::TEXT
  );
END;
$$;


-- ============================================================
-- 4. MARK USER READY (after ritual complete)
-- ============================================================
CREATE OR REPLACE FUNCTION public.mark_match_ready(
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
  v_both_ready BOOLEAN;
  v_my_uid UUID := auth.uid();
BEGIN
  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  
  IF v_match IS NULL THEN
    RETURN jsonb_build_object('error', 'match_not_found');
  END IF;
  
  v_is_user_a := (v_my_uid = v_match.user_a_id);
  
  -- Mark ready
  IF v_is_user_a THEN
    UPDATE matches SET user_a_ready = true WHERE id = p_match_id;
    v_both_ready := v_match.user_b_ready;
  ELSE
    UPDATE matches SET user_b_ready = true WHERE id = p_match_id;
    v_both_ready := v_match.user_a_ready;
  END IF;
  
  -- If both ready, transition to active
  IF v_both_ready THEN
    UPDATE matches SET state = 'active' WHERE id = p_match_id;
    
    -- Also start the session
    UPDATE sessions 
    SET status = 'active', started_at = NOW()
    WHERE id = v_match.session_id;
    
    RETURN jsonb_build_object(
      'both_ready', true,
      'match_state', 'active'
    );
  END IF;
  
  RETURN jsonb_build_object(
    'both_ready', false,
    'match_state', 'preparing'
  );
END;
$$;


-- ============================================================
-- 5. RE-QUEUE AFTER BREAK
-- ============================================================
CREATE OR REPLACE FUNCTION public.requeue_after_break(
  p_duration INTEGER,
  p_theme TEXT DEFAULT 'rainy_cafe'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queue_id UUID;
  v_my_uid UUID := auth.uid();
BEGIN
  -- Remove any existing queue entry
  DELETE FROM matching_queue WHERE user_id = v_my_uid;
  
  -- Insert with high priority
  INSERT INTO matching_queue (user_id, duration, theme, priority, status, expires_at)
  VALUES (v_my_uid, p_duration, p_theme, 3, 'waiting', NOW() + INTERVAL '45 seconds')
  RETURNING id INTO v_queue_id;
  
  RETURN v_queue_id;
END;
$$;


-- ============================================================
-- 6. BREAK MATCH (explicit exit)
-- ============================================================
CREATE OR REPLACE FUNCTION public.break_match(
  p_match_id UUID,
  p_reason TEXT DEFAULT 'user_exit'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE matches 
  SET state = 'broken', broken_reason = p_reason
  WHERE id = p_match_id
    AND (auth.uid() = user_a_id OR auth.uid() = user_b_id)
    AND state NOT IN ('broken', 'completed');
END;
$$;


-- ============================================================
-- 7. COMPLETE MATCH
-- ============================================================
CREATE OR REPLACE FUNCTION public.complete_match(
  p_match_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE matches 
  SET state = 'completed'
  WHERE id = p_match_id
    AND (auth.uid() = user_a_id OR auth.uid() = user_b_id)
    AND state = 'active';
END;
$$;


-- ============================================================
-- 8. ADD PRIORITY COLUMN TO MATCHING_QUEUE (if not exists)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'matching_queue' AND column_name = 'priority'
  ) THEN
    ALTER TABLE matching_queue ADD COLUMN priority INTEGER DEFAULT 1;
  END IF;
END $$;


-- ============================================================
-- 9. GRANT PERMISSIONS
-- ============================================================
GRANT SELECT, UPDATE ON public.matches TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_heartbeat(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_match_ready(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.requeue_after_break(INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.break_match(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_match(UUID) TO authenticated;
