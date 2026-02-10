'use client';

import { motion } from 'framer-motion';
import { getCityInfo } from '@/lib/city-detection';
import type { CityActivity } from '@/lib/stream-events';

interface MiniStatsProps {
  totalActive: number;
  totalMinutesToday: number;
  userCityName: string | null;
  userCityRank: number | null;
  userCityEmoji: string | null;
  cities: CityActivity[];
}

const RANK_MEDALS = ['🥇', '🥈', '🥉'];

export function MiniStats({
  totalActive,
  totalMinutesToday,
  userCityName,
  userCityRank,
  userCityEmoji,
  cities,
}: MiniStatsProps) {
  // Sort cities by active users for ranking
  const sorted = [...cities]
    .filter((c) => c.active_users > 0 || c.today_minutes > 0)
    .sort((a, b) => b.active_users - a.active_users || b.today_minutes - a.today_minutes);

  const top3 = sorted.slice(0, 3);
  const totalCities = sorted.length;

  return (
    <motion.div
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      className="absolute top-3 right-3 z-10 bg-black/60 backdrop-blur-md rounded-xl p-3 border border-white/10 w-[180px]"
    >
      <div className="space-y-2">
        {/* Header stats row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-white font-semibold text-sm tabular-nums">{totalActive}</span>
            <span className="text-white/30 text-[9px]">aktif</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-white/50 text-[9px]">⏱️</span>
            <span className="text-white/50 text-[10px] tabular-nums">
              {totalMinutesToday >= 60
                ? `${Math.floor(totalMinutesToday / 60)}s ${totalMinutesToday % 60}dk`
                : `${totalMinutesToday}dk`}
            </span>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-white/5" />

        {/* City ranking */}
        {top3.length > 0 && (
          <div className="space-y-1">
            <p className="text-white/25 text-[8px] uppercase tracking-wider font-medium">Sehir Siralamasi</p>
            {top3.map((city, i) => {
              const info = getCityInfo(city.city_id);
              const isUserCity = info?.name === userCityName;
              return (
                <div
                  key={city.city_id}
                  className={`flex items-center justify-between ${isUserCity ? 'bg-[#ffcb77]/10 -mx-1 px-1 rounded' : ''}`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[10px] w-4 text-center flex-shrink-0">{RANK_MEDALS[i]}</span>
                    <span className={`text-[10px] truncate ${isUserCity ? 'text-[#ffcb77] font-medium' : 'text-white/60'}`}>
                      {info?.name ?? city.city_id}
                    </span>
                  </div>
                  <span className={`text-[10px] tabular-nums flex-shrink-0 ml-1 ${isUserCity ? 'text-[#ffcb77]' : 'text-white/40'}`}>
                    {city.active_users} kisi
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* User city — shown when NOT in top 3 */}
        {userCityName && userCityRank && userCityRank > 3 && (
          <>
            <div className="flex items-center gap-1 opacity-30">
              <span className="text-[8px] text-white/40">···</span>
            </div>
            <div className="flex items-center justify-between bg-[#ffcb77]/10 -mx-1 px-1 rounded">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[10px] w-4 text-center flex-shrink-0 text-white/40">{userCityRank}.</span>
                <span className="text-[10px] text-[#ffcb77] font-medium truncate">
                  {userCityEmoji} {userCityName}
                </span>
              </div>
              <span className="text-[10px] text-[#ffcb77] tabular-nums flex-shrink-0 ml-1">
                {cities.find((c) => getCityInfo(c.city_id)?.name === userCityName)?.active_users ?? 0} kisi
              </span>
            </div>
          </>
        )}

        {/* User city — shown when in top 3 or no ranking */}
        {userCityName && (!userCityRank || userCityRank <= 3) && userCityRank !== null && (
          <div className="flex items-center gap-1.5">
            <span className="text-[9px]">📍</span>
            <span className="text-[#ffcb77] text-[10px] font-medium">{userCityEmoji} {userCityName}</span>
            <span className="text-white/20 text-[9px]">{userCityRank}. sira</span>
          </div>
        )}

        {/* FOMO trigger — total active cities */}
        {totalCities > 3 && (
          <p className="text-white/15 text-[8px] text-center">
            {totalCities} sehirde aktif odak
          </p>
        )}
      </div>
    </motion.div>
  );
}
