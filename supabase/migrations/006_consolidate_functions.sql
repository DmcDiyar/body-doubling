  -- ============================================================
  -- SESSIZ ORTAK - 006: FUNCTION CONSOLIDATION
  -- Version: 1.3.0
  -- Date: 2026-02-06
  -- ============================================================
  -- Prerequisites: 001, 002, 003, 004, 005 must be applied first
  -- ============================================================
  -- Fixes:
  --   1. Drop orphaned handle_early_exit(UUID, UUID) from 001
  --      (005 created the correct 4-param version, 001's 2-param is dead code)
  --   2. Drop trigger_session_completion from 005
  --      (complete_session already awards trust → trigger causes DOUBLE trust)
  --   3. Recreate complete_session:
  --      a. Sets session.status = 'completed' when all participants done
  --      b. Idempotent (won't double-award if called twice)
  --      c. Row lock prevents race condition in duo mode
  --      d. Consistent level formula (1 + xp/500)
  -- ============================================================


  -- ============================================================
  -- 1. DROP orphaned handle_early_exit(UUID, UUID)
  -- ============================================================
  -- 001 created: handle_early_exit(UUID, UUID) → 2 params, calculates minutes internally
  -- 005 created: handle_early_exit(UUID, UUID, INTEGER, INTEGER) → 4 params
  -- PostgreSQL allows overloading, so BOTH exist. Frontend uses 4-param.
  -- Drop the 2-param dead code.
  DROP FUNCTION IF EXISTS public.handle_early_exit(UUID, UUID);


  -- ============================================================
  -- 2. DROP trigger_session_completion (double-trust prevention)
  -- ============================================================
  -- 005's trigger: fires on session.status → 'completed', awards +2 trust
  -- complete_session(): also awards +2 trust inside its body
  -- Both run = user gets +4 trust instead of +2. Fix: remove trigger.
  DROP TRIGGER IF EXISTS on_session_status_change ON public.sessions;
  DROP FUNCTION IF EXISTS public.trigger_session_completion();


  -- ============================================================
  -- 3. RECREATE complete_session
  -- ============================================================
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
    v_remaining INTEGER;
  BEGIN
    -- Session bilgisini al
    SELECT * INTO v_session FROM public.sessions WHERE id = p_session_id;

    IF v_session IS NULL THEN
      RAISE EXCEPTION 'Session not found';
    END IF;

    -- Idempotent: zaten completed ise tekrar işleme (timer çift çağırabilir)
    IF EXISTS (
      SELECT 1 FROM public.session_participants
      WHERE session_id = p_session_id AND user_id = p_user_id AND status = 'completed'
    ) THEN
      RETURN jsonb_build_object(
        'xp_earned', 0,
        'trust_change', 0,
        'new_streak', (SELECT current_streak FROM public.users WHERE id = p_user_id),
        'goal_completed', false
      );
    END IF;

    -- Base XP + trust
    v_xp_earned := 50;
    v_trust_change := 2; -- session_completed: +2

    -- Goal completed bonus
    IF p_goal_completed THEN
      v_xp_earned := v_xp_earned + 10;
    END IF;

    -- Rating XP bonus (trust impact partner'a ayrı RPC ile uygulanır)
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

    -- Trust score güncelle (6-param: 004 versiyonu ile uyumlu)
    PERFORM public.update_trust_score(
      p_user_id, p_session_id, 'session_completed', v_trust_change, NULL, '{}'::jsonb
    );

    -- Streak hesapla
    SELECT current_streak, last_session_date
    INTO v_streak, v_last_date
    FROM public.users
    WHERE id = p_user_id;

    IF v_last_date IS NULL OR v_last_date < v_today - 1 THEN
      v_streak := 1;
    ELSIF v_last_date = v_today - 1 THEN
      v_streak := v_streak + 1;
    END IF;
    -- v_last_date = v_today ise streak zaten sayılmış, değişme

    -- Streak XP bonus (günde bir kez)
    IF v_last_date IS DISTINCT FROM v_today THEN
      v_xp_earned := v_xp_earned + 20;
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
        level = GREATEST(1, 1 + ((xp + v_xp_earned) / 500)),
        last_active_at = NOW()
    WHERE id = p_user_id;

    -- User limits güncelle (günlük seans sayacı)
    INSERT INTO public.user_limits (user_id, date, sessions_used, max_sessions)
    VALUES (
      p_user_id, v_today, 1,
      CASE WHEN (SELECT is_premium FROM public.users WHERE id = p_user_id) THEN 999 ELSE 3 END
    )
    ON CONFLICT (user_id, date)
    DO UPDATE SET sessions_used = public.user_limits.sessions_used + 1;

    -- ============================================================
    -- Session status: tüm participant'lar completed mı?
    -- Row lock ile race condition önle (duo: iki user aynı anda bitirir)
    -- ============================================================
    PERFORM 1 FROM public.sessions WHERE id = p_session_id FOR UPDATE;

    SELECT COUNT(*) INTO v_remaining
    FROM public.session_participants
    WHERE session_id = p_session_id
      AND status IN ('waiting', 'active');

    IF v_remaining = 0 THEN
      UPDATE public.sessions
      SET status = 'completed', ended_at = NOW()
      WHERE id = p_session_id AND status != 'completed';
    END IF;

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


  -- ============================================================
  -- 4. GRANT PERMISSIONS
  -- ============================================================
  GRANT EXECUTE ON FUNCTION public.complete_session(UUID, UUID, INTEGER, BOOLEAN) TO authenticated;
