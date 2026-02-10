'use client';

import { motion } from 'framer-motion';

interface TimerDisplayProps {
    minutes: number;
}

export function TimerDisplay({ minutes }: TimerDisplayProps) {
    const display = `${minutes}:00`;

    return (
        <motion.div
            key={minutes}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
            className="text-[160px] sm:text-[200px] md:text-[220px] font-extrabold
                 leading-none tracking-[-0.02em] text-white select-none
                 drop-shadow-[0_10px_40px_rgba(0,0,0,0.6)]"
        >
            {display}
        </motion.div>
    );
}
