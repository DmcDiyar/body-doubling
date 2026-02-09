-- ============================================================
-- 013: A/B Testing Infrastructure
-- Deterministic hash-based experiment assignment
-- Stored in users.metadata.experiments JSONB
-- ============================================================

-- Assign a user to an experiment variant (idempotent)
CREATE OR REPLACE FUNCTION assign_experiment(
  p_user_id UUID,
  p_experiment_id TEXT,
  p_variants TEXT[] DEFAULT ARRAY['control', 'treatment'],
  p_weights FLOAT[] DEFAULT ARRAY[0.5, 0.5]
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meta JSONB;
  v_experiments JSONB;
  v_existing TEXT;
  v_hash_hex TEXT;
  v_hash_int BIGINT;
  v_rand FLOAT;
  v_cumulative FLOAT := 0;
  v_variant TEXT;
  i INT;
BEGIN
  -- Get current metadata
  SELECT metadata INTO v_meta FROM users WHERE id = p_user_id;
  IF v_meta IS NULL THEN v_meta := '{}'::JSONB; END IF;

  v_experiments := COALESCE(v_meta->'experiments', '{}'::JSONB);

  -- Check if already assigned
  v_existing := v_experiments->>p_experiment_id;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  -- Deterministic hash: MD5(user_id + experiment_id) → 0..1 float
  v_hash_hex := MD5(p_user_id::TEXT || p_experiment_id);
  v_hash_int := ('x' || SUBSTRING(v_hash_hex FROM 1 FOR 8))::BIT(32)::BIGINT;
  v_rand := ABS(v_hash_int)::FLOAT / 2147483647.0;

  -- Select variant based on weights
  v_variant := p_variants[array_length(p_variants, 1)]; -- default to last
  FOR i IN 1..array_length(p_variants, 1) LOOP
    v_cumulative := v_cumulative + p_weights[i];
    IF v_rand <= v_cumulative THEN
      v_variant := p_variants[i];
      EXIT;
    END IF;
  END LOOP;

  -- Store assignment
  v_experiments := v_experiments || jsonb_build_object(p_experiment_id, v_variant);
  v_meta := v_meta || jsonb_build_object('experiments', v_experiments);

  UPDATE users SET metadata = v_meta WHERE id = p_user_id;

  RETURN v_variant;
END;
$$;

-- Get all experiment assignments for a user
CREATE OR REPLACE FUNCTION get_experiment_assignments(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_experiments JSONB;
BEGIN
  SELECT COALESCE(metadata->'experiments', '{}'::JSONB)
  INTO v_experiments
  FROM users
  WHERE id = p_user_id;

  RETURN COALESCE(v_experiments, '{}'::JSONB);
END;
$$;
