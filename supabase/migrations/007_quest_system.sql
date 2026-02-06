-- ============================================================
-- SESSIZ ORTAK - QUEST SYSTEM (MVP 1.5)
-- Version: 1.0.0
-- Date: 2026-02-06
-- ============================================================
-- NO SCHEMA CHANGES - All data in users.metadata JSONB
-- ============================================================


-- ============================================================
-- 1. DAILY QUEST CATALOG
-- ============================================================
-- Cycle: daily_ritual_1 → daily_pomodoro_25 → daily_cooldown → repeat


-- ============================================================
-- 2. INITIALIZE USER QUESTS (call on first session)
-- ============================================================
CREATE OR REPLACE FUNCTION public.init_user_quests(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_metadata JSONB;
  v_current_date DATE := CURRENT_DATE;
  v_week_start DATE := date_trunc('week', CURRENT_DATE)::DATE;
BEGIN
  SELECT metadata INTO v_metadata FROM users WHERE id = p_user_id;
  
  IF v_metadata IS NULL OR v_metadata->'quests' IS NULL THEN
    v_metadata := COALESCE(v_metadata, '{}'::JSONB) || jsonb_build_object(
      'quests', jsonb_build_object(
        'daily', jsonb_build_object(
          'id', 'daily_ritual_1',
          'progress', 0,
          'target', 1,
          'completed', false,
          'day_index', 0,
          'last_reset', v_current_date::TEXT
        ),
        'weekly', jsonb_build_object(
          'id', 'weekly_streak_3',
          'progress', 0,
          'target', 3,
          'completed', false,
          'week_index', 0,
          'week_start', v_week_start::TEXT
        ),
        'hidden_completed', '[]'::JSONB
      )
    );
    
    UPDATE users SET metadata = v_metadata WHERE id = p_user_id;
  END IF;
END;
$$;


-- ============================================================
-- 3. UPDATE DAILY QUEST
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_daily_quest(
  p_user_id UUID,
  p_session_metadata JSONB
)
RETURNS JSONB -- { completed: bool, quest_id: string, reward_xp: int }
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_metadata JSONB;
  v_quest JSONB;
  v_quest_id TEXT;
  v_progress INT;
  v_target INT;
  v_completed BOOL;
  v_day_index INT;
  v_result JSONB := '{"completed": false}'::JSONB;
  v_daily_quests TEXT[] := ARRAY['daily_ritual_1', 'daily_pomodoro_25', 'daily_cooldown'];
  v_daily_targets INT[] := ARRAY[1, 2, 1];
  v_matches BOOL := false;
BEGIN
  -- Ensure quests initialized
  PERFORM init_user_quests(p_user_id);
  
  -- Get current metadata
  SELECT metadata INTO v_metadata FROM users WHERE id = p_user_id FOR UPDATE;
  v_quest := v_metadata->'quests'->'daily';
  
  -- Check day reset
  IF (v_quest->>'last_reset')::DATE < CURRENT_DATE THEN
    v_day_index := ((v_quest->>'day_index')::INT + 1) % 3;
    v_quest := jsonb_build_object(
      'id', v_daily_quests[v_day_index + 1],
      'progress', 0,
      'target', v_daily_targets[v_day_index + 1],
      'completed', false,
      'day_index', v_day_index,
      'last_reset', CURRENT_DATE::TEXT
    );
  END IF;
  
  v_quest_id := v_quest->>'id';
  v_progress := (v_quest->>'progress')::INT;
  v_target := (v_quest->>'target')::INT;
  v_completed := (v_quest->>'completed')::BOOL;
  
  -- Already completed today
  IF v_completed THEN
    RETURN v_result;
  END IF;
  
  -- Check quest conditions
  CASE v_quest_id
    WHEN 'daily_ritual_1' THEN
      v_matches := COALESCE((p_session_metadata->'ritual'->>'completed')::BOOL, false);
    WHEN 'daily_pomodoro_25' THEN
      v_matches := COALESCE((p_session_metadata->'pomodoro'->>'minutes')::INT, 0) >= 25;
    WHEN 'daily_cooldown' THEN
      v_matches := COALESCE((p_session_metadata->'cooldown'->>'completed')::BOOL, false);
  END CASE;
  
  IF v_matches THEN
    v_progress := v_progress + 1;
    v_quest := v_quest || jsonb_build_object('progress', v_progress);
    
    IF v_progress >= v_target THEN
      v_quest := v_quest || jsonb_build_object('completed', true);
      v_result := jsonb_build_object(
        'completed', true,
        'quest_id', v_quest_id,
        'reward_xp', 5
      );
      
      -- Award XP
      UPDATE users SET xp = xp + 5 WHERE id = p_user_id;
    END IF;
  END IF;
  
  -- Save quest state
  v_metadata := jsonb_set(v_metadata, '{quests,daily}', v_quest);
  UPDATE users SET metadata = v_metadata WHERE id = p_user_id;
  
  RETURN v_result;
END;
$$;


-- ============================================================
-- 4. UPDATE WEEKLY QUEST
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_weekly_quest(
  p_user_id UUID,
  p_session_metadata JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_metadata JSONB;
  v_quest JSONB;
  v_quest_id TEXT;
  v_progress INT;
  v_target INT;
  v_completed BOOL;
  v_week_index INT;
  v_result JSONB := '{"completed": false}'::JSONB;
  v_weekly_quests TEXT[] := ARRAY['weekly_streak_3', 'weekly_sessions_5', 'weekly_duration_mix'];
  v_weekly_targets INT[] := ARRAY[3, 5, 2];
  v_current_week DATE := date_trunc('week', CURRENT_DATE)::DATE;
  v_user_streak INT;
BEGIN
  SELECT metadata INTO v_metadata FROM users WHERE id = p_user_id FOR UPDATE;
  v_quest := v_metadata->'quests'->'weekly';
  
  -- Check week change
  IF (v_quest->>'week_start')::DATE < v_current_week THEN
    IF (v_quest->>'completed')::BOOL THEN
      -- Rotate to next quest
      v_week_index := ((v_quest->>'week_index')::INT + 1) % 3;
      v_quest := jsonb_build_object(
        'id', v_weekly_quests[v_week_index + 1],
        'progress', 0,
        'target', v_weekly_targets[v_week_index + 1],
        'completed', false,
        'week_index', v_week_index,
        'week_start', v_current_week::TEXT
      );
    ELSE
      -- Keep progress, update week_start
      v_quest := v_quest || jsonb_build_object('week_start', v_current_week::TEXT);
    END IF;
  END IF;
  
  v_quest_id := v_quest->>'id';
  v_progress := (v_quest->>'progress')::INT;
  v_target := (v_quest->>'target')::INT;
  v_completed := (v_quest->>'completed')::BOOL;
  
  IF v_completed THEN RETURN v_result; END IF;
  
  -- Check quest conditions
  CASE v_quest_id
    WHEN 'weekly_streak_3' THEN
      SELECT streak INTO v_user_streak FROM users WHERE id = p_user_id;
      IF v_user_streak > v_progress THEN
        v_progress := LEAST(v_user_streak, v_target);
      END IF;
    WHEN 'weekly_sessions_5' THEN
      v_progress := v_progress + 1;
    WHEN 'weekly_duration_mix' THEN
      v_progress := LEAST(v_progress + 1, v_target);
  END CASE;
  
  v_quest := v_quest || jsonb_build_object('progress', v_progress);
  
  IF v_progress >= v_target AND NOT v_completed THEN
    v_quest := v_quest || jsonb_build_object('completed', true);
    v_result := jsonb_build_object(
      'completed', true,
      'quest_id', v_quest_id,
      'reward_xp', 15,
      'reward_trust', 1
    );
    UPDATE users SET xp = xp + 15 WHERE id = p_user_id;
    PERFORM update_trust_score(p_user_id, NULL, 'quest_weekly', 1);
  END IF;
  
  v_metadata := jsonb_set(v_metadata, '{quests,weekly}', v_quest);
  UPDATE users SET metadata = v_metadata WHERE id = p_user_id;
  
  RETURN v_result;
END;
$$;


-- ============================================================
-- 5. CHECK HIDDEN QUESTS
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_hidden_quests(
  p_user_id UUID,
  p_session_metadata JSONB
)
RETURNS TEXT[] -- Array of unlocked hidden quest IDs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_metadata JSONB;
  v_completed JSONB;
  v_unlocked TEXT[] := ARRAY[]::TEXT[];
  v_last_session_date DATE;
  v_session_hour INT;
  v_pomodoro_minutes INT;
  v_ritual_completed BOOL;
  v_cooldown_completed BOOL;
BEGIN
  SELECT metadata, last_session_date 
  INTO v_metadata, v_last_session_date
  FROM users WHERE id = p_user_id FOR UPDATE;
  
  v_completed := COALESCE(v_metadata->'quests'->'hidden_completed', '[]'::JSONB);
  
  -- Extract session data
  v_pomodoro_minutes := COALESCE((p_session_metadata->'pomodoro'->>'minutes')::INT, 25);
  v_ritual_completed := COALESCE((p_session_metadata->'ritual'->>'completed')::BOOL, false);
  v_cooldown_completed := COALESCE((p_session_metadata->'cooldown'->>'completed')::BOOL, false);
  v_session_hour := EXTRACT(HOUR FROM NOW());
  
  -- hidden_first_ritual
  IF v_ritual_completed AND NOT v_completed ? 'hidden_first_ritual' THEN
    v_unlocked := array_append(v_unlocked, 'hidden_first_ritual');
  END IF;
  
  -- hidden_first_50
  IF v_pomodoro_minutes >= 50 AND NOT v_completed ? 'hidden_first_50' THEN
    v_unlocked := array_append(v_unlocked, 'hidden_first_50');
  END IF;
  
  -- hidden_first_90
  IF v_pomodoro_minutes >= 90 AND NOT v_completed ? 'hidden_first_90' THEN
    v_unlocked := array_append(v_unlocked, 'hidden_first_90');
  END IF;
  
  -- hidden_no_skip_day
  IF v_ritual_completed AND v_cooldown_completed AND NOT v_completed ? 'hidden_no_skip_day' THEN
    v_unlocked := array_append(v_unlocked, 'hidden_no_skip_day');
  END IF;
  
  -- hidden_late_night
  IF v_session_hour >= 23 AND NOT v_completed ? 'hidden_late_night' THEN
    v_unlocked := array_append(v_unlocked, 'hidden_late_night');
  END IF;
  
  -- hidden_comeback (48h inactivity)
  IF v_last_session_date IS NOT NULL 
     AND v_last_session_date < CURRENT_DATE - INTERVAL '2 days' 
     AND NOT v_completed ? 'hidden_comeback' THEN
    v_unlocked := array_append(v_unlocked, 'hidden_comeback');
  END IF;
  
  -- Award rewards for each unlocked
  IF array_length(v_unlocked, 1) > 0 THEN
    FOR i IN 1..array_length(v_unlocked, 1) LOOP
      v_completed := v_completed || to_jsonb(v_unlocked[i]);
      UPDATE users SET xp = xp + 10 WHERE id = p_user_id;
      PERFORM update_trust_score(p_user_id, NULL, 'quest_hidden', 1);
    END LOOP;
    
    -- Save
    v_metadata := jsonb_set(v_metadata, '{quests,hidden_completed}', v_completed);
    UPDATE users SET metadata = v_metadata WHERE id = p_user_id;
  END IF;
  
  RETURN v_unlocked;
END;
$$;


-- ============================================================
-- 6. MASTER QUEST PROCESSOR (call after session complete)
-- ============================================================
CREATE OR REPLACE FUNCTION public.process_session_quests(
  p_user_id UUID,
  p_session_id UUID
)
RETURNS JSONB -- { daily: {...}, weekly: {...}, hidden_unlocked: [...] }
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_metadata JSONB;
  v_daily_result JSONB;
  v_weekly_result JSONB;
  v_hidden_unlocked TEXT[];
BEGIN
  -- Get session participant metadata
  SELECT metadata INTO v_session_metadata
  FROM session_participants
  WHERE session_id = p_session_id AND user_id = p_user_id;
  
  IF v_session_metadata IS NULL THEN
    v_session_metadata := '{}'::JSONB;
  END IF;
  
  -- Process quests
  v_daily_result := update_daily_quest(p_user_id, v_session_metadata);
  v_weekly_result := update_weekly_quest(p_user_id, v_session_metadata);
  v_hidden_unlocked := check_hidden_quests(p_user_id, v_session_metadata);
  
  RETURN jsonb_build_object(
    'daily', v_daily_result,
    'weekly', v_weekly_result,
    'hidden_unlocked', to_jsonb(v_hidden_unlocked)
  );
END;
$$;


-- ============================================================
-- 7. ADD quest_hidden AND quest_weekly TO EVENT TYPES
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
  'quest_hidden'
));


-- ============================================================
-- 8. GRANT PERMISSIONS
-- ============================================================
GRANT EXECUTE ON FUNCTION public.init_user_quests(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_daily_quest(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_weekly_quest(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_hidden_quests(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_session_quests(UUID, UUID) TO authenticated;
