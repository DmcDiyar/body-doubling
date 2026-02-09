'use client';

import { motion } from 'framer-motion';

interface MiniStatsProps {
  totalActive: number;
  totalMinutesToday: number;
  userCityName: string | null;
  userCityRank: number | null;
  userCityEmoji: string | null;
}

/**
 * Mini stats — top-right of map panel.
 * Contextual info, NOT a dashboard.
 * Updates on events only, smooth number transitions.
 */
export function MiniStats({
  totalActive,
  totalMinutesToday,
  userCityName,
  userCityRank,
  userCityEmoji,
}: MiniStatsProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      className="absolute top-3 right-3 z-10 bg-black/50 backdrop-blur-md rounded-xl p-3 border border-white/10 w-[160px]"
    >
      <div className="space-y-2.5">
        {/* Active users */}
        <div className="flex items-center gap-2">
          <span className="text-sm">👥</span>
          <div>
            <p className="text-white font-semibold text-sm tabular-nums">{totalActive}</p>
            <p className="text-white/30 text-[9px]">Aktif Kullanıcı</p>
          </div>
        </div>

        {/* Total minutes today */}
        <div className="flex items-center gap-2">
          <span className="text-sm">⏱️</span>
          <div>
            <p className="text-white font-semibold text-sm tabular-nums">
              {totalMinutesToday >= 60
                ? `${Math.floor(totalMinutesToday / 60)}s ${totalMinutesToday % 60}dk`
                : `${totalMinutesToday}dk`}
            </p>
            <p className="text-white/30 text-[9px]">Bugün Toplam</p>
          </div>
        </div>

        {/* User's city */}
        {userCityName && (
          <div className="flex items-center gap-2">
            <span className="text-sm">📍</span>
            <div>
              <p className="text-[#ffcb77] font-medium text-xs">
                {userCityEmoji} {userCityName}
              </p>
              {userCityRank && (
                <p className="text-white/30 text-[9px]">{userCityRank}. sıra</p>
              )}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
