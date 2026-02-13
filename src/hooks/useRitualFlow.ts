'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase-client';

// ============================================================
// Types
// ============================================================

export interface LiveStats {
    activeUsers: number;
    todaySessions: number;
    todayMinutes: number;
    waiting: {
        '15': number;
        '25': number;
        '50': number;
    };
}

export interface RecentMatch {
    id: string;
    duration: number;
    state: string;
    userA: string;
    userB: string;
    secondsAgo: number;
    createdAt: string;
}

export interface UserIntent {
    hasIntent: boolean;
    lastIntent: string | null;
    lastDuration: number;
    currentStreak: number;
    name: string;
    lastSessionDate: string | null;
}

export interface WeeklyProgress {
    activeDays: number;
    totalDays: number;
    weekSessions: number;
    weekMinutes: number;
    currentStreak: number;
    xpToNextLevel: number;
    level: number;
    nextAchievement: string | null;
    nextAchievementProgress: number;
}

// ============================================================
// useLiveStats — FOMO panel verisi
// ============================================================

export function useLiveStats(pollIntervalMs = 10000) {
    const [stats, setStats] = useState<LiveStats | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchStats = useCallback(async () => {
        try {
            const supabase = createClient();
            const { data, error } = await supabase.rpc('get_live_stats');
            if (!error && data) {
                setStats({
                    activeUsers: data.active_users ?? 0,
                    todaySessions: data.today_sessions ?? 0,
                    todayMinutes: data.today_minutes ?? 0,
                    waiting: data.waiting ?? { '15': 0, '25': 0, '50': 0 },
                });
            }
        } catch {
            // Silent fail — stats are best-effort
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStats();
        const interval = setInterval(fetchStats, pollIntervalMs);
        return () => clearInterval(interval);
    }, [fetchStats, pollIntervalMs]);

    return { stats, loading, refetch: fetchStats };
}

// ============================================================
// useRecentMatches — Son eşleşmeler feed
// ============================================================

export function useRecentMatches(limit = 5) {
    const [matches, setMatches] = useState<RecentMatch[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchMatches = useCallback(async () => {
        try {
            const supabase = createClient();
            const { data, error } = await supabase.rpc('get_recent_matches', { p_limit: limit });
            if (!error && data?.matches) {
                setMatches(
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    data.matches.map((m: any) => ({
                        id: m.id,
                        duration: m.duration,
                        state: m.state,
                        userA: m.user_a,
                        userB: m.user_b,
                        secondsAgo: m.seconds_ago,
                        createdAt: m.created_at,
                    }))
                );
            }
        } catch {
            // Silent fail
        } finally {
            setLoading(false);
        }
    }, [limit]);

    useEffect(() => {
        fetchMatches();
        const interval = setInterval(fetchMatches, 15000);
        return () => clearInterval(interval);
    }, [fetchMatches]);

    return { matches, loading, refetch: fetchMatches };
}

// ============================================================
// useUserIntent — Adaptive intent verisi
// ============================================================

export function useUserIntent() {
    const [intent, setIntent] = useState<UserIntent | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetch = async () => {
            try {
                const supabase = createClient();
                const { data, error } = await supabase.rpc('get_user_intent');
                if (!error && data) {
                    setIntent({
                        hasIntent: data.has_intent ?? false,
                        lastIntent: data.last_intent ?? null,
                        lastDuration: data.last_duration ?? 25,
                        currentStreak: data.current_streak ?? 0,
                        name: data.name ?? '',
                        lastSessionDate: data.last_session_date ?? null,
                    });
                }
            } catch {
                // Silent fail
            } finally {
                setLoading(false);
            }
        };
        fetch();
    }, []);

    const saveIntent = useCallback(async (intentText: string, duration: number) => {
        const supabase = createClient();
        await supabase.rpc('save_user_intent', {
            p_intent: intentText,
            p_duration: duration,
        });
        setIntent(prev => prev ? { ...prev, lastIntent: intentText, lastDuration: duration } : prev);
    }, []);

    return { intent, loading, saveIntent };
}

// ============================================================
// useWeeklyProgress — Results ekranı haftalık verisi
// ============================================================

export function useWeeklyProgress(userId: string | null) {
    const [progress, setProgress] = useState<WeeklyProgress | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!userId) return;
        const fetch = async () => {
            try {
                const supabase = createClient();
                const { data, error } = await supabase.rpc('get_weekly_progress', {
                    p_user_id: userId,
                });
                if (!error && data) {
                    setProgress({
                        activeDays: data.active_days ?? 0,
                        totalDays: data.total_days ?? 7,
                        weekSessions: data.week_sessions ?? 0,
                        weekMinutes: data.week_minutes ?? 0,
                        currentStreak: data.current_streak ?? 0,
                        xpToNextLevel: data.xp_to_next_level ?? 100,
                        level: data.level ?? 1,
                        nextAchievement: data.next_achievement ?? null,
                        nextAchievementProgress: data.next_achievement_progress ?? 0,
                    });
                }
            } catch {
                // Silent fail
            } finally {
                setLoading(false);
            }
        };
        fetch();
    }, [userId]);

    return { progress, loading };
}
