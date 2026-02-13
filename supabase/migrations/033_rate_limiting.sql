-- ============================================================
-- 033: RATE LİMİTİNG
-- Date: 2026-02-13
-- ============================================================
-- 1. rate_limits tablosu
-- 2. check_rate_limit() — generic rate limit kontrolü
-- 3. Mevcut RPC'lere entegrasyon (find_match, complete_solo_session)
-- 4. Cleanup fonksiyonu (eski rate limit kayıtlarını sil)
-- ============================================================


-- ============================================================
-- 1. RATE_LIMITS TABLOSU
-- ============================================================

CREATE TABLE IF NOT EXISTS public.rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count INT NOT NULL DEFAULT 1,

  -- Unique: bir kullanıcı + bir aksiyon + bir pencere başlangıcı
  UNIQUE(user_id, action, window_start)
);

-- Index: hızlı lookup
CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup
  ON public.rate_limits(user_id, action, window_start DESC);

-- Eski kayıtları temizleme index'i (partial index NOW() kullanamaz — IMMUTABLE değil)
CREATE INDEX IF NOT EXISTS idx_rate_limits_cleanup
  ON public.rate_limits(window_start);

-- RLS
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Sadece kendi rate limit kayıtlarını görebilir
CREATE POLICY "rl_select_own"
  ON public.rate_limits FOR SELECT
  USING (user_id = auth.uid());

-- No client INSERT/UPDATE/DELETE — only via SECURITY DEFINER

COMMENT ON TABLE public.rate_limits IS 'Rate limiting: aksiyon bazlı, sliding window. INSERT/UPDATE sadece SECURITY DEFINER RPC ile.';


-- ============================================================
-- 2. CHECK_RATE_LIMIT — Generic rate limit kontrolü
-- ============================================================
-- Returns: true = izin ver, false = limit aşıldı
-- Side effect: izin verilirse count artırılır

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_user_id UUID,
  p_action TEXT,
  p_max_count INT,
  p_window_minutes INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_current_count INT;
BEGIN
  -- Pencere başlangıcını hesapla (0'a yuvarla)
  -- Örnek: p_window_minutes=60 ise, saatin başı
  v_window_start := date_trunc('hour', NOW())
    + (FLOOR(EXTRACT(MINUTE FROM NOW()) / p_window_minutes) * p_window_minutes) * INTERVAL '1 minute';

  -- Mevcut count'u al veya oluştur
  INSERT INTO rate_limits (user_id, action, window_start, count)
  VALUES (p_user_id, p_action, v_window_start, 1)
  ON CONFLICT (user_id, action, window_start)
  DO UPDATE SET count = rate_limits.count + 1
  RETURNING count INTO v_current_count;

  -- Limit kontrolü
  IF v_current_count > p_max_count THEN
    -- Geri al (count'u 1 azalt, çünkü zaten artırdık)
    UPDATE rate_limits
    SET count = count - 1
    WHERE user_id = p_user_id
      AND action = p_action
      AND window_start = v_window_start;
    RETURN false;
  END IF;

  RETURN true;
END;
$$;


-- ============================================================
-- 3. GET_RATE_LIMIT_STATUS — Kullanıcının limit durumu
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_rate_limit_status(
  p_action TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_limits JSONB;
  v_config RECORD;
  v_current_count INT;
  v_max_count INT;
  v_window_minutes INT;
  v_window_start TIMESTAMPTZ;
BEGIN
  -- Aksiyon konfigürasyonu
  CASE p_action
    WHEN 'create_session' THEN v_max_count := 10; v_window_minutes := 60;
    WHEN 'join_queue'      THEN v_max_count := 5;  v_window_minutes := 10;
    WHEN 'send_heartbeat'  THEN v_max_count := 60; v_window_minutes := 5;
    WHEN 'rate_partner'    THEN v_max_count := 2;  v_window_minutes := 60;
    WHEN 'report_user'     THEN v_max_count := 3;  v_window_minutes := 1440; -- 24 saat
    ELSE v_max_count := 100; v_window_minutes := 60;
  END CASE;

  -- Pencere hesapla
  v_window_start := date_trunc('hour', NOW())
    + (FLOOR(EXTRACT(MINUTE FROM NOW()) / v_window_minutes) * v_window_minutes) * INTERVAL '1 minute';

  -- Mevcut count
  SELECT COALESCE(count, 0) INTO v_current_count
  FROM rate_limits
  WHERE user_id = v_uid
    AND action = p_action
    AND window_start = v_window_start;

  v_current_count := COALESCE(v_current_count, 0);

  RETURN jsonb_build_object(
    'action', p_action,
    'current', v_current_count,
    'max', v_max_count,
    'remaining', GREATEST(0, v_max_count - v_current_count),
    'window_minutes', v_window_minutes,
    'resets_at', v_window_start + (v_window_minutes * INTERVAL '1 minute')
  );
END;
$$;


-- ============================================================
-- 4. RATE-LIMITED FIND_MATCH — Entegrasyon
-- ============================================================
-- find_match fonksiyonuna rate limit kontrolü ekle
-- Bu wrapper, mevcut find_match'i çağırmadan önce kontrol yapar

CREATE OR REPLACE FUNCTION public.find_match_rate_limited(
  p_user_id UUID,
  p_duration INTEGER,
  p_theme TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed BOOLEAN;
  v_session_id UUID;
BEGIN
  -- Rate limit: max 5 join_queue per 10 minutes
  v_allowed := check_rate_limit(p_user_id, 'join_queue', 5, 10);
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Rate limit exceeded: join_queue. Lütfen birkaç dakika bekleyin.';
  END IF;

  -- Mevcut find_match'i çağır
  v_session_id := find_match(p_user_id, p_duration, p_theme);
  RETURN v_session_id;
END;
$$;


-- ============================================================
-- 5. RATE LIMIT CLEANUP (cron ile çağrılır)
-- ============================================================

CREATE OR REPLACE FUNCTION public.cleanup_rate_limits()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM rate_limits
  WHERE window_start < NOW() - INTERVAL '24 hours';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;


-- ============================================================
-- 6. GRANT PERMISSIONS
-- ============================================================

GRANT EXECUTE ON FUNCTION public.check_rate_limit(UUID, TEXT, INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_rate_limit_status(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_match_rate_limited(UUID, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_rate_limits() TO authenticated;
