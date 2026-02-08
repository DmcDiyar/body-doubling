'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';

interface MatchBrokenModalProps {
    isOpen: boolean;
    reason?: string;
    onRequeue: () => void;
    autoRequeueMs?: number;
}

export function MatchBrokenModal({
    isOpen,
    reason = 'partner_timeout',
    onRequeue,
    autoRequeueMs = 3000,
}: MatchBrokenModalProps) {
    const [countdown, setCountdown] = useState(Math.ceil(autoRequeueMs / 1000));

    // Auto-requeue countdown
    useEffect(() => {
        if (!isOpen) return;

        setCountdown(Math.ceil(autoRequeueMs / 1000));

        const timer = setInterval(() => {
            setCountdown((prev) => {
                if (prev <= 1) {
                    clearInterval(timer);
                    onRequeue();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [isOpen, autoRequeueMs, onRequeue]);

    const getMessage = () => {
        switch (reason) {
            case 'partner_timeout':
                return 'Esin baglantiyi kaybetti.';
            case 'user_exit':
                return 'Esin seansi terk etti.';
            default:
                return 'Eslesme iptal edildi.';
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
                >
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        className="w-full max-w-sm bg-gradient-to-b from-[#1a1a2e] to-[#0f3460] rounded-2xl p-6 border border-white/10 text-center"
                    >
                        {/* Icon */}
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: 'spring', delay: 0.1 }}
                            className="w-16 h-16 mx-auto mb-4 rounded-full bg-orange-500/20 flex items-center justify-center"
                        >
                            <span className="text-3xl">🔄</span>
                        </motion.div>

                        {/* Message */}
                        <h2 className="text-xl font-semibold text-white mb-2">
                            {getMessage()}
                        </h2>
                        <p className="text-gray-400 mb-6">
                            Seni yeniden eslestiriyoruz.
                        </p>

                        {/* Countdown */}
                        <div className="flex items-center justify-center gap-2 text-gray-500 text-sm">
                            <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                                className="w-4 h-4 border-2 border-gray-500/30 border-t-gray-500 rounded-full"
                            />
                            <span>{countdown}s</span>
                        </div>

                        {/* Manual button */}
                        <button
                            onClick={onRequeue}
                            className="mt-4 text-[#ffcb77] text-sm hover:underline"
                        >
                            Hemen eslestir
                        </button>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

