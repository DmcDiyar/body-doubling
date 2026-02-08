-- ============================================================
-- SESSIZ ORTAK - QUEST FOMO SYSTEM
-- Version: 1.0.0
-- Date: 2026-02-08
-- ============================================================
-- Extends quest JSONB with: revealed, locked_until, missed_at, fomo
-- Modifies: update_daily_quest, update_weekly_quest
-- New: reveal_quest, get_fomo_messages
-- ============================================================


-- ============================================================
-- 1. FOMO MESSAGE CATALOG (used by get_fomo_messages)
-- ============================================================
-- Messages are selected based on missed quest context.
-- No separate table — embedded in the function logic.


-- ============================================================
-- 2. REVEAL QUEST
-- ============================================================
-- User commits to seeing the quest details. Irreversible.
CREATE OR REPLACE FUNCTION public.reveal_quest(
  p_user_id UUID,
  p_quest_type TEXT  -- 'daily' or 'weekly'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_metadata JSONB;
  v_quest JSONB;
BEGIN
  SELECT metadata INTO v_metadata FROM users WHERE id = p_user_id FOR UPDATE;

  IF v_metadata IS NULL OR v_metadata->'quests' IS NULL THEN
    RETURN jsonb_build_object('error', 'no_quests');
  END IF;

  v_quest := v_metadata->'quests'->p_quest_type;
  IF v_quest IS NULL THEN
    RETURN jsonb_build_object('error', 'quest_not_found');
  END IF;

  -- Already revealed?
  IF COALESCE((v_quest->>'revealed')::BOOL, true) THEN
    RETURN jsonb_build_object('already_revealed', true, 'quest_id', v_quest->>'id');
  END IF;

  -- Check if locked
  IF v_quest->>'locked_until' IS NOT NULL
     AND (v_quest->>'locked_until')::TIMESTAMPTZ > NOW() THEN
    RETURN jsonb_build_object('error', 'quest_locked', 'locked_until', v_quest->>'locked_until');
  END IF;

  -- Reveal it
  v_quest := v_quest || jsonb_build_object('revealed', true);
  v_metadata := jsonb_set(v_metadata, ARRAY['quests', p_quest_type], v_quest);
  UPDATE users SET metadata = v_metadata WHERE id = p_user_id;

  RETURN jsonb_build_object('revealed', true, 'quest_id', v_quest->>'id');
END;
$$;


-- ============================================================
-- 3. ENHANCED UPDATE_DAILY_QUEST (with FOMO tracking)
-- ============================================================
-- Replaces the original. On day reset:
--   1. If previous quest was NOT completed → add to fomo.missed_quests
--   2. Set locked_until = NOW() + 48 hours for the missed quest
--   3. New quest starts with revealed = false
CREATE OR REPLACE FUNCTION public.update_daily_quest(
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
  v_day_index INT;
  v_result JSONB := '{"completed": false}'::JSONB;
  v_daily_quests TEXT[] := ARRAY['daily_ritual_1', 'daily_pomodoro_25', 'daily_cooldown'];
  v_daily_targets INT[] := ARRAY[1, 2, 1];
  v_matches BOOL := false;
  v_fomo JSONB;
  v_missed_quests JSONB;
  v_fomo_teasers TEXT[] := ARRAY[
    'Dün bunu yapanlar bugün farklı bir şey gördü',
    'Bir pencere kapandı',
    'Kaçırdığın anlar geri gelmiyor',
    'Dünkü fırsat sessizce geçti',
    'Bazı şeyler tekrar gelmez'
  ];
BEGIN
  PERFORM init_user_quests(p_user_id);

  SELECT metadata INTO v_metadata FROM users WHERE id = p_user_id FOR UPDATE;
  v_quest := v_metadata->'quests'->'daily';

  -- Check day reset
  IF (v_quest->>'last_reset')::DATE < CURRENT_DATE THEN
    -- FOMO: Was previous quest NOT completed?
    v_completed := COALESCE((v_quest->>'completed')::BOOL, false);
    IF NOT v_completed THEN
      -- Track missed quest in fomo
      v_fomo := COALESCE(v_metadata->'quests'->'fomo', jsonb_build_object(
        'missed_quests', '[]'::JSONB, 'last_fomo_shown', NULL
      ));
      v_missed_quests := COALESCE(v_fomo->'missed_quests', '[]'::JSONB);

      -- Add missed quest entry
      v_missed_quests := v_missed_quests || jsonb_build_array(jsonb_build_object(
        'quest_id', v_quest->>'id',
        'missed_at', CURRENT_DATE::TEXT,
        'teaser', v_fomo_teasers[1 + (FLOOR(RANDOM() * array_length(v_fomo_teasers, 1)))::INT]
      ));

      -- Cap at 5 entries (prune oldest)
      IF jsonb_array_length(v_missed_quests) > 5 THEN
        v_missed_quests := (
          SELECT jsonb_agg(elem)
          FROM (
            SELECT elem
            FROM jsonb_array_elements(v_missed_quests) AS elem
            ORDER BY elem->>'missed_at' DESC
            LIMIT 5
          ) sub
        );
      END IF;

      v_fomo := jsonb_set(v_fomo, '{missed_quests}', v_missed_quests);
      v_metadata := jsonb_set(v_metadata, '{quests,fomo}', v_fomo);
    END IF;

    -- Rotate to next quest
    v_day_index := ((COALESCE((v_quest->>'day_index')::INT, 0)) + 1) % 3;
    v_quest := jsonb_build_object(
      'id', v_daily_quests[v_day_index + 1],
      'progress', 0,
      'target', v_daily_targets[v_day_index + 1],
      'completed', false,
      'day_index', v_day_index,
      'last_reset', CURRENT_DATE::TEXT,
      'revealed', false,
      'locked_until', NULL,
      'missed_at', NULL
    );
  END IF;

  v_quest_id := v_quest->>'id';
  v_progress := (v_quest->>'progress')::INT;
  v_target := (v_quest->>'target')::INT;
  v_completed := COALESCE((v_quest->>'completed')::BOOL, false);

  IF v_completed THEN
    RETURN v_result;
  END IF;

  -- Check if locked
  IF v_quest->>'locked_until' IS NOT NULL
     AND (v_quest->>'locked_until')::TIMESTAMPTZ > NOW() THEN
    RETURN jsonb_build_object('completed', false, 'locked', true, 'locked_until', v_quest->>'locked_until');
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
        'reward_xp', 5,
        'reward_hidden', NOT COALESCE((v_quest->>'revealed')::BOOL, true)
      );
      UPDATE users SET xp = xp + 5 WHERE id = p_user_id;
    END IF;
  END IF;

  v_metadata := jsonb_set(v_metadata, '{quests,daily}', v_quest);
  UPDATE users SET metadata = v_metadata WHERE id = p_user_id;

  RETURN v_result;
END;
$$;


-- ============================================================
-- 4. ENHANCED UPDATE_WEEKLY_QUEST (with FOMO tracking)
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
  v_fomo JSONB;
  v_missed_quests JSONB;
BEGIN
  SELECT metadata INTO v_metadata FROM users WHERE id = p_user_id FOR UPDATE;
  v_quest := v_metadata->'quests'->'weekly';

  -- Check week change
  IF (v_quest->>'week_start')::DATE < v_current_week THEN
    v_completed := COALESCE((v_quest->>'completed')::BOOL, false);

    IF v_completed THEN
      v_week_index := ((COALESCE((v_quest->>'week_index')::INT, 0)) + 1) % 3;
      v_quest := jsonb_build_object(
        'id', v_weekly_quests[v_week_index + 1],
        'progress', 0,
        'target', v_weekly_targets[v_week_index + 1],
        'completed', false,
        'week_index', v_week_index,
        'week_start', v_current_week::TEXT,
        'revealed', false,
        'locked_until', NULL,
        'missed_at', NULL
      );
    ELSE
      -- FOMO: Track missed weekly quest
      v_fomo := COALESCE(v_metadata->'quests'->'fomo', jsonb_build_object(
        'missed_quests', '[]'::JSONB, 'last_fomo_shown', NULL
      ));
      v_missed_quests := COALESCE(v_fomo->'missed_quests', '[]'::JSONB);

      v_missed_quests := v_missed_quests || jsonb_build_array(jsonb_build_object(
        'quest_id', v_quest->>'id',
        'missed_at', CURRENT_DATE::TEXT,
        'teaser', 'Bu hafta bir şey kaçırdın'
      ));

      IF jsonb_array_length(v_missed_quests) > 5 THEN
        v_missed_quests := (
          SELECT jsonb_agg(elem)
          FROM (SELECT elem FROM jsonb_array_elements(v_missed_quests) AS elem
                ORDER BY elem->>'missed_at' DESC LIMIT 5) sub
        );
      END IF;

      v_fomo := jsonb_set(v_fomo, '{missed_quests}', v_missed_quests);
      v_metadata := jsonb_set(v_metadata, '{quests,fomo}', v_fomo);

      -- Keep progress, update week_start, set as new unrevealed
      v_quest := v_quest || jsonb_build_object(
        'week_start', v_current_week::TEXT,
        'revealed', false
      );
    END IF;
  END IF;

  v_quest_id := v_quest->>'id';
  v_progress := (v_quest->>'progress')::INT;
  v_target := (v_quest->>'target')::INT;
  v_completed := COALESCE((v_quest->>'completed')::BOOL, false);

  IF v_completed THEN RETURN v_result; END IF;

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
      'reward_trust', 1,
      'reward_hidden', NOT COALESCE((v_quest->>'revealed')::BOOL, true)
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
-- 5. GET FOMO MESSAGES
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_fomo_messages(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_metadata JSONB;
  v_fomo JSONB;
  v_missed JSONB;
  v_message TEXT := NULL;
  v_last_shown TEXT;
BEGIN
  SELECT metadata INTO v_metadata FROM users WHERE id = p_user_id;
  v_fomo := v_metadata->'quests'->'fomo';

  IF v_fomo IS NULL THEN
    RETURN jsonb_build_object('has_message', false);
  END IF;

  v_missed := v_fomo->'missed_quests';
  v_last_shown := v_fomo->>'last_fomo_shown';

  -- Only show if there are recent missed quests (within 7 days)
  IF v_missed IS NULL OR jsonb_array_length(v_missed) = 0 THEN
    RETURN jsonb_build_object('has_message', false);
  END IF;

  -- Rate limit: max 1 FOMO message per 12 hours
  IF v_last_shown IS NOT NULL AND (v_last_shown::TIMESTAMPTZ + INTERVAL '12 hours') > NOW() THEN
    RETURN jsonb_build_object('has_message', false);
  END IF;

  -- Get most recent missed quest teaser
  v_message := v_missed->-1->>'teaser';

  IF v_message IS NOT NULL THEN
    -- Update last_fomo_shown
    v_fomo := v_fomo || jsonb_build_object('last_fomo_shown', NOW()::TEXT);
    v_metadata := jsonb_set(v_metadata, '{quests,fomo}', v_fomo);
    UPDATE users SET metadata = v_metadata WHERE id = p_user_id;

    RETURN jsonb_build_object(
      'has_message', true,
      'message', v_message,
      'missed_count', jsonb_array_length(v_missed)
    );
  END IF;

  RETURN jsonb_build_object('has_message', false);
END;
$$;


-- ============================================================
-- 6. GRANT PERMISSIONS
-- ============================================================
GRANT EXECUTE ON FUNCTION public.reveal_quest(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_fomo_messages(UUID) TO authenticated;
