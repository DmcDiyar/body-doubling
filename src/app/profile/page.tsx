'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import { AVATARS } from '@/lib/constants';
import type { MusicPreference, User } from '@/types/database';
import { motion } from 'framer-motion';

const DURATIONS = [
  { value: 25, label: '25 dk', description: 'Klasik Pomodoro' },
  { value: 50, label: '50 dk', description: 'Derin odak' },
] as const;

const BACKGROUNDS: { value: MusicPreference; label: string; description: string }[] = [
  { value: 'silence', label: 'Sessiz', description: 'Tam sessizlik' },
  { value: 'lofi', label: 'Lofi', description: 'Yumuşak ritim' },
  { value: 'classical', label: 'Klasik', description: 'Düşük tempolu' },
];

export default function ProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(1);
  const [duration, setDuration] = useState(25);
  const [background, setBackground] = useState<MusicPreference>('lofi');

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/auth');
        return;
      }

      const { data: profile } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profile) {
        const u = profile as User;
        setName(u.name || '');
        setSelectedAvatar(u.avatar_id || 1);
        setBackground(u.music_preference || 'lofi');

        const preset = (u.metadata as { focus_preset?: { duration?: number } })?.focus_preset;
        if (preset?.duration) setDuration(preset.duration);
      }

      setLoading(false);
    };

    load();
  }, [router]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

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
      .update({
        name: name.trim(),
        avatar_id: selectedAvatar,
        music_preference: background,
        metadata: updatedMetadata,
      })
      .eq('id', user.id);

    setSaving(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#1a1a2e] via-[#16213e] to-[#0f3460] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#ffcb77]/30 border-t-[#ffcb77] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#1a1a2e] via-[#16213e] to-[#0f3460] px-4 py-8">
      <div className="max-w-sm mx-auto">
        <div className="mb-8">
          <h1 className="text-white text-xl font-bold mb-1">Profilim</h1>
          <p className="text-gray-500 text-sm">Sana özel ayarlar</p>
        </div>

        {/* Profile = Ben */}
        <div className="mb-8">
          <p className="text-gray-500 text-xs uppercase tracking-wide mb-2">Ben</p>

          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="İsmin veya takma adın"
            maxLength={20}
            className="w-full bg-white/10 text-white placeholder-gray-500
                       border border-white/20 rounded-xl py-3 px-4
                       focus:outline-none focus:border-[#ffcb77]/50
                       text-center text-lg mb-6"
          />

          <div className="grid grid-cols-2 gap-4">
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
        </div>

        {/* Settings = Nasıl çalışıyor */}
        <div className="mb-8">
          <p className="text-gray-500 text-xs uppercase tracking-wide mb-2">Nasıl çalışıyor</p>

          <div className="mb-6">
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

          <div>
            <p className="text-gray-500 text-xs uppercase tracking-wide mb-2">Müzik tercihi</p>
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
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => router.push('/dashboard')}
            className="px-6 py-3 rounded-xl text-gray-400 hover:text-white transition-colors"
          >
            Geri
          </button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="flex-1 bg-[#ffcb77] text-[#1a1a2e] font-semibold py-3 rounded-xl
                       disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </motion.button>
        </div>
      </div>
    </div>
  );
}