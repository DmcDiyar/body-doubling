'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import { useSessionStore } from '@/stores/session-store';
import { PomodoroSelect, FocusRitual } from '@/components/session';
import type { PomodoroOption } from '@/components/session';
import type { RitualResult } from '@/components/session';

type Phase = 'pomodoro' | 'ritual' | 'starting';

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
    const { setSession, setMyParticipation } = useSessionStore();

    const [phase, setPhase] = useState<Phase>('pomodoro');
    const [selectedPomodoro, setSelectedPomodoro] = useState<PomodoroOption | null>(null);
    const [pomodoroAutoSelected, setPomodoroAutoSelected] = useState(false);

    // Redirect if no session ID
    useEffect(() => {
        if (!sessionId) {
            router.push('/dashboard');
        }
    }, [sessionId, router]);

    const handlePomodoroSelect = (option: PomodoroOption, autoSelected: boolean) => {
        setSelectedPomodoro(option);
        setPomodoroAutoSelected(autoSelected);
        setPhase('ritual');
    };

    const handleRitualComplete = async (result: RitualResult) => {
        if (!sessionId) return;
        setPhase('starting');

        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Update session with selected duration
        await supabase
            .from('sessions')
            .update({
                duration: selectedPomodoro?.minutes || 25,
                status: 'active',
                started_at: new Date().toISOString()
            })
            .eq('id', sessionId);

        // Update participant metadata with pomodoro + ritual data
        const metadata = {
            pomodoro: {
                duration: selectedPomodoro?.code || 'p25',
                minutes: selectedPomodoro?.minutes || 25,
                selected_at: new Date().toISOString(),
                auto_selected: pomodoroAutoSelected,
            },
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
                status: 'active',
                joined_at: new Date().toISOString(),
                metadata,
            })
            .eq('session_id', sessionId)
            .eq('user_id', user.id);

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

        // Navigate to active session
        router.push(`/session/active?id=${sessionId}`);
    };

    if (!sessionId) {
        return null;
    }

    return (
        <>
            {phase === 'pomodoro' && (
                <PomodoroSelect onSelect={handlePomodoroSelect} />
            )}

            {phase === 'ritual' && (
                <FocusRitual onComplete={handleRitualComplete} />
            )}

            {phase === 'starting' && (
                <div className="min-h-screen bg-gradient-to-b from-[#1a1a2e] via-[#16213e] to-[#0f3460] flex items-center justify-center">
                    <div className="text-center">
                        <div className="w-16 h-16 border-4 border-[#ffcb77]/30 border-t-[#ffcb77] rounded-full animate-spin mx-auto mb-4" />
                        <p className="text-gray-400">Seans başlıyor...</p>
                    </div>
                </div>
            )}
        </>
    );
}
