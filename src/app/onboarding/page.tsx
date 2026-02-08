'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import { AVATARS } from '@/lib/constants';
import { motion, AnimatePresence } from 'framer-motion';

const DURATIONS = [
  { value: 25, label: '25 dk', description: 'Klasik Pomodoro' },
  { value: 50, label: '50 dk', description: 'Derin odak' },
] as const;

type Background = 'silence' | 'lofi' | 'classical';

const BACKGROUNDS: { value: Background; label: string; description: string }[] = [
  { value: 'silence', label: 'Sessiz', description: 'Tam sessizlik' },
  { value: 'lofi', label: 'Lofi', description: 'Yumusak ritim' },
  { value: 'classical', label: 'Klasik', description: 'Düsük tempolu' },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1); // 1: Tanisma, 2: Tercihler
  const [selectedAvatar, setSelectedAvatar] = useState(1);
  const [name, setName] = useState('');
  const [duration, setDuration] = useState(25);
  const [background, setBackground] = useState<Background>('lofi');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleComplete = async () => {
    if (!name.trim()) return;
    setIsSubmitting(true);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const { data: existing } = await supabase
        .from('users')
        .select('metadata')
        .eq('id', user.id)
        .maybeSingle();

      const metadata = (existing?.metadata ?? {}) as Record<string, unknown>;
      const updatedMetadata = {
        ...metadata,
        focus_preset: {
          duration,
          background,
        },
      };

      await supabase
        .from('users')
        .upsert({
          id: user.id,
          email: user.email ?? '',
          name: name.trim(),
          avatar_id: selectedAvatar,
          music_preference: background,
          metadata: updatedMetadata,
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
              <h2 className="text-2xl font-bold text-white mb-2">Seni taniyalim</h2>
              <p className="text-gray-400 mb-6">Bu ekran senin için.</p>

              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ismin veya takma adin"
                maxLength={20}
                className="w-full bg-white/10 text-white placeholder-gray-500
                           border border-white/20 rounded-xl py-3 px-4
                           focus:outline-none focus:border-[#ffcb77]/50
                           text-center text-lg mb-6"
              />

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
                disabled={!name.trim()}
                className="w-full bg-[#ffcb77] text-[#1a1a2e] font-semibold py-3 rounded-xl
                           disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Devam et
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
              <h2 className="text-2xl font-bold text-white mb-2">Nasil odaklanmak istersin?</h2>
              <p className="text-gray-400 mb-6">Istedigin zaman Profil’den degistirebilirsin.</p>

              {/* Duration */}
              <div className="text-left mb-6">
                <p className="text-gray-500 text-xs uppercase tracking-wide mb-2">Odak süresi</p>
                <div className="grid grid-cols-2 gap-3">
                  {DURATIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setDuration(option.value)}
                      className={`p-4 rounded-xl border text-left transition-all ${
                        duration === option.value
                          ? 'border-[#ffcb77] bg-[#ffcb77]/10'
                          : 'border-white/10 bg-white/5 hover:border-white/30'
                      }`}
                    >
                      <div className="text-white font-semibold">{option.label}</div>
                      <div className="text-gray-500 text-xs">{option.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Background */}
              <div className="text-left mb-8">
                <p className="text-gray-500 text-xs uppercase tracking-wide mb-2">Arka plan</p>
                <div className="grid grid-cols-3 gap-3">
                  {BACKGROUNDS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setBackground(option.value)}
                      className={`p-3 rounded-xl border text-center transition-all ${
                        background === option.value
                          ? 'border-[#ffcb77] bg-[#ffcb77]/10'
                          : 'border-white/10 bg-white/5 hover:border-white/30'
                      }`}
                    >
                      <div className="text-white text-sm font-medium">{option.label}</div>
                      <div className="text-gray-500 text-[10px] mt-1">{option.description}</div>
                    </button>
                  ))}
                </div>
              </div>

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
                  {isSubmitting ? '...' : 'Hazirim'}
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
