'use client';

import { motion } from 'framer-motion';

interface StreakPillProps {
  streak: number;
}

export function StreakPill({ streak }: StreakPillProps) {
  if (streak <= 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      className="inline-flex items-center gap-1.5 bg-[#ffcb77]/15 border border-[#ffcb77]/25 rounded-full px-3 py-1.5 backdrop-blur-sm"
    >
      <span className="text-sm">🔥</span>
      <span className="text-[#ffcb77] text-xs font-medium">{streak} gün</span>
    </motion.div>
  );
}
