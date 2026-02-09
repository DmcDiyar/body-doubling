'use client';

import { motion } from 'framer-motion';

interface InsightMessageProps {
  message: string;
}

/**
 * Overall insight banner — atmospheric, non-judgmental.
 */
export function InsightMessage({ message }: InsightMessageProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.5 }}
      className="bg-white/3 rounded-2xl p-4 border border-white/5 text-center"
    >
      <p className="text-gray-400 text-sm italic leading-relaxed">
        &ldquo;{message}&rdquo;
      </p>
    </motion.div>
  );
}
