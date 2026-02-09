'use client';

import { motion } from 'framer-motion';

interface FomoMessageProps {
  message: string;
  missedCount: number;
}

/**
 * Dashboard FOMO banner — shows a subtle message when user has missed quests.
 * Glowing amber border with atmospheric text.
 */
export function FomoMessage({ message, missedCount }: FomoMessageProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-2xl p-4 mb-4 border border-[#ffcb77]/20 bg-[#ffcb77]/5"
    >
      {/* Subtle glow */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#ffcb77]/5 via-transparent to-[#ffcb77]/5 animate-pulse" />

      <div className="relative">
        <p className="text-[#ffcb77]/80 text-sm italic leading-relaxed">
          &ldquo;{message}&rdquo;
        </p>
        {missedCount > 1 && (
          <p className="text-gray-600 text-xs mt-2">
            {missedCount} görev geride kaldı
          </p>
        )}
      </div>
    </motion.div>
  );
}
