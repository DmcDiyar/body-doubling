'use client';

import { motion } from 'framer-motion';

interface MissedQuestGhostProps {
  questId: string;
  missedAt: string;
}

/**
 * Faded ghost card for missed quests.
 * Shows what was missed without details — atmospheric, not punishing.
 */
export function MissedQuestGhost({ questId, missedAt }: MissedQuestGhostProps) {
  const daysSince = Math.floor(
    (Date.now() - new Date(missedAt).getTime()) / (1000 * 60 * 60 * 24)
  );

  // Generic quest type label
  const isDaily = questId.startsWith('daily_');
  const typeLabel = isDaily ? 'Günlük' : 'Haftalık';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 0.4 }}
      className="bg-white/3 rounded-2xl p-3 border border-white/5"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-gray-600 text-lg">👻</span>
          <div>
            <p className="text-gray-600 text-xs">{typeLabel} görev</p>
            <p className="text-gray-700 text-xs">
              {daysSince === 0 ? 'Bugün' : daysSince === 1 ? 'Dün' : `${daysSince} gün önce`} kaçırıldı
            </p>
          </div>
        </div>
        <span className="text-gray-700 text-xs">kaçırıldı</span>
      </div>
    </motion.div>
  );
}
