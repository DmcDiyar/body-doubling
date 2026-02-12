// ============================================================
// Trust System API Functions
// ============================================================

import { createClient } from '@/lib/supabase-client';

/**
 * Trust event types
 */
export const TRUST_EVENT_TYPES = {
    SESSION_COMPLETED: 'session_completed',
    SOLO_SESSION_COMPLETED: 'solo_session_completed',
    PARTNER_RATED_5_STARS: 'partner_rated_5_stars',
    PARTNER_RATED_4_STARS: 'partner_rated_4_stars',
    PARTNER_RATED_1_STAR: 'partner_rated_1_star',
    PARTNER_RATED_2_STARS: 'partner_rated_2_stars',
    EARLY_EXIT_MILD: 'early_exit_mild',
    EARLY_EXIT_MODERATE: 'early_exit_moderate',
    EARLY_EXIT_SEVERE: 'early_exit_severe',
    GHOSTING: 'ghosting',
    NO_SHOW: 'no_show',
    REPORTED_AND_VERIFIED: 'reported_and_verified',
    HELPFUL_REPORT: 'helpful_report',
} as const;

export type TrustEventType = typeof TRUST_EVENT_TYPES[keyof typeof TRUST_EVENT_TYPES];

/**
 * Trust score değişimleri
 */
export const TRUST_SCORE_CHANGES: Record<TrustEventType, number> = {
    session_completed: 2,
    solo_session_completed: 5,
    partner_rated_5_stars: 5,
    partner_rated_4_stars: 2,
    partner_rated_1_star: -5,
    partner_rated_2_stars: -2,
    early_exit_mild: -4,
    early_exit_moderate: -8,
    early_exit_severe: -15,
    ghosting: -20,
    no_show: -10,
    reported_and_verified: -50,
    helpful_report: 5,
};

interface RecordTrustEventParams {
    userId: string;
    eventType: TrustEventType;
    sessionId?: string;
    relatedUserId?: string;
    metadata?: Record<string, unknown>;
}

/**
 * Record a trust event (calls the DB function update_trust_score)
 */
export async function recordTrustEvent(params: RecordTrustEventParams): Promise<number> {
    const supabase = createClient();

    const scoreChange = TRUST_SCORE_CHANGES[params.eventType];

    const { data, error } = await supabase.rpc('update_trust_score', {
        p_user_id: params.userId,
        p_session_id: params.sessionId || null,
        p_event_type: params.eventType,
        p_score_change: scoreChange,
        p_related_user_id: params.relatedUserId || null,
        p_metadata: params.metadata || {},
    });

    if (error) {
        console.error('Trust event error:', error);
        throw error;
    }

    return data as number; // New trust score
}

/**
 * Get user's trust level info
 */
export async function getUserTrustInfo(userId: string) {
    const supabase = createClient();

    const { data, error } = await supabase
        .from('users')
        .select('trust_score, trust_level')
        .eq('id', userId)
        .single();

    if (error) throw error;

    return {
        score: data.trust_score,
        level: data.trust_level,
        canMatch: data.trust_score >= 50,
        isRestricted: data.trust_score < 50,
    };
}

/**
 * Get rehabilitation progress for low-trust users
 */
export async function getRehabilitationStatus(userId: string): Promise<{
    isInRehab: boolean;
    completedSessions: number;
    remainingSessions: number;
    trustGainSoFar: number;
    canMatch: boolean;
}> {
    const supabase = createClient();

    // Get user trust
    const { data: user } = await supabase
        .from('users')
        .select('trust_score')
        .eq('id', userId)
        .single();

    if (!user || user.trust_score >= 50) {
        return {
            isInRehab: false,
            completedSessions: 0,
            remainingSessions: 0,
            trustGainSoFar: 0,
            canMatch: true,
        };
    }

    // Count solo sessions since trust dropped below 50
    const { count: soloSessions } = await supabase
        .from('trust_events')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('event_type', 'solo_session_completed')
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()); // Son 7 gün

    const completedSessions = soloSessions || 0;
    const requiredSessions = 3;
    const remainingSessions = Math.max(0, requiredSessions - completedSessions);

    return {
        isInRehab: true,
        completedSessions,
        remainingSessions,
        trustGainSoFar: completedSessions * 5,
        canMatch: remainingSessions === 0 && user.trust_score >= 50,
    };
}

/**
 * Calculate early exit penalty based on time elapsed
 */
export function calculateEarlyExitPenalty(
    elapsedMinutes: number,
    totalDuration: number
): { eventType: TrustEventType; penalty: number } {
    const percentComplete = elapsedMinutes / totalDuration;

    if (percentComplete >= 0.6) {
        // %60+: Neredeyse bitmiş, hafif ceza
        return {
            eventType: TRUST_EVENT_TYPES.EARLY_EXIT_MILD,
            penalty: TRUST_SCORE_CHANGES.early_exit_mild,
        };
    } else if (percentComplete >= 0.2) {
        // %20-60: Orta ceza
        return {
            eventType: TRUST_EVENT_TYPES.EARLY_EXIT_MODERATE,
            penalty: TRUST_SCORE_CHANGES.early_exit_moderate,
        };
    } else {
        // <%20: Neredeyse hiç çalışmamış, ağır ceza
        return {
            eventType: TRUST_EVENT_TYPES.EARLY_EXIT_SEVERE,
            penalty: TRUST_SCORE_CHANGES.early_exit_severe,
        };
    }
}

/**
 * Handle partner rating and apply trust changes
 */
export async function handlePartnerRating(params: {
    sessionId: string;
    raterId: string;
    ratedUserId: string;
    rating: number;
}): Promise<void> {
    const { sessionId, raterId, ratedUserId, rating } = params;

    let eventType: TrustEventType;

    switch (rating) {
        case 5:
            eventType = TRUST_EVENT_TYPES.PARTNER_RATED_5_STARS;
            break;
        case 4:
            eventType = TRUST_EVENT_TYPES.PARTNER_RATED_4_STARS;
            break;
        case 2:
            eventType = TRUST_EVENT_TYPES.PARTNER_RATED_2_STARS;
            break;
        case 1:
            eventType = TRUST_EVENT_TYPES.PARTNER_RATED_1_STAR;
            break;
        default:
            return; // 3 stars = neutral, no change
    }

    await recordTrustEvent({
        userId: ratedUserId,
        eventType,
        sessionId,
        relatedUserId: raterId,
        metadata: { rating },
    });
}
