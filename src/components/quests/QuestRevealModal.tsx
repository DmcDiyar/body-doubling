'use client';

import { motion } from 'framer-motion';

interface QuestRevealModalProps {
    questType: 'daily' | 'weekly';
    teaser: string;
    onReveal: () => void;
    onSkip: () => void;
}

export function QuestRevealModal({ questType, teaser, onReveal, onSkip }: QuestRevealModalProps) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
            onClick={onSkip}
        >
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="w-full max-w-sm bg-gradient-to-b from-[#1a1a2e] to-[#0f3460] rounded-2xl p-6 border border-white/10"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Mystery icon */}
                <motion.div
                    animate={{ rotateY: [0, 180, 360] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    className="text-center mb-4"
                >
                    <span className="text-5xl">?</span>
                </motion.div>

                <h3 className="text-white font-bold text-center text-lg mb-2">
                    {questType === 'daily' ? 'Bugünün Görevi' : 'Haftanin Görevi'}
                </h3>

                <p className="text-gray-400 text-sm text-center mb-4 italic">
                    &ldquo;{teaser}&rdquo;
                </p>

                {/* Warning */}
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-6">
                    <p className="text-red-400/80 text-xs text-center">
                        Geri dönüs yok. Görevi açtiginda taahhüt ediyorsun.
                    </p>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2">
                    <motion.button
                        whileTap={{ scale: 0.98 }}
                        onClick={onReveal}
                        className="w-full bg-[#ffcb77] text-[#1a1a2e] font-semibold py-3 rounded-xl"
                    >
                        Görevi Aç
                    </motion.button>
                    <button
                        onClick={onSkip}
                        className="text-gray-500 text-sm hover:text-gray-300 transition-colors py-2"
                    >
                        Simdilik Degil
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
}

