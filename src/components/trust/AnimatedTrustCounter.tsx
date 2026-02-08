'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { getTrustLevel } from '@/lib/constants';

interface AnimatedTrustCounterProps {
    from: number;
    to: number;
    duration?: number; // ms
    onComplete?: () => void;
}

export function AnimatedTrustCounter({
    from,
    to,
    duration = 1500,
    onComplete,
}: AnimatedTrustCounterProps) {
    const [current, setCurrent] = useState(from);
    const [isAnimating, setIsAnimating] = useState(true);

    const change = to - from;
    const isPositive = change > 0;
    const isNegative = change < 0;
    const level = getTrustLevel(to);

    useEffect(() => {
        if (from === to) {
            setIsAnimating(false);
            onComplete?.();
            return;
        }

        const steps = Math.abs(change);
        const stepDuration = duration / steps;
        let step = 0;

        const interval = setInterval(() => {
            step++;
            const newValue = isPositive ? from + step : from - step;
            setCurrent(newValue);

            if (step >= steps) {
                clearInterval(interval);
                setIsAnimating(false);
                onComplete?.();
            }
        }, stepDuration);

        return () => clearInterval(interval);
    }, [from, to, duration, change, isPositive, onComplete]);

    return (
        <div className="text-center">
            {/* Main counter */}
            <motion.div
                className="relative inline-block"
                animate={isAnimating && isNegative ? {
                    x: [-2, 2, -2, 2, 0],
                } : {}}
                transition={{ duration: 0.3, repeat: isAnimating ? Infinity : 0 }}
            >
                <motion.span
                    className="text-6xl font-bold"
                    style={{ color: level.color }}
                    animate={isAnimating ? {
                        scale: [1, 1.05, 1],
                    } : {}}
                    transition={{ duration: 0.2, repeat: isAnimating ? Infinity : 0 }}
                >
                    {current}
                </motion.span>
            </motion.div>

            {/* Change indicator */}
            {!isAnimating && change !== 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4"
                >
                    <span
                        className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-lg font-semibold ${isPositive
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-red-500/20 text-red-400'
                            }`}
                    >
                        <span className="text-2xl">{isPositive ? '📈' : '📉'}</span>
                        {isPositive ? '+' : ''}{change} Güven Puanı
                    </span>
                </motion.div>
            )}

            {/* Level badge */}
            {!isAnimating && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="mt-4"
                >
                    <span
                        className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm"
                        style={{ backgroundColor: `${level.color}20`, color: level.color }}
                    >
                        <span>{level.emoji}</span>
                        <span>{level.labelTR}</span>
                    </span>
                </motion.div>
            )}
        </div>
    );
}

/**
 * Trust change summary for session end
 */
interface TrustChangeSummaryProps {
    beforeScore: number;
    afterScore: number;
    eventType: 'completed' | 'early_exit' | 'solo_completed';
    elapsedPercent?: number; // For early exit penalty display
}

export function TrustChangeSummary({
    beforeScore,
    afterScore,
    eventType,
    elapsedPercent,
}: TrustChangeSummaryProps) {

    const getMessage = () => {
        switch (eventType) {
            case 'completed':
                return {
                    title: 'Seans Tamamlandı! 🎉',
                    subtitle: 'Harika iş çıkardın.',
                    emoji: '✨',
                };
            case 'solo_completed':
                return {
                    title: 'Solo Seans Tamamlandı!',
                    subtitle: 'Rehabilitasyon ilerliyorsun.',
                    emoji: '🧘',
                };
            case 'early_exit':
                const severity = elapsedPercent && elapsedPercent < 20
                    ? 'Çok erken ayrıldın'
                    : elapsedPercent && elapsedPercent < 60
                        ? 'Erken ayrıldın'
                        : 'Neredeyse tamamlamıştın';
                return {
                    title: severity,
                    subtitle: 'Bir dahaki sefere tamamlamayı dene.',
                    emoji: '😔',
                };
        }
    };

    const message = getMessage();

    return (
        <div className="text-center">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8"
            >
                <span className="text-5xl">{message.emoji}</span>
                <h2 className="text-2xl font-bold text-white mt-4">{message.title}</h2>
                <p className="text-gray-400 mt-2">{message.subtitle}</p>
            </motion.div>

            {/* Animated counter */}
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 }}
                className="bg-white/5 rounded-2xl p-8 mb-6"
            >
                <p className="text-gray-500 text-sm mb-4">Güven Puanın</p>
                <AnimatedTrustCounter from={beforeScore} to={afterScore} />
            </motion.div>

            {/* Early exit explanation */}
            {eventType === 'early_exit' && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1.5 }}
                    className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-300"
                >
                    <p>
                        <strong>İpucu:</strong> Seansları tamamlamak güven puanını artırır ve
                        daha iyi eşleşmeler sağlar.
                    </p>
                </motion.div>
            )}
        </div>
    );
}
