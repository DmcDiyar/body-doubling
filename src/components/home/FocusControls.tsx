'use client';

import { motion } from 'framer-motion';

const APPLE_EASE = [0.16, 1, 0.3, 1] as const;

interface FocusControlsProps {
    onPause: () => void;
    onFinish: () => void;
}

export function FocusControls({ onPause, onFinish }: FocusControlsProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ delay: 0.35, duration: 0.42, ease: APPLE_EASE }}
            className="flex items-center justify-center gap-5"
        >
            {/* Duraklat */}
            <button
                onClick={onPause}
                className="flex items-center gap-2 bg-white/[0.08] border border-white/[0.12]
                   text-white/80 text-base font-medium px-8 py-3.5 rounded-2xl
                   hover:bg-white/[0.12] active:scale-[0.97]"
                style={{
                    transition: 'background-color 300ms, transform 200ms cubic-bezier(0.16, 1, 0.3, 1)',
                }}
            >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                    <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
                Duraklat
            </button>

            {/* Bitir */}
            <button
                onClick={onFinish}
                className="flex items-center gap-2 bg-white/[0.05] border border-red-500/20
                   text-red-400/80 text-base font-medium px-8 py-3.5 rounded-2xl
                   hover:bg-red-500/[0.08] hover:text-red-400 active:scale-[0.97]"
                style={{
                    transition: 'background-color 300ms, color 300ms, transform 200ms cubic-bezier(0.16, 1, 0.3, 1)',
                }}
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="4" y="4" width="16" height="16" rx="2" />
                </svg>
                Bitir
            </button>
        </motion.div>
    );
}
