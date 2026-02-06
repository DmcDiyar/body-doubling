'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { createClient } from '@/lib/supabase-client';

interface HeartbeatResult {
    partner_alive: boolean;
    match_state: 'preparing' | 'active' | 'broken' | 'completed';
    broken_reason?: string;
    error?: string;
}

interface UseMatchHeartbeatOptions {
    matchId: string | null;
    intervalMs?: number;
    onMatchBroken?: (reason: string) => void;
    onMatchActive?: () => void;
    enabled?: boolean;
}

export function useMatchHeartbeat({
    matchId,
    intervalMs = 5000,
    onMatchBroken,
    onMatchActive,
    enabled = true,
}: UseMatchHeartbeatOptions) {
    const [isPartnerAlive, setIsPartnerAlive] = useState(true);
    const [matchState, setMatchState] = useState<string>('preparing');
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const callbacksRef = useRef({ onMatchBroken, onMatchActive });

    // Update callbacks ref
    useEffect(() => {
        callbacksRef.current = { onMatchBroken, onMatchActive };
    }, [onMatchBroken, onMatchActive]);

    const sendHeartbeat = useCallback(async () => {
        if (!matchId) return;

        const supabase = createClient();
        const { data, error } = await supabase.rpc('match_heartbeat', {
            p_match_id: matchId,
        });

        if (error) {
            console.error('Heartbeat error:', error);
            return;
        }

        const result = data as HeartbeatResult;

        if (result.error) {
            console.error('Heartbeat RPC error:', result.error);
            return;
        }

        setIsPartnerAlive(result.partner_alive);
        setMatchState(result.match_state);

        // Handle state changes
        if (result.match_state === 'broken' && callbacksRef.current.onMatchBroken) {
            callbacksRef.current.onMatchBroken(result.broken_reason || 'partner_timeout');
        }

        if (result.match_state === 'active' && callbacksRef.current.onMatchActive) {
            callbacksRef.current.onMatchActive();
        }
    }, [matchId]);

    // Start/stop heartbeat
    useEffect(() => {
        if (!matchId || !enabled) {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
            return;
        }

        // Send initial heartbeat
        sendHeartbeat();

        // Start interval
        intervalRef.current = setInterval(sendHeartbeat, intervalMs);

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [matchId, intervalMs, enabled, sendHeartbeat]);

    // Subscribe to match changes via realtime
    useEffect(() => {
        if (!matchId || !enabled) return;

        const supabase = createClient();
        const channel = supabase
            .channel(`match:${matchId}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'matches',
                    filter: `id=eq.${matchId}`,
                },
                (payload) => {
                    const newState = payload.new as { state: string; broken_reason?: string };
                    setMatchState(newState.state);

                    if (newState.state === 'broken' && callbacksRef.current.onMatchBroken) {
                        callbacksRef.current.onMatchBroken(newState.broken_reason || 'unknown');
                    }

                    if (newState.state === 'active' && callbacksRef.current.onMatchActive) {
                        callbacksRef.current.onMatchActive();
                    }
                }
            )
            .subscribe();

        return () => {
            channel.unsubscribe();
        };
    }, [matchId, enabled]);

    return {
        isPartnerAlive,
        matchState,
        sendHeartbeat,
    };
}

// Mark user as ready after ritual
export async function markMatchReady(matchId: string): Promise<{ both_ready: boolean; match_state: string }> {
    const supabase = createClient();
    const { data, error } = await supabase.rpc('mark_match_ready', {
        p_match_id: matchId,
    });

    if (error) throw error;
    return data;
}

// Re-queue after match break
export async function requeueAfterBreak(duration: number, theme: string = 'rainy_cafe'): Promise<string> {
    const supabase = createClient();
    const { data, error } = await supabase.rpc('requeue_after_break', {
        p_duration: duration,
        p_theme: theme,
    });

    if (error) throw error;
    return data;
}

// Explicitly break match (user exit)
export async function breakMatch(matchId: string, reason: string = 'user_exit'): Promise<void> {
    const supabase = createClient();
    const { error } = await supabase.rpc('break_match', {
        p_match_id: matchId,
        p_reason: reason,
    });

    if (error) throw error;
}
