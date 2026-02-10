'use client';

import { motion } from 'framer-motion';

interface ActiveMatchInfo {
    matchId: string;
    sessionId: string;
    state: string;
}

interface ActiveMatchBannerProps {
    activeMatch: ActiveMatchInfo;
    onRejoin: () => void;
    onDismiss: () => void;
}

export function ActiveMatchBanner({ activeMatch, onRejoin, onDismiss }: ActiveMatchBannerProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-orange-500/[0.12] border border-orange-500/25 rounded-2xl p-4 mb-6
                 backdrop-blur-[6px] max-w-md mx-auto w-full"
        >
            <div className="flex items-center gap-3">
                <span className="text-xl">{activeMatch.state === 'active' ? '⏱️' : '🔄'}</span>
                <div className="flex-1">
                    <p className="text-white text-sm font-medium">
                        {activeMatch.state === 'active'
                            ? 'Devam eden seansın var!'
                            : 'Eşleşmeye geri dönebilirsin!'}
                    </p>
                </div>
                <div className="flex flex-col gap-1">
                    <button
                        onClick={onRejoin}
                        className="bg-primary text-white px-4 py-1.5 rounded-lg text-xs font-semibold
                       shadow-lg shadow-primary/20 hover:bg-violet-500 transition-colors"
                    >
                        Geri Dön
                    </button>
                    <button
                        onClick={onDismiss}
                        className="text-white/30 text-[10px] hover:text-white/60 transition-colors text-center"
                    >
                        Kapat
                    </button>
                </div>
            </div>
        </motion.div>
    );
}
