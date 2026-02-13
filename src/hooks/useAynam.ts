'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase-client';
import type { MaturityStage } from '@/types/database';

// ============================================================
// Aynam Data Types
// ============================================================

export interface AynamUser {
    name: string;
    level: number;
    xp: number;
    trust_score: number;
    trust_level: string;
    current_streak: number;
    longest_streak: number;
    total_sessions: number;
    completed_sessions: number;
    abandoned_sessions: number;
    total_minutes: number;
    maturity_stage: MaturityStage;
    created_at: string;
}

export interface FocusScore {
    ready: boolean;
    reason?: string;
    sessions_needed?: number;
    days_needed?: number;
    score?: number;
    consistency?: number;
    completion?: number;
    streak?: number;
    volume?: number;
    max_per_component?: number;
}

export interface HeatmapDay {
    date: string;
    day_of_week: number;
    session_count: number;
    total_minutes: number;
    intensity: number; // 0-4
}

export interface PersonalRecords {
    longest_streak: number;
    longest_session_minutes: number;
    max_sessions_per_day: number;
    latest_hour: number;
}

export interface WeeklyComparison {
    this_week: { sessions: number; minutes: number };
    last_week: { sessions: number; minutes: number };
    session_trend: 'up' | 'down' | 'stable';
    minutes_trend: 'up' | 'down' | 'stable';
}

export interface Badge {
    id: number;
    code: string;
    name: string;
    description: string;
    icon: string;
    rarity: string;
    unlocked: boolean;
    unlocked_at: string | null;
}

export interface StreakDay {
    day: string;
    day_of_week: number;
    had_session: boolean;
}

export interface AynamData {
    user: AynamUser;
    focus_score: FocusScore;
    heatmap: HeatmapDay[];
    records: PersonalRecords;
    weekly: WeeklyComparison;
    badges: Badge[];
    streak_days: StreakDay[];
    dynamic_message: string | null;
    today_sessions: number;
    xp_for_next_level: number;
    xp_level_start: number;
    xp_level_end: number;
}

// ============================================================
// Progresif Açılma Kuralları
// ============================================================

export interface VisibilityRules {
    showFocusScore: boolean;
    showRadar: boolean;
    showWeeklyComparison: boolean;
    showHeatmap: boolean;
    showBadges: boolean;
    showRecords: boolean;
    showDynamicMessage: boolean;
}

function computeVisibility(stage: MaturityStage, data: AynamData): VisibilityRules {
    const hasEnoughHeatmap = data.heatmap.filter(d => d.session_count > 0).length >= 3;

    return {
        // Odak Skoru: growth+ (10+ seans)
        showFocusScore: stage === 'growth' || stage === 'mastery',
        // Radar: mastery (15+ seans, 30+ gün)
        showRadar: stage === 'mastery',
        // Haftalık kıyaslama: growth+ (14+ gün)
        showWeeklyComparison: stage === 'growth' || stage === 'mastery',
        // Heatmap: formation+ (en az 3 farklı günde seans)
        showHeatmap: (stage !== 'discovery') && hasEnoughHeatmap,
        // Rozetler: growth+
        showBadges: stage === 'growth' || stage === 'mastery',
        // Kişisel rekorlar: formation+
        showRecords: stage !== 'discovery',
        // Dinamik mesaj: her zaman (veri varsa)
        showDynamicMessage: data.dynamic_message !== null,
    };
}

// ============================================================
// useAynam Hook
// ============================================================

export function useAynam() {
    const [data, setData] = useState<AynamData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [visibility, setVisibility] = useState<VisibilityRules>({
        showFocusScore: false,
        showRadar: false,
        showWeeklyComparison: false,
        showHeatmap: false,
        showBadges: false,
        showRecords: false,
        showDynamicMessage: false,
    });

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const supabase = createClient();
            const { data: result, error: rpcError } = await supabase.rpc('get_aynam_data');

            if (rpcError) {
                setError(rpcError.message);
                setLoading(false);
                return;
            }

            const aynam = result as AynamData;
            setData(aynam);
            setVisibility(computeVisibility(aynam.user.maturity_stage, aynam));
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Completion rate hesapla
    const completionRate = data
        ? data.user.completed_sessions + data.user.abandoned_sessions > 0
            ? Math.round((data.user.completed_sessions / (data.user.completed_sessions + data.user.abandoned_sessions)) * 100)
            : data.user.completed_sessions > 0 ? 100 : 0
        : 0;

    // XP ilerleme yüzdesi
    const xpProgress = data
        ? data.xp_level_end > data.xp_level_start
            ? ((data.user.xp - data.xp_level_start) / (data.xp_level_end - data.xp_level_start)) * 100
            : 0
        : 0;

    // Toplam süreyi saat + dakika formatla
    const formatMinutes = (minutes: number) => {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        if (h > 0) return `${h}s ${m}dk`;
        return `${m}dk`;
    };

    // Trust badge label
    const trustBadge = (trustLevel: string) => {
        switch (trustLevel) {
            case 'legend': return 'EFSANE';
            case 'elite': return 'ELİT';
            case 'verified': return 'DOĞRULANMIŞ';
            case 'trusted': return 'GÜVENİLİR';
            case 'newbie': return 'YENİ';
            case 'restricted': return 'KISITLI';
            default: return trustLevel.toUpperCase();
        }
    };

    return {
        data,
        loading,
        error,
        visibility,
        completionRate,
        xpProgress,
        formatMinutes,
        trustBadge,
        refetch: fetchData,
    };
}
