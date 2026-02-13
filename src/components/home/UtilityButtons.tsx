'use client';

import { motion } from 'framer-motion';

interface UtilityButtonsProps {
    onReset: () => void;
}

export function UtilityButtons({ onReset }: UtilityButtonsProps) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="flex items-center justify-center gap-6 mt-10 text-white/40"
        >
            {/* Reset / Refresh */}
            <button
                onClick={onReset}
                className="hover:text-white/80 transition-colors p-2 rounded-xl hover:bg-white/[0.05]"
                title="Süreyi sıfırla"
                aria-label="Süreyi sıfırla"
            >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10" />
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
            </button>
        </motion.div>
    );
}
