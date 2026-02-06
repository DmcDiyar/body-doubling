'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { createClient } from '@/lib/supabase-client';
import { REHABILITATION, getTrustLevel } from '@/lib/constants';

interface RehabBannerProps {
    userId: string;
}

interface RehabStatus {
    isInRehab: boolean;
    completedSessions: number;
    remainingSessions: number;
    trustScore: number;
    canMatch: boolean;
}

export function RehabBanner({ userId }: RehabBannerProps) {
    const [status, setStatus] = useState<RehabStatus | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchRehabStatus = async () => {
            const supabase = createClient();

            // Get user trust
            const { data: user } = await supabase
                .from('users')
                .select('trust_score')
                .eq('id', userId)
                .single();

            if (!user) {
                setLoading(false);
                return;
            }

            // Check if in rehabilitation
            if (user.trust_score >= 50) {
                setStatus({
                    isInRehab: false,
                    completedSessions: 0,
                    remainingSessions: 0,
                    trustScore: user.trust_score,
                    canMatch: true,
                });
                setLoading(false);
                return;
            }

            // Count solo sessions completed while trust < 50
            const { count: soloSessions } = await supabase
                .from('trust_events')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', userId)
                .eq('event_type', 'solo_session_completed')
                .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

            const completedSessions = soloSessions || 0;
            const remainingSessions = Math.max(0, REHABILITATION.REQUIRED_SESSIONS - completedSessions);

            setStatus({
                isInRehab: true,
                completedSessions,
                remainingSessions,
                trustScore: user.trust_score,
                canMatch: remainingSessions === 0 && user.trust_score >= 50,
            });
            setLoading(false);
        };

        fetchRehabStatus();
    }, [userId]);

    if (loading) return null;
    if (!status || !status.isInRehab) return null;

    const progress = (status.completedSessions / REHABILITATION.REQUIRED_SESSIONS) * 100;

    return (
        <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-r from-blue-900/50 to-indigo-900/50 border border-blue-500/30 rounded-2xl p-6 mb-6"
        >
            <div className="flex items-start gap-4">
                <span className="text-3xl">🤝</span>
                <div className="flex-1">
                    <h3 className="font-semibold text-white mb-2">
                        {status.remainingSessions > 0
                            ? 'Rehabilitasyon Modu'
                            : 'Rehabilitasyon Tamamlandı! 🎉'}
                    </h3>

                    {status.remainingSessions > 0 ? (
                        <>
                            <p className="text-sm text-blue-200 mb-4">
                                Topluluk güvenliği için solo modda çalışıyorsun.
                                {status.remainingSessions} seans daha tamamla, tekrar eşleş!
                            </p>

                            {/* Progress */}
                            <div className="mb-4">
                                <div className="flex justify-between text-xs text-blue-300 mb-1">
                                    <span>{status.completedSessions}/{REHABILITATION.REQUIRED_SESSIONS} seans</span>
                                    <span>+{status.completedSessions * REHABILITATION.TRUST_PER_SESSION} trust</span>
                                </div>
                                <div className="w-full bg-blue-900/50 rounded-full h-2">
                                    <motion.div
                                        className="bg-blue-400 h-2 rounded-full"
                                        initial={{ width: 0 }}
                                        animate={{ width: `${progress}%` }}
                                        transition={{ duration: 0.5 }}
                                    />
                                </div>
                            </div>

                            {/* Progress steps */}
                            <div className="flex gap-2 mb-4">
                                {Array.from({ length: REHABILITATION.REQUIRED_SESSIONS }).map((_, i) => (
                                    <div
                                        key={i}
                                        className={`flex-1 h-1 rounded-full ${i < status.completedSessions
                                            ? 'bg-green-500'
                                            : 'bg-white/20'
                                            }`}
                                    />
                                ))}
                            </div>

                            {/* CTA */}
                            <a
                                href="/session/quick-match?mode=solo"
                                className="inline-block bg-blue-500 hover:bg-blue-600 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
                            >
                                Solo Seans Başlat
                            </a>
                        </>
                    ) : (
                        <>
                            <p className="text-sm text-green-200 mb-4">
                                Harika! Artık tekrar eşleşebilirsin. İyi çalışmalar! 🎉
                            </p>
                            <a
                                href="/session/quick-match"
                                className="inline-block bg-green-500 hover:bg-green-600 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
                            >
                                Hemen Eşleş
                            </a>
                        </>
                    )}
                </div>
            </div>
        </motion.div>
    );
}

/**
 * Trust Level Badge Component
 */
interface TrustBadgeProps {
    score: number;
    showScore?: boolean;
    size?: 'sm' | 'md' | 'lg';
}

export function TrustBadge({ score, showScore = false, size = 'md' }: TrustBadgeProps) {
    const level = getTrustLevel(score);

    const sizeClasses = {
        sm: 'text-xs px-2 py-0.5',
        md: 'text-sm px-3 py-1',
        lg: 'text-base px-4 py-2',
    };

    return (
        <div
            className={`inline-flex items-center gap-1.5 rounded-full font-medium ${sizeClasses[size]}`}
            style={{ backgroundColor: `${level.color}20`, color: level.color }}
        >
            <span>{level.emoji}</span>
            <span>{level.labelTR}</span>
            {showScore && <span className="opacity-70">({score})</span>}
        </div>
    );
}

/**
 * Trust Score Display (for Dashboard)
 */
interface TrustScoreDisplayProps {
    score: number;
    compact?: boolean;
}

export function TrustScoreDisplay({ score, compact = false }: TrustScoreDisplayProps) {
    const level = getTrustLevel(score);
    const progress = (score / 200) * 100;

    if (compact) {
        return (
            <div className="flex items-center gap-2">
                <span className="text-lg">{level.emoji}</span>
                <span className="font-medium" style={{ color: level.color }}>
                    {score}
                </span>
            </div>
        );
    }

    return (
        <div className="bg-white/5 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
                <span className="text-gray-400 text-sm">Trust Score</span>
                <TrustBadge score={score} />
            </div>

            <div className="flex items-baseline gap-2 mb-3">
                <span className="text-3xl font-bold text-white">{score}</span>
                <span className="text-gray-500">/200</span>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-white/10 rounded-full h-2">
                <div
                    className="h-2 rounded-full transition-all duration-500"
                    style={{ width: `${progress}%`, backgroundColor: level.color }}
                />
            </div>

            {/* Level info */}
            <p className="text-xs text-gray-500 mt-2">
                {level.canMatch
                    ? '✅ Eşleşme aktif'
                    : '❌ Solo modda çalışman gerekiyor'}
            </p>
        </div>
    );
}
