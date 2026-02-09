'use client';

import { motion } from 'framer-motion';

interface QuestPillProps {
  completed: number;
  total: number;
}

export function QuestPill({ completed, total }: QuestPillProps) {
  if (total <= 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.1 }}
      className="inline-flex items-center gap-1.5 bg-purple-500/15 border border-purple-500/25 rounded-full px-3 py-1.5 backdrop-blur-sm"
    >
      <span className="text-sm">✨</span>
      <span className="text-purple-300 text-xs font-medium">{completed}/{total} görev</span>
    </motion.div>
  );
}
