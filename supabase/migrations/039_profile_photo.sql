-- ============================================================
-- 039: PROFİL FOTOĞRAFI SİSTEMİ
-- Date: 2026-02-13
-- ============================================================
-- 1. users tablosuna avatar_url ekle
-- 2. Storage bucket + RLS policies
-- ============================================================

-- 1. avatar_url alanı
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT NULL;


-- 2. Profil fotoğrafı yükleme/silme RPC
CREATE OR REPLACE FUNCTION public.update_avatar_url(p_url TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- URL doğrulama: sadece kendi bucket'ından gelen URL'ler
  IF p_url IS NOT NULL AND p_url != '' THEN
    IF NOT (p_url LIKE '%/storage/v1/object/public/avatars/%' OR p_url LIKE '%/storage/v1/object/sign/avatars/%') THEN
      RAISE EXCEPTION 'Invalid avatar URL';
    END IF;
  END IF;

  UPDATE users SET avatar_url = NULLIF(p_url, '') WHERE id = v_uid;

  RETURN jsonb_build_object('success', true, 'avatar_url', p_url);
END;
$$;


-- 3. Storage bucket oluştur (Supabase Dashboard'dan da yapılabilir)
-- NOT: Bu SQL, storage schema'ya erişim izni gerektirir.
-- Supabase hosted'da storage bucket'ı genellikle Dashboard'dan oluşturulur.
-- Aşağıdaki sadece self-hosted için çalışır:

-- INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- VALUES (
--   'avatars', 'avatars', true, 2097152, -- 2MB limit
--   ARRAY['image/jpeg', 'image/png', 'image/webp']
-- ) ON CONFLICT (id) DO NOTHING;

-- Storage'ı Dashboard'dan kuracaksanız:
-- Bucket: "avatars"
-- Public: true
-- File size limit: 2MB
-- Allowed types: image/jpeg, image/png, image/webp

COMMENT ON COLUMN users.avatar_url IS 'Kullanıcı profil fotoğrafı URL''si. Supabase Storage "avatars" bucket''ından gelir.';


-- 4. GRANT
GRANT EXECUTE ON FUNCTION public.update_avatar_url(TEXT) TO authenticated;
