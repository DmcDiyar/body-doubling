'use client';

import { motion } from 'framer-motion';

interface ActionButtonsProps {
    onSoloStart: () => void;
    onMatchStart: () => void;
    canStart: boolean;
    isRestricted: boolean;
    isStarting: boolean;
    isPaused?: boolean;
}

export function ActionButtons({
    onSoloStart,
    onMatchStart,
    canStart,
    isRestricted,
    isStarting,
    isPaused = false,
}: ActionButtonsProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex items-center justify-center gap-4"
        >
            {/* BAŞLA / Devam Et (Solo) */}
            <motion.button
                whileHover={{ scale: canStart && !isRestricted ? 1.03 : 1 }}
                whileTap={{ scale: canStart && !isRestricted ? 0.97 : 1 }}
                onClick={onSoloStart}
                disabled={!canStart || isRestricted || isStarting}
                className={`flex items-center gap-2 text-lg font-bold px-12 py-4 rounded-2xl transition-all ${canStart && !isRestricted
                        ? 'bg-primary hover:bg-violet-500 text-white shadow-[0_20px_60px_rgba(124,58,237,0.4)]'
                        : 'bg-white/[0.06] text-white/30 cursor-not-allowed'
                    }`}
            >
                {isPaused ? (
                    <>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M8 5v14l11-7z" />
                        </svg>
                        Devam Et
                    </>
                ) : (
                    <>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M8 5v14l11-7z" />
                        </svg>
                        {isStarting ? 'Baslatiliyor...' : 'BASLA'}
                    </>
                )}
            </motion.button>

            {/* Eslesme Bul */}
            {!isRestricted && !isPaused && (
                <motion.button
                    whileHover={{ scale: canStart ? 1.03 : 1 }}
                    whileTap={{ scale: canStart ? 0.97 : 1 }}
                    onClick={onMatchStart}
                    disabled={!canStart}
                    className={`flex items-center gap-2 text-lg font-bold px-8 py-4 rounded-2xl transition-all ${canStart
                            ? 'bg-white/[0.06] border border-white/[0.15] text-white hover:bg-white/[0.1] shadow-xl'
                            : 'bg-white/[0.03] border border-white/[0.06] text-white/30 cursor-not-allowed'
                        }`}
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                    Eslesme Bul
                </motion.button>
            )}
        </motion.div>
    );
}
