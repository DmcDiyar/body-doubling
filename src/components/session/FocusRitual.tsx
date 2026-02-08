'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

type Intent = 'finish' | 'start' | 'calm' | 'presence';

interface RitualResult {
    completed: boolean;
    intent: Intent;
    startedAt: string;
    completedAt: string | null;
}

interface FocusRitualProps {
    onComplete: (result: RitualResult) => void;
}

const INTENT_OPTIONS: { value: Intent; label: string }[] = [
    { value: 'finish', label: 'Bir seyi bitirmek' },
    { value: 'start', label: 'Dusunmeden baslamak' },
    { value: 'calm', label: 'Sakin kalmak' },
    { value: 'presence', label: 'Sadece orada olmak' },
];

type Step = 1 | 2 | 3 | 4;

const STEP_DURATIONS: Record<Step, number> = {
    1: 20,
    2: 30,
    3: 15,
    4: 15,
};

export function FocusRitual({ onComplete }: FocusRitualProps) {
    const [step, setStep] = useState<Step>(1);
    const [timeLeft, setTimeLeft] = useState(STEP_DURATIONS[1]);
    const [intent, setIntent] = useState<Intent>('presence');
    const [isPaused, setIsPaused] = useState(false);
    const [startedAt] = useState(new Date().toISOString());

    useEffect(() => {
        const handleVisibility = () => {
            setIsPaused(document.hidden);
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, []);

    const completeRitual = useCallback((completed: boolean) => {
        onComplete({
            completed,
            intent,
            startedAt,
            completedAt: completed ? new Date().toISOString() : null,
        });
    }, [intent, startedAt, onComplete]);

    useEffect(() => {
        if (isPaused) return;

        const timer = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timer);

                    if (step === 1) {
                        setStep(2);
                        setTimeLeft(STEP_DURATIONS[2]);
                    } else if (step === 2) {
                        setStep(3);
                        setTimeLeft(STEP_DURATIONS[3]);
                    } else if (step === 3) {
                        setStep(4);
                        setTimeLeft(STEP_DURATIONS[4]);
                    } else if (step === 4) {
                        completeRitual(true);
                    }
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [step, isPaused, completeRitual]);

    const handleIntentSelect = (value: Intent) => {
        setIntent(value);
        setStep(3);
        setTimeLeft(STEP_DURATIONS[3]);
    };

    const handleStartSession = () => {
        completeRitual(true);
    };

    return (
        <div className="min-h-screen bg-gradient-to-b from-[#1a1a2e] via-[#16213e] to-[#0f3460] flex items-center justify-center px-4">
            <div className="w-full max-w-sm">
                <AnimatePresence mode="wait">
                    {step === 1 && (
                        <motion.div
                            key="step1"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.4 }}
                            className="text-center"
                        >
                            <motion.div
                                animate={{ scale: [1, 1.15, 1] }}
                                transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
                                className="w-32 h-32 mx-auto mb-8 rounded-full bg-gradient-to-br from-[#ffcb77]/30 to-[#ffcb77]/10 flex items-center justify-center"
                            >
                                <div className="w-20 h-20 rounded-full bg-[#ffcb77]/20" />
                            </motion.div>

                            <h2 className="text-2xl font-semibold text-white mb-2">
                                Bir an dur.
                            </h2>
                            <p className="text-gray-400">
                                Nefesini fark et.<br />
                                Su an buradasin.
                            </p>
                        </motion.div>
                    )}

                    {step === 2 && (
                        <motion.div
                            key="step2"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.4 }}
                            className="text-center"
                        >
                            <h2 className="text-2xl font-semibold text-white mb-6">
                                Bu seans icin niyetin ne?
                            </h2>

                            <div className="space-y-3 mb-6">
                                {INTENT_OPTIONS.map((option, index) => (
                                    <motion.button
                                        key={option.value}
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: index * 0.1 }}
                                        onClick={() => handleIntentSelect(option.value)}
                                        className={`
                                            w-full p-4 rounded-xl border-2 text-left transition-all
                                            ${intent === option.value && step !== 2
                                                ? 'border-[#ffcb77] bg-[#ffcb77]/10'
                                                : 'border-white/10 bg-white/5 hover:border-white/30'
                                            }
                                        `}
                                    >
                                        <span className="text-white">{option.label}</span>
                                    </motion.button>
                                ))}
                            </div>

                            <p className="text-gray-500 text-sm">
                                Sec ve devam et.
                            </p>
                            <p className="text-gray-600 text-xs mt-2">{timeLeft}s</p>
                        </motion.div>
                    )}

                    {step === 3 && (
                        <motion.div
                            key="step3"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.4 }}
                            className="text-center"
                        >
                            <h2 className="text-2xl font-semibold text-white mb-2">
                                Omuzlarini gevset.
                            </h2>
                            <h2 className="text-2xl font-semibold text-white mb-6">
                                Ceneni birak.
                            </h2>
                            <p className="text-gray-400 text-lg">
                                Hazirsin.
                            </p>
                        </motion.div>
                    )}

                    {step === 4 && (
                        <motion.div
                            key="step4"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.4 }}
                            className="text-center"
                        >
                            <h2 className="text-2xl font-semibold text-white mb-8">
                                Seans baslamak uzere.
                            </h2>

                            <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={handleStartSession}
                                className="w-full bg-[#ffcb77] text-[#1a1a2e] font-semibold py-4 rounded-xl text-lg mb-4"
                            >
                                Basla
                            </motion.button>

                            <p className="text-gray-500 text-sm">{timeLeft}s</p>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

export type { RitualResult, Intent };
