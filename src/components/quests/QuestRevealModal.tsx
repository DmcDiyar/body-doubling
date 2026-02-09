'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';

interface QuestRevealModalProps {
  questType: 'daily' | 'weekly';
  teaser: string;
  hint: string;
  onReveal: () => void;
  onCancel: () => void;
}

/**
 * "Geri dönüş yok" — irreversible quest reveal modal.
 * Mystery icon animation, atmospheric text, confirmation button.
 */
export function QuestRevealModal({
  questType,
  teaser,
  hint,
  onReveal,
  onCancel,
}: QuestRevealModalProps) {
  const [confirming, setConfirming] = useState(false);

  const handleReveal = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    onReveal();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      onClick={onCancel}
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="w-full max-w-sm bg-gradient-to-b from-[#1a1a2e] to-[#0f3460] rounded-3xl p-6 border border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mystery Icon */}
        <motion.div
          animate={{
            rotate: [0, 5, -5, 0],
            scale: [1, 1.05, 1],
          }}
          transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
          className="text-center mb-6"
        >
          <span className="text-5xl">❓</span>
        </motion.div>

        {/* Quest type label */}
        <p className="text-gray-500 text-xs uppercase tracking-wide text-center mb-2">
          {questType === 'daily' ? 'Günlük Görev' : 'Haftalık Görev'}
        </p>

        {/* Teaser */}
        <p className="text-white text-lg font-medium text-center mb-2">
          {teaser}
        </p>

        {/* Hint */}
        <p className="text-gray-500 text-sm text-center mb-6">
          İpucu: {hint}
        </p>

        {/* Warning */}
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-6">
          <p className="text-red-400/80 text-xs text-center">
            Geri dönüş yok. Görev bir kez açıldığında gizlenemez.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={handleReveal}
            className={`w-full py-3 rounded-xl font-semibold text-sm transition-all ${
              confirming
                ? 'bg-[#ffcb77] text-[#1a1a2e]'
                : 'bg-white/10 text-white border border-white/20'
            }`}
          >
            {confirming ? 'Evet, Aç!' : 'Görevi Aç'}
          </motion.button>

          <button
            onClick={onCancel}
            className="text-gray-500 text-sm hover:text-gray-300 transition-colors"
          >
            Şimdi Değil
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
