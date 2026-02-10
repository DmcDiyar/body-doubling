'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { createClient } from '@/lib/supabase-client';
import { useAuthStore } from '@/stores/auth-store';
import { CityPrompt } from '@/components/city/CityPrompt';
import { VideoScene } from '@/components/stream/VideoScene';
import { BottomNav } from '@/components/layout/BottomNav';
import type { User } from '@/types/database';

export default function CityPage() {
  const router = useRouter();
  const { user, setUser } = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);
  const [showCityPrompt, setShowCityPrompt] = useState(false);
  const [focusMode, setFocusMode] = useState(false);

  // ─── Initial load: user profile + city ───
  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { router.push('/auth'); return; }

      if (!user) {
        const { data: profile } = await supabase
          .from('users').select('*').eq('id', authUser.id).maybeSingle();
        if (profile) setUser(profile as User);
      }

      const { data: profileData } = await supabase
        .from('users').select('metadata').eq('id', authUser.id).single();
      const meta = profileData?.metadata as Record<string, unknown> | null;
      const city = meta?.city as string | null;
      if (!city) setShowCityPrompt(true);

      setIsLoading(false);
    }
    load();
  }, [router, setUser, user]);

  // ─── City select handler ───
  const handleCitySelect = async (cityId: string) => {
    const supabase = createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;

    await supabase.rpc('set_user_city', {
      p_user_id: authUser.id,
      p_city_id: cityId,
    });

    setShowCityPrompt(false);

    const { data: updatedProfile } = await supabase
      .from('users').select('*').eq('id', authUser.id).single();
    if (updatedProfile) setUser(updatedProfile as User);
  };

  // ─── Loading state ───
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F4F5F7] flex items-center justify-center">
        <div className="text-[#3C3228]/40 text-lg">Yukleniyor...</div>
      </div>
    );
  }

  // ─── City prompt ───
  if (showCityPrompt) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#F4F5F7] via-[#EDE8E0] to-[#F4F5F7] flex items-center justify-center px-4 pb-24">
        <div className="w-full max-w-sm">
          <CityPrompt
            onSelect={handleCitySelect}
            onSkip={() => setShowCityPrompt(false)}
          />
        </div>
        <BottomNav />
      </div>
    );
  }

  // ─── FOCUS MODE: Fullscreen video ───
  if (focusMode) {
    return (
      <div className="fixed inset-0 z-50 bg-black">
        <VideoScene focusMode={true} />

        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          onClick={() => setFocusMode(false)}
          className="absolute top-6 right-6 z-[60] px-4 py-2 rounded-full bg-[#D4956B] text-white text-sm font-semibold shadow-lg hover:scale-105 transition-transform"
        >
          Focustan Cik
        </motion.button>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[60]"
        >
          <p className="text-white/20 text-xs">Odaklan. Sadece sen ve zamanin.</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F5F7] pb-20">
      {/* ===== DESKTOP ===== */}
      <div className="hidden md:flex h-screen">
        <div className="relative w-full h-full">
          <VideoScene focusMode={false} />

          <button
            onClick={() => setFocusMode(true)}
            className="absolute top-4 right-4 z-20 px-3 py-1.5 rounded-full text-xs font-medium transition-all bg-black/40 backdrop-blur-md text-white/60 hover:text-white/90 border border-white/10 hover:bg-black/60"
          >
            Focus Mode
          </button>
        </div>
      </div>

      {/* ===== MOBILE ===== */}
      <div className="md:hidden flex flex-col h-screen">
        <div className="relative flex-1">
          <VideoScene focusMode={false} />

          <button
            onClick={() => setFocusMode(true)}
            className="absolute top-3 right-3 z-20 px-2.5 py-1 rounded-full text-[10px] font-medium transition-all bg-black/40 backdrop-blur-md text-white/60 border border-white/10"
          >
            Focus
          </button>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
