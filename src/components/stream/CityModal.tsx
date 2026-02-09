'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { getCityInfo } from '@/lib/city-detection';
import { createClient } from '@/lib/supabase-client';
import type { StreamEvent } from '@/lib/stream-events';
import { EVENT_ICON } from '@/lib/stream-events';

interface CityLeaderboardEntry {
  user_name: string;
  total_minutes: number;
  sessions: number;
  rank: number;
}

interface CityModalProps {
  cityId: string;
  activeUsers: number;
  todayMinutes: number;
  events: StreamEvent[];
  onClose: () => void;
}

/**
 * City Modal — centered overlay.
 * Shows city leaderboard, recent events, city chat.
 * Power user feature, not main flow.
 */
export function CityModal({
  cityId,
  activeUsers,
  todayMinutes,
  events,
  onClose,
}: CityModalProps) {
  const info = getCityInfo(cityId);
  const [leaderboard, setLeaderboard] = useState<CityLeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load city leaderboard
  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data } = await supabase.rpc('get_city_leaderboard', {
        p_city_id: cityId,
      });
      if (data && Array.isArray(data)) {
        setLeaderboard(data as CityLeaderboardEntry[]);
      }
      setIsLoading(false);
    }
    load();
  }, [cityId]);

  // Close on ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // City-filtered events
  const cityEvents = events
    .filter((e) => e.city_id === cityId)
    .slice(-10);

  if (!info) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: 'spring', damping: 25 }}
        onClick={(e) => e.stopPropagation()}
        className="relative bg-[#1a1a2e]/95 backdrop-blur-xl rounded-2xl border border-white/10 w-full max-w-md max-h-[80vh] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{info.emoji}</span>
            <div>
              <h2 className="text-white text-lg font-bold">{info.name}</h2>
              <p className="text-white/40 text-xs">
                {activeUsers} aktif &middot; {todayMinutes}dk bugün
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white/70 transition-colors text-xl p-1"
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[60vh] p-4 space-y-4">
          {/* Leaderboard */}
          <div>
            <p className="text-white/40 text-xs uppercase tracking-wide mb-2">
              Bu Haftanın Liderleri
            </p>
            {isLoading ? (
              <div className="text-white/20 text-xs py-4 text-center">Yükleniyor...</div>
            ) : leaderboard.length > 0 ? (
              <div className="space-y-1">
                {leaderboard.map((entry, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-white/30 text-xs w-5 text-right">
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
                      </span>
                      <span className="text-white text-sm">{entry.user_name}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-white/60 text-xs">
                        {entry.total_minutes}dk
                      </span>
                      <span className="text-white/20 text-[10px] ml-2">
                        {entry.sessions} seans
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-white/20 text-xs py-3 text-center">
                Henüz liderlik tablosu yok. Sen ilk ol!
              </div>
            )}
          </div>

          {/* Recent Events */}
          <div>
            <p className="text-white/40 text-xs uppercase tracking-wide mb-2">
              Son Olaylar
            </p>
            {cityEvents.length > 0 ? (
              <div className="space-y-1.5">
                {cityEvents.map((event) => (
                  <div
                    key={event.id}
                    className="bg-white/3 rounded-lg px-3 py-2"
                  >
                    <p className="text-white/60 text-xs">
                      <span className="mr-1">{EVENT_ICON[event.type]}</span>
                      {event.message}
                    </p>
                    <p className="text-white/20 text-[9px] mt-0.5">
                      {new Date(event.created_at).toLocaleTimeString('tr-TR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-white/20 text-xs py-3 text-center">
                Henüz olay yok.
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
