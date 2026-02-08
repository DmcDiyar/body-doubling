'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import { AVATARS, COPY } from '@/lib/constants';
import { motion, AnimatePresence } from 'framer-motion';

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1); // 1: Avatar, 2: Hedef
  const [selectedAvatar, setSelectedAvatar] = useState(1);
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleComplete = async () => {
    if (!name.trim()) return;
    setIsSubmitting(true);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      await supabase
        .from('users')
        .upsert({
          id: user.id,
          email: user.email ?? '',
          name: name.trim(),
          avatar_id: selectedAvatar,
        });
    }

    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#1a1a2e] via-[#16213e] to-[#0f3460] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Step indicator */}
        <div className="flex justify-center gap-2 mb-8">
          <div className={`w-2 h-2 rounded-full ${step === 1 ? 'bg-[#ffcb77]' : 'bg-white/30'}`} />
          <div className={`w-2 h-2 rounded-full ${step === 2 ? 'bg-[#ffcb77]' : 'bg-white/30'}`} />
        </div>

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="text-center"
            >
              <h2 className="text-2xl font-bold text-white mb-2">
                {COPY.ONBOARDING_WELCOME}
              </h2>
              <p className="text-gray-400 mb-8">
                {COPY.ONBOARDING_AVATAR}
              </p>

              {/* Avatar grid */}
              <div className="grid grid-cols-2 gap-4 mb-8">
                {AVATARS.map((avatar) => (
                  <motion.button
                    key={avatar.id}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setSelectedAvatar(avatar.id)}
                    className={`
                      p-6 rounded-2xl text-4xl transition-all
                      ${selectedAvatar === avatar.id
                        ? 'bg-[#ffcb77]/20 border-2 border-[#ffcb77] shadow-lg shadow-[#ffcb77]/10'
                        : 'bg-white/5 border-2 border-transparent hover:bg-white/10'
                      }
                    `}
                  >
                    <span className="text-5xl">{avatar.emoji}</span>
                    <p className="text-white text-sm mt-2">{avatar.name}</p>
                  </motion.button>
                ))}
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setStep(2)}
                className="w-full bg-[#ffcb77] text-[#1a1a2e] font-semibold py-3 rounded-xl"
              >
                Devam Et
              </motion.button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="text-center"
            >
              <div className="text-5xl mb-4">
                {AVATARS.find(a => a.id === selectedAvatar)?.emoji}
              </div>

              <h2 className="text-2xl font-bold text-white mb-2">
                Sana ne diyelim?
              </h2>
              <p className="text-gray-400 mb-8">
                Ortağın seni bu isimle görecek.
              </p>

              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="İsmin veya takma adın"
                maxLength={20}
                className="w-full bg-white/10 text-white placeholder-gray-500
                           border border-white/20 rounded-xl py-3 px-4
                           focus:outline-none focus:border-[#ffcb77]/50
                           text-center text-lg mb-8"
              />

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="px-6 py-3 rounded-xl text-gray-400 hover:text-white transition-colors"
                >
                  Geri
                </button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleComplete}
                  disabled={!name.trim() || isSubmitting}
                  className="flex-1 bg-[#ffcb77] text-[#1a1a2e] font-semibold py-3 rounded-xl
                             disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? '...' : COPY.ONBOARDING_START}
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
