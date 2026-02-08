'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';

interface PomodoroOption {
    code: 'p15' | 'p25' | 'p50' | 'p90';
    minutes: number;
    label: string;
    xp: number;
    trust: number;
}

const POMODORO_OPTIONS: PomodoroOption[] = [
    { code: 'p15', minutes: 15, label: 'Kısa Odak', xp: 10, trust: 1 },
    { code: 'p25', minutes: 25, label: 'Standart', xp: 25, trust: 2 },
    { code: 'p50', minutes: 50, label: 'Derin', xp: 55, trust: 4 },
    { code: 'p90', minutes: 90, label: 'Uzun', xp: 110, trust: 7 },
];

interface PomodoroSelectProps {
    onSelect: (option: PomodoroOption, autoSelected: boolean) => void;
}

export function PomodoroSelect({ onSelect }: PomodoroSelectProps) {
    const [selected, setSelected] = useState<string | null>(null);
    const [timeLeft, setTimeLeft] = useState(10);

    const handleSelect = useCallback((option: PomodoroOption, auto: boolean) => {
        if (selected) return; // Prevent duplicate
        setSelected(option.code);

        // 0.2s delay then advance
        setTimeout(() => {
            onSelect(option, auto);
        }, 200);
    }, [selected, onSelect]);

    // Timeout: auto-select p25 after 10s
    useEffect(() => {
        if (selected) return;

        const timer = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    const defaultOption = POMODORO_OPTIONS.find(o => o.code === 'p25')!;
                    handleSelect(defaultOption, true);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [selected, handleSelect]);

    return (
        <div className="min-h-screen bg-gradient-to-b from-[#1a1a2e] via-[#16213e] to-[#0f3460] flex items-center justify-center px-4">
            <div className="w-full max-w-sm">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center mb-8"
                >
                    <h1 className="text-2xl font-bold text-white mb-2">
                        Bu seans ne kadar sürecek?
                    </h1>
                    <p className="text-gray-400 text-sm">
                        Süreyi seç.<br />
                        Bitene kadar orada kal.
                    </p>
                </motion.div>

                {/* Duration Cards */}
                <div className="grid grid-cols-2 gap-4 mb-8">
                    {POMODORO_OPTIONS.map((option, index) => (
                        <motion.button
                            key={option.code}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.1 }}
                            onClick={() => handleSelect(option, false)}
                            disabled={!!selected}
                            className={`
                relative p-6 rounded-2xl border-2 transition-all duration-200
                ${selected === option.code
                                    ? 'border-[#ffcb77] bg-[#ffcb77]/10 scale-[1.02]'
                                    : selected
                                        ? 'border-white/10 bg-white/5 opacity-50'
                                        : 'border-white/10 bg-white/5 hover:border-white/30'
                                }
              `}
                        >
                            {/* Glow effect for selected */}
                            {selected === option.code && (
                                <div className="absolute inset-0 rounded-2xl bg-[#ffcb77]/20 blur-xl" />
                            )}

                            <div className="relative z-10">
                                <span className="text-3xl font-bold text-white">
                                    {option.minutes}
                                </span>
                                <span className="text-lg text-gray-400 ml-1">dk</span>
                                <p className="text-sm text-gray-400 mt-1">{option.label}</p>
                            </div>
                        </motion.button>
                    ))}
                </div>

                {/* Timeout indicator (subtle) */}
                {!selected && (
                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.5 }}
                        className="text-center text-gray-500 text-xs"
                    >
                        {timeLeft}s
                    </motion.p>
                )}
            </div>
        </div>
    );
}

export { POMODORO_OPTIONS };
export type { PomodoroOption };
