'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { COPY } from '@/lib/constants';

export default function LandingPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#1a1a2e] via-[#16213e] to-[#0f3460] flex flex-col items-center justify-center px-4 relative overflow-hidden">

      {/* Ambient floating orbs */}
      <div className="absolute inset-0 pointer-events-none">
        <motion.div
          className="absolute w-64 h-64 bg-[#ffcb77]/5 rounded-full blur-3xl"
          style={{ top: '20%', left: '10%' }}
          animate={{ x: [0, 30, 0], y: [0, -20, 0] }}
          transition={{ repeat: Infinity, duration: 8, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute w-48 h-48 bg-[#0f3460]/50 rounded-full blur-3xl"
          style={{ bottom: '20%', right: '10%' }}
          animate={{ x: [0, -20, 0], y: [0, 30, 0] }}
          transition={{ repeat: Infinity, duration: 10, ease: 'easeInOut' }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 text-center max-w-md">

        {/* Logo / Title */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-3 tracking-tight">
            {COPY.AUTH_TITLE}
          </h1>
          <p className="text-[#ffcb77] text-lg font-medium">
            {COPY.AUTH_SUBTITLE}
          </p>
        </motion.div>

        {/* Features */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.8 }}
          className="mt-12 space-y-4"
        >
          {[
            { emoji: '🎭', text: 'Avatar modu — Kamera yok, mikrofon yok' },
            { emoji: '🤝', text: 'Sessiz eşlik — Birlikte ama bağımsız' },
            { emoji: '⏱️', text: '15, 25 veya 50 dakika odak seansları' },
            { emoji: '🌟', text: 'Güven skoru ve seviye sistemi' },
          ].map((feature, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.6 + i * 0.15 }}
              className="flex items-center gap-3 text-left bg-white/5 rounded-xl px-4 py-3"
            >
              <span className="text-xl">{feature.emoji}</span>
              <span className="text-gray-300 text-sm">{feature.text}</span>
            </motion.div>
          ))}
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2 }}
          className="mt-12"
        >
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => router.push('/auth')}
            className="w-full max-w-xs bg-[#ffcb77] text-[#1a1a2e] font-semibold py-4 rounded-xl text-lg shadow-lg shadow-[#ffcb77]/20 hover:shadow-[#ffcb77]/30 transition-shadow"
          >
            Hemen Başla
          </motion.button>
        </motion.div>

        {/* Tagline */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.6 }}
          className="mt-8 text-gray-600 text-xs"
        >
          Presence over Productivity
        </motion.p>
      </div>
    </div>
  );
}
