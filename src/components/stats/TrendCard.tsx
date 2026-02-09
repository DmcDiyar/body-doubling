'use client';

import { motion } from 'framer-motion';
import type { TrendItem } from '@/lib/self-competition';
import { getTrendArrow } from '@/lib/self-competition';

interface TrendCardProps {
  item: TrendItem;
  index: number;
}

/**
 * Single trend metric card.
 * Shows direction arrow + label + insight.
 * Non-judgmental color scheme: warm amber for up, cool blue for down, gray for same.
 */
export function TrendCard({ item, index }: TrendCardProps) {
  const arrow = getTrendArrow(item.trend);

  const trendColor = {
    up: 'text-[#ffcb77]',
    down: 'text-blue-400',
    same: 'text-gray-500',
    new: 'text-purple-400',
  }[item.trend];

  const trendBg = {
    up: 'bg-[#ffcb77]/10 border-[#ffcb77]/20',
    down: 'bg-blue-500/10 border-blue-500/20',
    same: 'bg-white/5 border-white/10',
    new: 'bg-purple-500/10 border-purple-500/20',
  }[item.trend];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className={`rounded-2xl p-4 border ${trendBg}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-gray-400 text-sm">{item.label}</span>
        <span className={`text-xl font-bold ${trendColor}`}>{arrow}</span>
      </div>

      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-white text-2xl font-bold">{item.current}</span>
        <span className="text-gray-500 text-sm">{item.unit}</span>
      </div>

      <p className="text-gray-500 text-xs leading-relaxed">{item.insight}</p>
    </motion.div>
  );
}
