-- ============================================================
-- SESSIZ ORTAK - A/B TESTING INFRASTRUCTURE
-- Version: 1.0.0
-- Date: 2026-02-08
-- ============================================================
-- NO SCHEMA CHANGES - All data in users.metadata.experiments JSONB
-- ============================================================


-- ============================================================
-- 1. ASSIGN EXPERIMENT VARIANT
-- ============================================================
-- Deterministic assignment: same user+experiment always gets same variant.
-- Uses MD5 hash of (user_id || experiment_id) for reproducibility.
-- If already assigned, returns existing variant (idempotent).
CREATE OR REPLACE FUNCTION public.assign_experiment(
  p_user_id UUID,
  p_experiment_id TEXT,
  p_variants TEXT[],
  p_weights FLOAT[] DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_metadata JSONB;
  v_experiments JSONB;
  v_existing JSONB;
  v_variant TEXT;
  v_hash_hex TEXT;
  v_hash_int BIGINT;
  v_total_weight FLOAT := 0;
  v_cumulative FLOAT := 0;
  v_rand FLOAT;
  v_num_variants INT;
BEGIN
  -- Get current metadata
  SELECT metadata INTO v_metadata FROM users WHERE id = p_user_id FOR UPDATE;
  v_metadata := COALESCE(v_metadata, '{}'::JSONB);
  v_experiments := COALESCE(v_metadata->'experiments', '{}'::JSONB);

  -- Check if already assigned
  v_existing := v_experiments->p_experiment_id;
  IF v_existing IS NOT NULL AND v_existing->>'variant' IS NOT NULL THEN
    RETURN v_existing->>'variant';
  END IF;

  -- Validate variants array
  v_num_variants := array_length(p_variants, 1);
  IF v_num_variants IS NULL OR v_num_variants < 2 THEN
    RAISE EXCEPTION 'At least 2 variants required';
  END IF;

  -- Deterministic hash: MD5(user_id || experiment_id) → float 0..1
  v_hash_hex := MD5(p_user_id::TEXT || p_experiment_id);
  -- Take first 8 hex chars → int → normalize to 0..1
  v_hash_int := ('x' || SUBSTRING(v_hash_hex FROM 1 FOR 8))::BIT(32)::BIGINT;
  v_rand := ABS(v_hash_int)::FLOAT / 2147483647.0;

  -- Use weights if provided, else equal distribution
  IF p_weights IS NOT NULL AND array_length(p_weights, 1) = v_num_variants THEN
    -- Weighted selection
    FOR i IN 1..v_num_variants LOOP
      v_total_weight := v_total_weight + p_weights[i];
    END LOOP;

    FOR i IN 1..v_num_variants LOOP
      v_cumulative := v_cumulative + (p_weights[i] / v_total_weight);
      IF v_rand <= v_cumulative THEN
        v_variant := p_variants[i];
        EXIT;
      END IF;
    END LOOP;

    -- Fallback to last variant (floating point edge case)
    IF v_variant IS NULL THEN
      v_variant := p_variants[v_num_variants];
    END IF;
  ELSE
    -- Equal weight selection
    v_variant := p_variants[1 + FLOOR(v_rand * v_num_variants)::INT];
    -- Safety clamp
    IF v_variant IS NULL THEN
      v_variant := p_variants[v_num_variants];
    END IF;
  END IF;

  -- Write assignment
  v_experiments := v_experiments || jsonb_build_object(
    p_experiment_id, jsonb_build_object(
      'variant', v_variant,
      'assigned_at', NOW()::TEXT
    )
  );

  v_metadata := jsonb_set(v_metadata, '{experiments}', v_experiments);
  UPDATE users SET metadata = v_metadata WHERE id = p_user_id;

  RETURN v_variant;
END;
$$;


-- ============================================================
-- 2. GET ALL EXPERIMENT ASSIGNMENTS (for analytics injection)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_experiment_assignments(p_user_id UUID)
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


-- ============================================================
-- 3. GRANT PERMISSIONS
-- ============================================================
GRANT EXECUTE ON FUNCTION public.assign_experiment(UUID, TEXT, TEXT[], FLOAT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_experiment_assignments(UUID) TO authenticated;
