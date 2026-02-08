'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import { useSessionStore } from '@/stores/session-store';
import { FocusRitual } from '@/components/session';
import { MatchBrokenModal } from '@/components/session/MatchBrokenModal';
import { useMatchHeartbeat, markMatchReady, requeueAfterBreak } from '@/hooks/useMatchHeartbeat';
import { logEvent, EVENTS } from '@/lib/analytics';
import type { RitualResult } from '@/components/session';

type Phase = 'ritual' | 'waiting' | 'starting';

export default function SessionPrepareWrapper() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-gradient-to-b from-[#1a1a2e] via-[#16213e] to-[#0f3460] flex items-center justify-center">
                <div className="w-12 h-12 border-4 border-[#ffcb77]/30 border-t-[#ffcb77] rounded-full animate-spin" />
            </div>
        }>
            <SessionPreparePage />
        </Suspense>
    );
}

function SessionPreparePage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const sessionId = searchParams.get('id');
    const matchIdParam = searchParams.get('matchId');
    const durationParam = searchParams.get('duration'); // Duration from quick-match
    const { setSession, setMyParticipation } = useSessionStore();

    const [phase, setPhase] = useState<Phase>('ritual');
    const [matchId, setMatchId] = useState<string | null>(matchIdParam);
    const [duration, setDuration] = useState<number>(parseInt(durationParam || '25', 10));
    const [showBrokenModal, setShowBrokenModal] = useState(false);
    const [brokenReason, setBrokenReason] = useState<string>('partner_timeout');

    // Heartbeat for duo sessions
    const handleMatchBroken = useCallback((reason: string) => {
        setBrokenReason(reason);
        setShowBrokenModal(true);
    }, []);

    const handleMatchActive = useCallback(() => {
        // Both users ready, navigate to session
        if (sessionId) {
            router.push(`/session/active?id=${sessionId}`);
        }
    }, [sessionId, router]);

    useMatchHeartbeat({
        matchId,
        intervalMs: 5000,
        onMatchBroken: handleMatchBroken,
        onMatchActive: handleMatchActive,
        enabled: !!matchId,
    });

    // Redirect if no session ID
    useEffect(() => {
        if (!sessionId) {
            router.push('/dashboard');
            return;
        }

        // Fetch match info if not in URL
        const fetchMatchInfo = async () => {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // Get match for this session
            const { data: match } = await supabase
                .from('matches')
                .select('*')
                .eq('session_id', sessionId)
                .single();

            if (match) {
                setMatchId(match.id);
                setDuration(match.pomodoro_duration);
            }
        };

        if (!matchIdParam) {
            fetchMatchInfo();
        }
    }, [sessionId, matchIdParam, router]);

    const handleRitualComplete = async (result: RitualResult) => {
        if (!sessionId) return;
        setPhase('waiting');

        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Update participant metadata with ritual data
        const metadata = {
            ritual: {
                completed: result.completed,
                intent: result.intent,
                started_at: result.startedAt,
                completed_at: result.completedAt,
            },
        };

        await supabase
            .from('session_participants')
            .update({
                joined_at: new Date().toISOString(),
                metadata,
            })
            .eq('session_id', sessionId)
            .eq('user_id', user.id);

        // Log ritual analytics
        if (result.completed) {
            logEvent(EVENTS.RITUAL_COMPLETED, {
                intent: result.intent,
                duration_s: result.completedAt && result.startedAt
                    ? Math.round((new Date(result.completedAt).getTime() - new Date(result.startedAt).getTime()) / 1000)
                    : 80,
            }, sessionId);
        } else {
            logEvent(EVENTS.RITUAL_INCOMPLETE, { step: 'force_close' }, sessionId);
        }

        // If duo match, mark ready and wait for partner
        if (matchId) {
            const readyResult = await markMatchReady(matchId);

            if (readyResult.both_ready) {
                // Both ready, navigate to session
                setPhase('starting');
                router.push(`/session/active?id=${sessionId}`);
            }
            // Otherwise, heartbeat will trigger onMatchActive when both ready
        } else {
            // Solo session, go directly
            setPhase('starting');

            // Update session to active
            await supabase
                .from('sessions')
                .update({
                    status: 'active',
                    started_at: new Date().toISOString()
                })
                .eq('id', sessionId);

            // Load session data into store
            const { data: session } = await supabase
                .from('sessions')
                .select('*')
                .eq('id', sessionId)
                .single();

            const { data: participation } = await supabase
                .from('session_participants')
                .select('*')
                .eq('session_id', sessionId)
                .eq('user_id', user.id)
                .single();

            if (session) setSession(session);
            if (participation) setMyParticipation(participation);

            router.push(`/session/active?id=${sessionId}`);
        }
    };

    const handleRequeue = async () => {
        setShowBrokenModal(false);
        try {
            await requeueAfterBreak(duration);
            router.push('/session/quick-match?requeue=true');
        } catch (error) {
            console.error('Requeue error:', error);
            router.push('/session/quick-match');
        }
    };

    if (!sessionId) {
        return null;
    }

    return (
        <>
            {/* RITUAL PHASE */}
            {phase === 'ritual' && (
                <FocusRitual onComplete={handleRitualComplete} />
            )}

            {/* WAITING FOR PARTNER */}
            {phase === 'waiting' && (
                <div className="min-h-screen bg-gradient-to-b from-[#1a1a2e] via-[#16213e] to-[#0f3460] flex items-center justify-center">
                    <div className="text-center">
                        <div className="w-16 h-16 border-4 border-[#ffcb77]/30 border-t-[#ffcb77] rounded-full animate-spin mx-auto mb-4" />
                        <p className="text-white font-medium mb-2">Hazirsin!</p>
                        <p className="text-gray-400 text-sm">Esini bekliyoruz...</p>
                    </div>
                </div>
            )}

            {/* STARTING */}
            {phase === 'starting' && (
                <div className="min-h-screen bg-gradient-to-b from-[#1a1a2e] via-[#16213e] to-[#0f3460] flex items-center justify-center">
                    <div className="text-center">
                        <div className="w-16 h-16 border-4 border-[#ffcb77]/30 border-t-[#ffcb77] rounded-full animate-spin mx-auto mb-4" />
                        <p className="text-gray-400">Seans basliyor...</p>
                    </div>
                </div>
            )}

            {/* MATCH BROKEN MODAL */}
            <MatchBrokenModal
                isOpen={showBrokenModal}
                reason={brokenReason}
                onRequeue={handleRequeue}
                autoRequeueMs={3000}
            />
        </>
    );
}

