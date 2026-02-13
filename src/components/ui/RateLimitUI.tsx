'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { RateLimitStatus } from '@/hooks/useRateLimit';

// ============================================================
// Rate Limit Banner — Limit aşıldığında uyarı gösterir
// ============================================================

interface RateLimitBannerProps {
    show: boolean;
    status: RateLimitStatus | null;
    onDismiss?: () => void;
}

export function RateLimitBanner({ show, status, onDismiss }: RateLimitBannerProps) {
    const [countdown, setCountdown] = useState(0);

    // Geri sayım
    useEffect(() => {
        if (!show || !status?.resets_at) return;

        const calcRemaining = () => {
            const resetTime = new Date(status.resets_at).getTime();
            return Math.max(0, Math.ceil((resetTime - Date.now()) / 1000));
        };

        setCountdown(calcRemaining());

        const interval = setInterval(() => {
            const remaining = calcRemaining();
            setCountdown(remaining);

            if (remaining <= 0) {
                clearInterval(interval);
                onDismiss?.();
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [show, status, onDismiss]);

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        if (m > 0) return `${m}dk ${s}s`;
        return `${s}s`;
    };

    return (
        <AnimatePresence>
            {show && (
                <motion.div
                    initial={{ opacity: 0, y: -20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -20, scale: 0.95 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[90vw] max-w-md"
                >
                    <div className="relative overflow-hidden rounded-2xl border border-red-500/20 bg-gradient-to-r from-red-950/90 to-orange-950/90 backdrop-blur-xl shadow-2xl shadow-red-500/10">
                        {/* Progress bar */}
                        {status && (
                            <motion.div
                                className="absolute top-0 left-0 h-0.5 bg-gradient-to-r from-red-400 to-orange-400"
                                initial={{ width: '100%' }}
                                animate={{ width: '0%' }}
                                transition={{
                                    duration: countdown,
                                    ease: 'linear',
                                }}
                            />
                        )}

                        <div className="p-4">
                            <div className="flex items-start gap-3">
                                {/* Icon */}
                                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center">
                                    <span className="text-xl">⏳</span>
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    <p className="text-red-200 font-semibold text-sm">
                                        Çok hızlı gidiyorsun!
                                    </p>
                                    <p className="text-red-300/70 text-xs mt-0.5">
                                        {status ? (
                                            <>
                                                {getActionLabel(status.action)} limiti doldu
                                                ({status.current}/{status.max}).
                                                {countdown > 0 && (
                                                    <> Sıfırlanma: <span className="text-orange-300 font-mono font-bold">{formatTime(countdown)}</span></>
                                                )}
                                            </>
                                        ) : (
                                            'Lütfen birkaç dakika bekle.'
                                        )}
                                    </p>
                                </div>

                                {/* Dismiss */}
                                {onDismiss && (
                                    <button
                                        onClick={onDismiss}
                                        className="flex-shrink-0 text-red-400/50 hover:text-red-300 transition-colors p-1"
                                        aria-label="Kapat"
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                            <line x1="18" y1="6" x2="6" y2="18" />
                                            <line x1="6" y1="6" x2="18" y2="18" />
                                        </svg>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

// ============================================================
// Rate Limit Indicator — Inline durum göstergesi
// ============================================================

interface RateLimitIndicatorProps {
    current: number;
    max: number;
    className?: string;
}

export function RateLimitIndicator({ current, max, className = '' }: RateLimitIndicatorProps) {
    const remaining = Math.max(0, max - current);
    const ratio = current / max;

    const getColor = () => {
        if (ratio >= 1) return 'text-red-400';
        if (ratio >= 0.8) return 'text-orange-400';
        if (ratio >= 0.5) return 'text-yellow-400';
        return 'text-white/30';
    };

    // Durumu önemsiz veya başlangıçtaysa gösterme
    if (ratio < 0.5) return null;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={`flex items-center gap-1.5 ${className}`}
        >
            <div className="flex gap-0.5">
                {Array.from({ length: max }, (_, i) => (
                    <div
                        key={i}
                        className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${i < current
                            ? ratio >= 1 ? 'bg-red-400' : ratio >= 0.8 ? 'bg-orange-400' : 'bg-yellow-400'
                            : 'bg-white/10'
                            }`}
                    />
                ))}
            </div>
            <span className={`text-[10px] font-mono ${getColor()}`}>
                {remaining > 0 ? `${remaining} hak` : 'limit!'}
            </span>
        </motion.div>
    );
}

// ============================================================
// Helpers
// ============================================================

function getActionLabel(action: string): string {
    switch (action) {
        case 'join_queue': return 'Eşleşme kuyruğu';
        case 'create_session': return 'Seans oluşturma';
        case 'send_heartbeat': return 'Heartbeat';
        case 'rate_partner': return 'Partner değerlendirme';
        case 'report_user': return 'Kullanıcı raporlama';
        default: return action;
    }
}
