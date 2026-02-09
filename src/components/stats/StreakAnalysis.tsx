'use client';

import { motion } from 'framer-motion';

interface StreakAnalysisProps {
  currentStreak: number;
  longestStreak: number;
}

export function StreakAnalysis({ currentStreak, longestStreak }: StreakAnalysisProps) {
  if (longestStreak <= 0 && currentStreak <= 0) return null;

  const ratio = longestStreak > 0 ? currentStreak / longestStreak : 0;
  const progressPercent = Math.min(ratio * 100, 100);

  let message = '';
  if (currentStreak >= longestStreak && longestStreak > 0) {
    message = 'Rekorunu kırdın! Devam et.';
  } else if (ratio >= 0.8) {
    message = 'Rekoruna çok yakınsın.';
  } else if (ratio >= 0.5) {
    message = 'Yolun yarısındasın.';
  } else if (currentStreak > 0) {
    message = 'Her gün bir adım daha.';
  } else {
    message = 'Yeni bir başlangıç her zaman güzel.';
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35 }}
      className="bg-white/5 backdrop-blur-sm rounded-xl p-4 mb-6 border border-white/5"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-white/50 text-xs">Seri Analizi</span>
        <span className="text-white/30 text-[10px]">
          {currentStreak} / {longestStreak} gün
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-white/5 rounded-full mb-2 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${progressPercent}%` }}
          transition={{ duration: 1, delay: 0.5 }}
          className="h-full bg-[#ffcb77] rounded-full"
        />
      </div>

      <p className="text-white/40 text-xs">{message}</p>
    </motion.div>
  );
}
