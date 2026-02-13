'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase-client';

// ============================================================
// StreakRescueBanner — Streak 0 olduğunda "Kurtarma Hakkı" gösterir
// rescue_streak() RPC'sini çağırır (ayda 1 hak)
// ============================================================

interface Props {
    currentStreak: number;
    onRescued?: (newStreak: number) => void;
}

export default function StreakRescueBanner({ currentStreak, onRescued }: Props) {
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

    // Sadece streak 0 olduğunda göster
    if (currentStreak > 0 && !result) return null;

    const handleRescue = async () => {
        setLoading(true);
        try {
            const supabase = createClient();
            const { data, error } = await supabase.rpc('rescue_streak');

            if (error) {
                setResult({ success: false, message: error.message });
                return;
            }

            if (data?.success) {
                setResult({ success: true, message: `Serin geri geldi: ${data.restored_to} gün! 🔥` });
                onRescued?.(data.restored_to);
            } else {
                const reason = data?.reason;
                const messages: Record<string, string> = {
                    already_has_streak: 'Zaten aktif serin var!',
                    no_previous_streak: 'Kurtarılacak seri bulunamadı.',
                    rescue_used_this_month: `Bu ay hakkını kullandın. Sonraki: ${data?.next_available?.split('T')[0] || 'gelecek ay'}`,
                    streak_too_old: 'Seri 48 saatten eski, kurtarılamaz.',
                };
                setResult({ success: false, message: messages[reason] || 'Kurtarma başarısız.' });
            }
        } catch (err) {
            setResult({ success: false, message: (err as Error).message });
        } finally {
            setLoading(false);
        }
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: -20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.95 }}
                className="mx-6 mt-4 rounded-2xl overflow-hidden"
            >
                <div className="bg-gradient-to-r from-red-500/20 via-orange-500/15 to-yellow-500/20 backdrop-blur-xl border border-red-500/20 rounded-2xl p-4">
                    {result ? (
                        // Sonuç mesajı
                        <div className="flex items-center gap-3">
                            <span className="text-2xl">{result.success ? '🔥' : '😔'}</span>
                            <p className={`text-sm font-medium ${result.success ? 'text-green-400' : 'text-red-300'}`}>
                                {result.message}
                            </p>
                        </div>
                    ) : (
                        // Kurtarma butonu
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                                    <span className="text-xl">💔</span>
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-white">Serin Kırıldı!</p>
                                    <p className="text-xs text-slate-400">Ayda 1 kurtarma hakkın var</p>
                                </div>
                            </div>
                            <button
                                onClick={handleRescue}
                                disabled={loading}
                                className="px-4 py-2 bg-gradient-to-r from-orange-500 to-yellow-500 text-black font-bold text-xs rounded-full 
                                    shadow-lg shadow-orange-500/20 hover:scale-105 transition-transform uppercase tracking-wider
                                    disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? (
                                    <div className="w-4 h-4 rounded-full border-2 border-black/30 border-t-black animate-spin" />
                                ) : (
                                    'Kurtarma Hakkı'
                                )}
                            </button>
                        </div>
                    )}
                </div>
            </motion.div>
        </AnimatePresence>
    );
}
