'use client';

import { motion } from 'framer-motion';

interface CityPillProps {
  cityEmoji: string;
  cityName: string;
  activeCount: number;
}

export function CityPill({ cityEmoji, cityName, activeCount }: CityPillProps) {
  if (activeCount <= 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.2 }}
      className="inline-flex items-center gap-1.5 bg-emerald-500/15 border border-emerald-500/25 rounded-full px-3 py-1.5 backdrop-blur-sm"
    >
      <span className="text-sm">{cityEmoji}</span>
      <span className="text-emerald-300 text-xs font-medium">{cityName} aktif</span>
    </motion.div>
  );
}
