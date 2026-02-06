'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import { MindfulCooldown } from '@/components/session';
import type { CooldownResult } from '@/components/session';

export default function SessionCooldownWrapper() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-gradient-to-b from-[#1a1a2e] via-[#16213e] to-[#0f3460] flex items-center justify-center">
                <div className="w-12 h-12 border-4 border-[#ffcb77]/30 border-t-[#ffcb77] rounded-full animate-spin" />
            </div>
        }>
            <SessionCooldownPage />
        </Suspense>
    );
}

function SessionCooldownPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const sessionId = searchParams.get('id');

    const [alreadyCompleted, setAlreadyCompleted] = useState(false);

    // Check if cooldown already completed
    useEffect(() => {
        if (!sessionId) {
            router.push('/dashboard');
            return;
        }

        const checkCooldown = async () => {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                router.push('/auth');
                return;
            }

            // Check participant metadata
            const { data: participant } = await supabase
                .from('session_participants')
                .select('metadata')
                .eq('session_id', sessionId)
                .eq('user_id', user.id)
                .single();

            if (participant?.metadata?.cooldown) {
                // Already completed, skip to end
                setAlreadyCompleted(true);
                router.push(`/session/end?id=${sessionId}`);
            }
        };

        checkCooldown();
    }, [sessionId, router]);

    const handleCooldownComplete = async (result: CooldownResult) => {
        if (!sessionId) return;

        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Get current metadata
        const { data: participant } = await supabase
            .from('session_participants')
            .select('metadata')
            .eq('session_id', sessionId)
            .eq('user_id', user.id)
            .single();

        const currentMetadata = participant?.metadata || {};

        // Update with cooldown data
        const updatedMetadata = {
            ...currentMetadata,
            cooldown: {
                completed: result.completed,
                skipped: result.skipped,
                mood: result.mood,
                reflection: result.reflection,
            },
        };

        await supabase
            .from('session_participants')
            .update({ metadata: updatedMetadata })
            .eq('session_id', sessionId)
            .eq('user_id', user.id);

        // Navigate to session end
        router.push(`/session/end?id=${sessionId}`);
    };

    if (!sessionId || alreadyCompleted) {
        return (
            <div className="min-h-screen bg-gradient-to-b from-[#1a1a2e] via-[#16213e] to-[#0f3460] flex items-center justify-center">
                <div className="w-12 h-12 border-4 border-[#ffcb77]/30 border-t-[#ffcb77] rounded-full animate-spin" />
            </div>
        );
    }

    return <MindfulCooldown onComplete={handleCooldownComplete} />;
}
