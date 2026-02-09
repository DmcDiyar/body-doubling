'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import { useAuthStore } from '@/stores/auth-store';
import { motion } from 'framer-motion';
import { CityAtmosphereCard } from '@/components/city/CityAtmosphereCard';
import type { CityData } from '@/components/city/CityAtmosphereCard';
import { CityPrompt } from '@/components/city/CityPrompt';
import { getCityInfo } from '@/lib/city-detection';
import { BottomNav } from '@/components/layout/BottomNav';
import type { User } from '@/types/database';

export default function CityPage() {
  const router = useRouter();
  const { setUser } = useAuthStore();
  const [cities, setCities] = useState<CityData[]>([]);
  const [userCity, setUserCity] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        router.push('/auth');
        return;
      }

      // Get user's city from metadata
      const { data: profile } = await supabase
        .from('users')
        .select('metadata')
        .eq('id', authUser.id)
        .single();

      const meta = profile?.metadata as Record<string, unknown> | null;
      const city = meta?.city as string | null;
      setUserCity(city);

      if (!city) {
        setShowPrompt(true);
      }

      // Load city atmosphere data
      const { data: atmosphereData } = await supabase.rpc('get_city_atmosphere', {
        p_city_id: null,
      });

      if (atmosphereData && Array.isArray(atmosphereData)) {
        // Sort: user's city first, then by today_minutes desc
        const sorted = (atmosphereData as CityData[]).sort((a, b) => {
          if (a.city_id === city) return -1;
          if (b.city_id === city) return 1;
          return b.today_minutes - a.today_minutes;
        });
        setCities(sorted);
      }

      setIsLoading(false);
    }

    load();
  }, [router]);

  const handleCitySelect = async (cityId: string) => {
    const supabase = createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;

    await supabase.rpc('set_user_city', {
      p_user_id: authUser.id,
      p_city_id: cityId,
    });

    setUserCity(cityId);
    setShowPrompt(false);

    // Refresh user data
    const { data: updatedProfile } = await supabase
      .from('users')
      .select('*')
      .eq('id', authUser.id)
      .single();
    if (updatedProfile) {
      setUser(updatedProfile as User);
    }
  };

  const userCityInfo = userCity ? getCityInfo(userCity) : null;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center">
        <div className="text-white/50 text-lg">Yükleniyor...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#1a1a2e] via-[#16213e] to-[#0f3460] px-4 py-8 pb-24">
      <div className="max-w-sm mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <span className="text-4xl mb-2 block">🌆</span>
          <h1 className="text-white text-xl font-semibold mb-1">Şehirler</h1>
          <p className="text-gray-500 text-sm">
            Anonim. Sessiz. Kolektif enerji.
          </p>
        </motion.div>

        {/* User's city banner */}
        {userCityInfo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-white/5 rounded-xl p-3 mb-6 text-center border border-white/10"
          >
            <span className="text-lg">{userCityInfo.emoji}</span>
            <span className="text-gray-300 text-sm ml-2">{userCityInfo.name}</span>
          </motion.div>
        )}

        {/* City Prompt (if no city set) */}
        {showPrompt && (
          <div className="mb-6">
            <CityPrompt
              onSelect={handleCitySelect}
              onSkip={() => setShowPrompt(false)}
            />
          </div>
        )}

        {/* City Atmosphere Cards */}
        {cities.length > 0 ? (
          <div className="space-y-3">
            {cities.map((city, i) => (
              <CityAtmosphereCard
                key={city.city_id}
                city={city}
                isUserCity={city.city_id === userCity}
                index={i}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <span className="text-4xl mb-4 block">🌙</span>
            <p className="text-gray-400 text-sm">Henüz şehir verisi yok.</p>
            <p className="text-gray-600 text-xs mt-1">
              Şehrini seç ve ilk odak seansını başlat.
            </p>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
