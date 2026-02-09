'use client';

import { motion } from 'framer-motion';
import { getCityInfo, getCityMoodText, getMoodEmoji } from '@/lib/city-detection';

export interface CityData {
  city_id: string;
  today_minutes: number;
  yesterday_minutes: number;
  week_minutes: number;
  active_now: number;
  mood: string;
}

interface CityAtmosphereCardProps {
  city: CityData;
  isUserCity: boolean;
  index: number;
}

/**
 * Atmospheric city card — no scores, just mood and vibe.
 */
export function CityAtmosphereCard({ city, isUserCity, index }: CityAtmosphereCardProps) {
  const info = getCityInfo(city.city_id);
  if (!info) return null;

  const moodText = getCityMoodText(city.mood, info.name);
  const moodEmoji = getMoodEmoji(city.mood);

  const moodBorderColor = {
    rising: 'border-[#ffcb77]/30',
    quiet: 'border-blue-500/20',
    awakening: 'border-purple-500/20',
    steady: 'border-white/10',
  }[city.mood] || 'border-white/10';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08 }}
      className={`rounded-2xl p-4 border ${moodBorderColor} ${
        isUserCity ? 'bg-white/8' : 'bg-white/3'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">{info.emoji}</span>
          <span className="text-white font-medium">{info.name}</span>
          {isUserCity && (
            <span className="text-xs text-[#ffcb77] bg-[#ffcb77]/10 px-2 py-0.5 rounded-full">
              senin şehrin
            </span>
          )}
        </div>
        <span className="text-lg">{moodEmoji}</span>
      </div>

      <p className="text-gray-400 text-sm leading-relaxed">{moodText}</p>

      {city.active_now > 0 && (
        <p className="text-gray-600 text-xs mt-2">
          Şu an {city.active_now} kişi odaklanıyor
        </p>
      )}
    </motion.div>
  );
}
