'use client';

import { useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase-client';

// ============================================================
// useProfilePhoto — Profil fotoğrafı yükleme/silme hook'u
// ============================================================

interface ProfilePhotoState {
    url: string | null;
    uploading: boolean;
    error: string | null;
}

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function useProfilePhoto(initialUrl: string | null = null) {
    const [state, setState] = useState<ProfilePhotoState>({
        url: initialUrl,
        uploading: false,
        error: null,
    });

    // Fotoğraf yükle
    const upload = useCallback(async (file: File): Promise<string | null> => {
        // Validasyon
        if (!ALLOWED_TYPES.includes(file.type)) {
            setState(prev => ({ ...prev, error: 'Sadece JPEG, PNG veya WebP yükleyebilirsin.' }));
            return null;
        }

        if (file.size > MAX_FILE_SIZE) {
            setState(prev => ({ ...prev, error: 'Dosya 2MB\'dan küçük olmalı.' }));
            return null;
        }

        setState(prev => ({ ...prev, uploading: true, error: null }));

        try {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                setState(prev => ({ ...prev, uploading: false, error: 'Giriş yapmalısın.' }));
                return null;
            }

            // Dosya adı: user_id + timestamp (eski fotoğrafı override etmek için)
            const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
            const filePath = `${user.id}/avatar.${ext}`;

            // Eski dosyayı sil (varsa)
            await supabase.storage.from('avatars').remove([`${user.id}/avatar.jpg`, `${user.id}/avatar.png`, `${user.id}/avatar.webp`]);

            // Yeni dosyayı yükle
            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, file, {
                    cacheControl: '3600',
                    upsert: true,
                });

            if (uploadError) {
                setState(prev => ({ ...prev, uploading: false, error: uploadError.message }));
                return null;
            }

            // Public URL al
            const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
            const publicUrl = urlData.publicUrl + '?t=' + Date.now(); // Cache bust

            // DB'ye kaydet
            const { error: rpcError } = await supabase.rpc('update_avatar_url', { p_url: publicUrl });
            if (rpcError) {
                setState(prev => ({ ...prev, uploading: false, error: rpcError.message }));
                return null;
            }

            setState({ url: publicUrl, uploading: false, error: null });
            return publicUrl;
        } catch (err) {
            setState(prev => ({ ...prev, uploading: false, error: (err as Error).message }));
            return null;
        }
    }, []);

    // Fotoğrafı sil
    const remove = useCallback(async (): Promise<boolean> => {
        setState(prev => ({ ...prev, uploading: true, error: null }));

        try {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return false;

            // Storage'dan sil
            await supabase.storage.from('avatars').remove([
                `${user.id}/avatar.jpg`,
                `${user.id}/avatar.png`,
                `${user.id}/avatar.webp`,
            ]);

            // DB'den temizle
            await supabase.rpc('update_avatar_url', { p_url: '' });

            setState({ url: null, uploading: false, error: null });
            return true;
        } catch (err) {
            setState(prev => ({ ...prev, uploading: false, error: (err as Error).message }));
            return false;
        }
    }, []);

    // Input file handler (bir butona onClick verirsin)
    const triggerUpload = useCallback(() => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/jpeg,image/png,image/webp';
        input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) upload(file);
        };
        input.click();
    }, [upload]);

    return {
        avatarUrl: state.url,
        uploading: state.uploading,
        error: state.error,
        upload,
        remove,
        triggerUpload,
    };
}
