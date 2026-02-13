'use client';

import { motion } from 'framer-motion';

const MODES = [
    { value: 15, label: 'Hızlı Görev', subtitle: '15 dk' },
    { value: 25, label: 'Pomodoro', subtitle: '25 dk' },
    { value: 50, label: 'Derin Odak', subtitle: '50 dk' },
    { value: 90, label: 'Maraton', subtitle: '90 dk' },
] as const;

interface ModeSelectorProps {
    selected: number;
    onChange: (value: number) => void;
}

export function ModeSelector({ selected, onChange }: ModeSelectorProps) {
    return (
        <div className="flex items-center justify-center gap-2 sm:gap-3 flex-wrap">
            {MODES.map((mode) => {
                const isSelected = selected === mode.value;
                return (
                    <motion.button
                        key={mode.value}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => onChange(mode.value)}
                        aria-label={`${mode.label} - ${mode.subtitle}`}
                        aria-pressed={isSelected}
                        className={`relative flex flex-col items-center px-5 py-2.5 rounded-full font-medium transition-all ${isSelected
                            ? 'bg-[#eea62b] text-[#221b10] shadow-lg shadow-[#eea62b]/30'
                            : 'bg-white/[0.08] text-white/70 border border-white/[0.12] hover:bg-white/[0.12]'
                            }`}
                    >
                        <span className="text-sm font-semibold">{mode.label}</span>
                        <span className={`text-[10px] mt-0.5 ${isSelected ? 'text-[#221b10]/70' : 'text-white/40'}`}>
                            {mode.subtitle}
                        </span>
                    </motion.button>
                );
            })}
        </div>
    );
}
