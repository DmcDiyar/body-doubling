'use client';

import { motion } from 'framer-motion';
import { useFullscreen } from '@/hooks/useFullscreen';

interface HomeOverlayProps {
  avatarEmoji: string;
  userName: string;
}

export function HomeOverlay({ avatarEmoji, userName }: HomeOverlayProps) {
  const { isFullscreen, isSupported, toggle } = useFullscreen();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex items-center justify-between py-4"
    >
      <div className="flex items-center gap-2">
        <span className="text-2xl">{avatarEmoji}</span>
        <span className="text-white/80 text-sm font-medium">{userName}</span>
      </div>

      <div className="flex items-center gap-2">
        {isSupported && (
          <button
            onClick={toggle}
            className="text-white/40 hover:text-white/70 transition-colors p-2 rounded-lg hover:bg-white/5"
            title={isFullscreen ? 'Tam ekrandan çık' : 'Tam ekran'}
          >
            {isFullscreen ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
              </svg>
            )}
          </button>
        )}
      </div>
    </motion.div>
  );
}
