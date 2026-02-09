-- ============================================================
-- 014: Quest FOMO System
-- Mystery quests, reveal mechanic, missed quest tracking, FOMO messages
-- ============================================================

-- Reveal a quest (irreversible)
CREATE OR REPLACE FUNCTION reveal_quest(
  p_user_id UUID,
  p_quest_type TEXT -- 'daily' or 'weekly'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meta JSONB;
  v_quests JSONB;
  v_quest JSONB;
BEGIN
  SELECT metadata INTO v_meta FROM users WHERE id = p_user_id;
  IF v_meta IS NULL THEN RETURN FALSE; END IF;

  v_quests := COALESCE(v_meta->'quests', '{}'::JSONB);
  v_quest := v_quests->p_quest_type;

  IF v_quest IS NULL THEN RETURN FALSE; END IF;

  -- Already revealed?
  IF COALESCE((v_quest->>'revealed')::BOOLEAN, TRUE) THEN
    RETURN TRUE;
  END IF;

  -- Mark as revealed (irreversible)
  v_quest := v_quest || '{"revealed": true}'::JSONB;
  v_quests := v_quests || jsonb_build_object(p_quest_type, v_quest);
  v_meta := v_meta || jsonb_build_object('quests', v_quests);

  UPDATE users SET metadata = v_meta WHERE id = p_user_id;

  RETURN TRUE;
END;
$$;

-- Enhanced update_daily_quest: tracks FOMO state
CREATE OR REPLACE FUNCTION update_daily_quest_fomo(
  p_user_id UUID,
  p_quest_id TEXT,
  p_target INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meta JSONB;
  v_quests JSONB;
  v_old_daily JSONB;
  v_fomo JSONB;
  v_missed JSONB;
  v_today INT;
BEGIN
  SELECT metadata INTO v_meta FROM users WHERE id = p_user_id;
  IF v_meta IS NULL THEN v_meta := '{}'::JSONB; END IF;

  v_quests := COALESCE(v_meta->'quests', '{}'::JSONB);
  v_old_daily := v_quests->'daily';
  v_fomo := COALESCE(v_meta->'fomo', '{}'::JSONB);
  v_missed := COALESCE(v_fomo->'missed_quests', '[]'::JSONB);
  v_today := EXTRACT(DOY FROM NOW())::INT;

  -- Check if old daily quest was missed (not completed, different day)
  IF v_old_daily IS NOT NULL
     AND NOT COALESCE((v_old_daily->>'completed')::BOOLEAN, FALSE)
     AND COALESCE((v_old_daily->>'day_index')::INT, v_today) != v_today
  THEN
    -- Add to missed list (max 5)
    v_missed := v_missed || jsonb_build_array(jsonb_build_object(
      'id', v_old_daily->>'id',
      'missed_at', NOW()::TEXT,
      'type', 'daily'
    ));
    -- Trim to max 5
    IF jsonb_array_length(v_missed) > 5 THEN
      v_missed := (SELECT jsonb_agg(elem) FROM (
        SELECT elem FROM jsonb_array_elements(v_missed) AS elem
        ORDER BY elem->>'missed_at' DESC LIMIT 5
      ) sub);
    END IF;
  END IF;

  -- Create new quest with revealed: false (mystery mode)
  v_quests := v_quests || jsonb_build_object('daily', jsonb_build_object(
    'id', p_quest_id,
    'progress', 0,
    'target', p_target,
    'completed', FALSE,
    'revealed', FALSE,
    'day_index', v_today,
    'last_reset', NOW()::TEXT
  ));

  -- Update FOMO data
  v_fomo := v_fomo || jsonb_build_object('missed_quests', v_missed);
  v_meta := v_meta || jsonb_build_object('quests', v_quests, 'fomo', v_fomo);

  UPDATE users SET metadata = v_meta WHERE id = p_user_id;

  RETURN v_quests->'daily';
END;
$$;

-- Get FOMO messages with 12h rate limiting
CREATE OR REPLACE FUNCTION get_fomo_messages(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meta JSONB;
  v_fomo JSONB;
  v_missed JSONB;
  v_last_shown TIMESTAMPTZ;
  v_messages TEXT[] := ARRAY[
    'Dün bunu yapanlar bugün farklı bir şey gördü.',
    'Bir pencere kapandı. Ama yenisi açılabilir.',
    'Kaçırdığın görev hala bir yerlerde bekliyor.',
    'Dünkü görev artık geçmişte kaldı.',
    'Görevini tamamlayanlar bir adım önde.'
  ];
  v_message TEXT;
  v_count INT;
BEGIN
  SELECT metadata INTO v_meta FROM users WHERE id = p_user_id;
  IF v_meta IS NULL THEN RETURN NULL; END IF;

  v_fomo := COALESCE(v_meta->'fomo', '{}'::JSONB);
  v_missed := COALESCE(v_fomo->'missed_quests', '[]'::JSONB);
  v_count := jsonb_array_length(v_missed);

  IF v_count = 0 THEN RETURN NULL; END IF;

  -- Rate limit: max 1 per 12 hours
  v_last_shown := (v_fomo->>'last_message_at')::TIMESTAMPTZ;
  IF v_last_shown IS NOT NULL AND v_last_shown > NOW() - INTERVAL '12 hours' THEN
    RETURN NULL;
  END IF;

  -- Pick a random message
  v_message := v_messages[1 + floor(random() * array_length(v_messages, 1))::INT];

  -- Update last shown time
  v_fomo := v_fomo || jsonb_build_object('last_message_at', NOW()::TEXT);
  v_meta := v_meta || jsonb_build_object('fomo', v_fomo);
  UPDATE users SET metadata = v_meta WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'message', v_message,
    'missed_count', v_count
  );
END;
$$;
