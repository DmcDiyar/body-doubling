'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

type Mood = 'tired' | 'neutral' | 'good' | 'energetic' | 'peaceful';
type Reflection = 'focused' | 'struggled' | 'distracted' | 'present';

interface CooldownResult {
    completed: boolean;
    skipped: boolean;
    mood: Mood | null;
    reflection: Reflection | null;
}

interface MindfulCooldownProps {
    onComplete: (result: CooldownResult) => void;
}

const MOOD_OPTIONS: { value: Mood; emoji: string; label: string }[] = [
    { value: 'tired', emoji: '😔', label: 'Yorgun' },
    { value: 'neutral', emoji: '😐', label: 'Notr' },
    { value: 'good', emoji: '🙂', label: 'Iyi' },
    { value: 'energetic', emoji: '😊', label: 'Enerjik' },
    { value: 'peaceful', emoji: '😌', label: 'Huzurlu' },
];

const REFLECTION_OPTIONS: { value: Reflection; label: string }[] = [
    { value: 'focused', label: 'Odaklandim' },
    { value: 'struggled', label: 'Zorlandim ama kaldim' },
    { value: 'distracted', label: 'Dagildim ama dondum' },
    { value: 'present', label: 'Sadece orada kaldim' },
];

type Step = 1 | 2 | 3 | 4;

const STEP_DURATIONS: Record<Step, number> = {
    1: 10,
    2: 30,
    3: 30,
    4: 20,
};

export function MindfulCooldown({ onComplete }: MindfulCooldownProps) {
    const [step, setStep] = useState<Step>(1);
    const [timeLeft, setTimeLeft] = useState(STEP_DURATIONS[1]);
    const [mood, setMood] = useState<Mood | null>(null);
    const [reflection, setReflection] = useState<Reflection | null>(null);
    const [isPaused, setIsPaused] = useState(false);

    useEffect(() => {
        const handleVisibility = () => {
            setIsPaused(document.hidden);
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, []);

    const completeCooldown = useCallback((skipped: boolean) => {
        onComplete({
            completed: !skipped,
            skipped,
            mood,
            reflection,
        });
    }, [mood, reflection, onComplete]);

    const handleSkip = () => {
        completeCooldown(true);
    };

    useEffect(() => {
        if (isPaused) return;
        if (step === 2 || step === 3) return;

        const timer = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timer);

                    if (step === 1) {
                        setStep(2);
                        setTimeLeft(STEP_DURATIONS[2]);
                    } else if (step === 4) {
                        completeCooldown(false);
                    }
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [step, isPaused, completeCooldown]);

    const handleMoodSelect = (value: Mood) => {
        setMood(value);
        setStep(3);
        setTimeLeft(STEP_DURATIONS[3]);
    };

    const handleReflectionSelect = (value: Reflection) => {
        setReflection(value);
        setStep(4);
        setTimeLeft(STEP_DURATIONS[4]);
    };

    const handleFinish = () => {
        completeCooldown(false);
    };

    return (
        <div className="min-h-screen bg-gradient-to-b from-[#16213e] via-[#1a1a2e] to-[#0f3460] flex items-center justify-center px-4">
            <div className="w-full max-w-sm relative">
                <button
                    onClick={handleSkip}
                    className="absolute top-4 right-0 text-gray-500 hover:text-gray-400 text-sm transition-colors"
                >
                    Atla →
                </button>

                <AnimatePresence mode="wait">
                    {step === 1 && (
                        <motion.div
                            key="step1"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.6 }}
                            className="text-center pt-12"
                        >
                            <h2 className="text-2xl font-semibold text-white mb-2">
                                Seans bitti.
                            </h2>
                            <p className="text-gray-400">
                                Bir nefes al.
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
                            className="text-center pt-12"
                        >
                            <h2 className="text-xl font-semibold text-white mb-6">
                                Su an nasil hissediyorsun?
                            </h2>

                            <div className="flex justify-center gap-3 mb-8">
                                {MOOD_OPTIONS.map((option) => (
                                    <motion.button
                                        key={option.value}
                                        whileTap={{ scale: 0.95 }}
                                        onClick={() => handleMoodSelect(option.value)}
                                        className={`
                                            flex flex-col items-center p-3 rounded-xl transition-all
                                            ${mood === option.value
                                                ? 'bg-[#ffcb77]/20 ring-2 ring-[#ffcb77] scale-105'
                                                : 'bg-white/5 hover:bg-white/10'
                                            }
                                        `}
                                    >
                                        <span className="text-2xl mb-1">{option.emoji}</span>
                                        <span className="text-xs text-gray-400">{option.label}</span>
                                    </motion.button>
                                ))}
                            </div>
                        </motion.div>
                    )}

                    {step === 3 && (
                        <motion.div
                            key="step3"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.4 }}
                            className="text-center pt-12"
                        >
                            <h2 className="text-xl font-semibold text-white mb-6">
                                Bu seansi nasil tanimlarsin?
                            </h2>

                            <div className="space-y-3">
                                {REFLECTION_OPTIONS.map((option, index) => (
                                    <motion.button
                                        key={option.value}
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: index * 0.1 }}
                                        onClick={() => handleReflectionSelect(option.value)}
                                        className={`
                                            w-full p-4 rounded-xl border-2 text-left transition-all
                                            ${reflection === option.value
                                                ? 'border-[#ffcb77] bg-[#ffcb77]/10'
                                                : 'border-white/10 bg-white/5 hover:border-white/30'
                                            }
                                        `}
                                    >
                                        <span className="text-white">{option.label}</span>
                                    </motion.button>
                                ))}
                            </div>
                        </motion.div>
                    )}

                    {step === 4 && (
                        <motion.div
                            key="step4"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.4 }}
                            className="text-center pt-12"
                        >
                            <motion.h2
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.2 }}
                                className="text-2xl font-semibold text-[#ffcb77] mb-2"
                            >
                                Guzel is.
                            </motion.h2>
                            <p className="text-gray-400 mb-8">
                                Kendine zaman ayirdin.<br />
                                Bu onemli.
                            </p>

                            <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={handleFinish}
                                className="w-full bg-[#ffcb77] text-[#1a1a2e] font-semibold py-4 rounded-xl text-lg mb-4"
                            >
                                Tamam
                            </motion.button>

                            <p className="text-gray-600 text-sm">{timeLeft}s</p>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

export type { CooldownResult, Mood, Reflection };
