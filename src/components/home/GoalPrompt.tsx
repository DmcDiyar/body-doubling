'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { createClient } from '@/lib/supabase-client';

interface GoalPromptProps {
    onGoalSet?: (goal: string) => void;
    initialGoal?: string;
}

export function GoalPrompt({ onGoalSet, initialGoal = '' }: GoalPromptProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [goal, setGoal] = useState(initialGoal);
    const inputRef = useRef<HTMLInputElement>(null);

    // Load last intent from DB on mount
    useEffect(() => {
        const load = async () => {
            try {
                const supabase = createClient();
                const { data } = await supabase.rpc('get_user_intent');
                if (data?.last_intent) {
                    setGoal(data.last_intent);
                }
            } catch {
                // Silent fail
            }
        };
        if (!initialGoal) load();
    }, [initialGoal]);

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isEditing]);

    const handleSubmit = useCallback(() => {
        const trimmed = goal.trim();
        if (trimmed) {
            onGoalSet?.(trimmed);
            // Persist to DB
            const save = async () => {
                try {
                    const supabase = createClient();
                    await supabase.rpc('save_user_intent', {
                        p_intent: trimmed,
                        p_duration: 25,
                    });
                } catch {
                    // Silent fail
                }
            };
            save();
        }
        setIsEditing(false);
    }, [goal, onGoalSet]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSubmit();
        } else if (e.key === 'Escape') {
            setIsEditing(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
            className="flex items-center justify-center gap-2 mb-4"
        >
            {isEditing ? (
                <input
                    ref={inputRef}
                    type="text"
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={handleSubmit}
                    placeholder="Bugünkü odağın..."
                    maxLength={60}
                    aria-label="Bugünkü hedefini yaz"
                    className="bg-transparent border-b border-white/20 text-white/90 text-lg font-medium
                     text-center outline-none placeholder:text-white/30 pb-1 w-64
                     focus:border-[#eea62b]/60 transition-colors"
                />
            ) : (
                <button
                    onClick={() => setIsEditing(true)}
                    className="flex items-center gap-2 group"
                    aria-label="Hedef belirle"
                >
                    <span className="text-white/70 text-lg font-medium">
                        {goal || 'Neye odaklanmak istersin?'}
                    </span>
                    <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="text-white/30 group-hover:text-white/60 transition-colors"
                    >
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                </button>
            )}
        </motion.div>
    );
}
