'use client';

import { useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase-client';

// ============================================================
// Rate Limit durumları
// ============================================================
export interface RateLimitStatus {
    action: string;
    current: number;
    max: number;
    remaining: number;
    window_minutes: number;
    resets_at: string;
}

export interface RateLimitState {
    loading: boolean;
    limited: boolean;
    status: RateLimitStatus | null;
    error: string | null;
}

/**
 * useRateLimit — Rate limit durumunu kontrol eden hook
 * 
 * Kullanım:
 * ```tsx
 * const { checkLimit, status, limited } = useRateLimit();
 * 
 * const handleAction = async () => {
 *   const allowed = await checkLimit('join_queue');
 *   if (!allowed) return; // UI'da uyarı gösterilir
 *   // ... devam et
 * };
 * ```
 */
export function useRateLimit() {
    const [state, setState] = useState<RateLimitState>({
        loading: false,
        limited: false,
        status: null,
        error: null,
    });

    // Rate limit durumunu kontrol et (sadece oku, count artırmaz)
    const checkStatus = useCallback(async (action: string): Promise<RateLimitStatus | null> => {
        setState(prev => ({ ...prev, loading: true }));

        try {
            const supabase = createClient();
            const { data, error } = await supabase.rpc('get_rate_limit_status', {
                p_action: action,
            });

            if (error) {
                setState(prev => ({ ...prev, loading: false, error: error.message }));
                return null;
            }

            const status = data as RateLimitStatus;
            const limited = status.remaining <= 0;

            setState({
                loading: false,
                limited,
                status,
                error: null,
            });

            return status;
        } catch (err) {
            setState(prev => ({
                ...prev,
                loading: false,
                error: (err as Error).message,
            }));
            return null;
        }
    }, []);

    // Rate-limited find_match çağır (count artırır + eşleşme arar)
    const findMatchWithLimit = useCallback(async (
        userId: string,
        duration: number,
        theme: string
    ): Promise<{ sessionId: string | null; rateLimited: boolean }> => {
        setState(prev => ({ ...prev, loading: true }));

        try {
            const supabase = createClient();
            const { data, error } = await supabase.rpc('find_match_rate_limited', {
                p_user_id: userId,
                p_duration: duration,
                p_theme: theme,
            });

            if (error) {
                // Rate limit hata mesajını yakala
                if (error.message.includes('Rate limit exceeded')) {
                    // Durumu güncelle
                    await checkStatus('join_queue');
                    setState(prev => ({
                        ...prev,
                        loading: false,
                        limited: true,
                        error: null,
                    }));
                    return { sessionId: null, rateLimited: true };
                }

                setState(prev => ({ ...prev, loading: false, error: error.message }));
                return { sessionId: null, rateLimited: false };
            }

            setState(prev => ({ ...prev, loading: false, limited: false }));
            return { sessionId: data as string | null, rateLimited: false };
        } catch (err) {
            setState(prev => ({
                ...prev,
                loading: false,
                error: (err as Error).message,
            }));
            return { sessionId: null, rateLimited: false };
        }
    }, [checkStatus]);

    // Kalan süreyi hesapla
    const getResetCountdown = useCallback((): number => {
        if (!state.status?.resets_at) return 0;
        const resetTime = new Date(state.status.resets_at).getTime();
        const now = Date.now();
        return Math.max(0, Math.ceil((resetTime - now) / 1000));
    }, [state.status]);

    // State'i sıfırla
    const reset = useCallback(() => {
        setState({
            loading: false,
            limited: false,
            status: null,
            error: null,
        });
    }, []);

    return {
        ...state,
        checkStatus,
        findMatchWithLimit,
        getResetCountdown,
        reset,
    };
}
