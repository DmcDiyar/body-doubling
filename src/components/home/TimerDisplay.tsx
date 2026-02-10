'use client';

import { motion } from 'framer-motion';

interface TimerDisplayProps {
    minutes: number;
    seconds?: number;
    isFocusMode?: boolean;
}

export function TimerDisplay({ minutes, seconds, isFocusMode }: TimerDisplayProps) {
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds ?? 0).padStart(2, '0');

    return (
        <motion.div
            key={isFocusMode ? 'focus' : `idle-${minutes}`}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: isFocusMode ? 1.05 : 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
            className="text-[140px] sm:text-[180px] md:text-[220px] font-extrabold
                 leading-none tracking-[-0.02em] text-white select-none
                 drop-shadow-[0_10px_40px_rgba(0,0,0,0.6)]"
        >
            {mm}:{ss}
        </motion.div>
    );
}
