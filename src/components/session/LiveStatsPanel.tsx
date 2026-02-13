'use client';

import { motion } from 'framer-motion';
import { useLiveStats } from '@/hooks/useRitualFlow';

export default function LiveStatsPanel({ selectedDuration }: { selectedDuration?: number }) {
    const { stats } = useLiveStats(10000);

    if (!stats) return null;

    const waitingForDuration = selectedDuration
        ? stats.waiting[String(selectedDuration) as keyof typeof stats.waiting] ?? 0
        : 0;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="w-full bg-white/[0.03] border border-[#eea62b]/10 rounded-xl p-4 space-y-2.5"
        >
            {/* FOMO: Active users */}
            <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 bg-green-500 rounded-full inline-block animate-pulse" />
                <span className="text-white/90 text-sm font-medium">
                    <strong className="text-[#eea62b]">{stats.activeUsers}</strong> kişi şu an çalışıyor
                </span>
            </div>

            {/* FOMO: Today's sessions */}
            <div className="flex items-center gap-2.5">
                <span className="material-icons-round text-[#eea62b] text-base">bolt</span>
                <span className="text-white/70 text-sm">
                    Bugün <strong className="text-[#eea62b]">{stats.todaySessions}</strong> seans tamamlandı
                </span>
            </div>

            {/* FOMO: Waiting for selected duration */}
            {selectedDuration && waitingForDuration > 0 && (
                <div className="flex items-center gap-2.5">
                    <span className="material-icons-round text-[#eea62b] text-base">group</span>
                    <span className="text-white/70 text-sm">
                        <strong className="text-[#eea62b]">{selectedDuration}dk</strong>&apos;da{' '}
                        <strong className="text-[#eea62b]">{waitingForDuration}</strong> kişi bekliyor
                    </span>
                </div>
            )}
        </motion.div>
    );
}
