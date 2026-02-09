'use client';

import { motion } from 'framer-motion';
import { getTrustLevel } from '@/lib/constants';

interface StatsSummaryCardsProps {
  streak: number;
  trustScore: number;
  completedSessions: number;
}

export function StatsSummaryCards({ streak, trustScore, completedSessions }: StatsSummaryCardsProps) {
  const trustLevel = getTrustLevel(trustScore);

  return (
    <div className="grid grid-cols-3 gap-3 mb-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white/8 backdrop-blur-sm rounded-xl p-3 text-center border border-white/5"
      >
        <p className="text-2xl font-bold text-[#ffcb77]">{streak}</p>
        <p className="text-white/40 text-[10px] mt-1">Günlük Seri</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="bg-white/8 backdrop-blur-sm rounded-xl p-3 text-center border border-white/5"
      >
        <div className="flex items-center justify-center gap-1">
          <span className="text-sm">{trustLevel.emoji}</span>
          <span className="text-2xl font-bold" style={{ color: trustLevel.color }}>
            {trustScore}
          </span>
        </div>
        <p className="text-white/40 text-[10px] mt-1">Güven</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white/8 backdrop-blur-sm rounded-xl p-3 text-center border border-white/5"
      >
        <p className="text-2xl font-bold text-white">{completedSessions}</p>
        <p className="text-white/40 text-[10px] mt-1">Seans</p>
      </motion.div>
    </div>
  );
}
