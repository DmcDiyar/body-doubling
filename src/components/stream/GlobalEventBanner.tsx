'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase-client';
import type { GlobalEvent } from '@/lib/stream-events';

interface GlobalEventBannerProps {
  /** If we already have active event data, pass it to avoid extra fetch */
  activeEvent?: GlobalEvent | null;
}

/**
 * GlobalEventBanner — shows active global events at top of page.
 * Auto-fetches from get_global_events, subscribes to Realtime.
 * Dismissible, auto-hides when event ends.
 */
export function GlobalEventBanner({ activeEvent: initialEvent }: GlobalEventBannerProps) {
  const [event, setEvent] = useState<GlobalEvent | null>(initialEvent ?? null);
  const [isDismissed, setIsDismissed] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');

  // Fetch active events
  const fetchEvents = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.rpc('get_global_events', {
      p_include_completed: false,
    });

    if (data && Array.isArray(data) && data.length > 0) {
      const active = (data as GlobalEvent[]).find((e) => e.status === 'active');
      if (active) {
        setEvent(active);
        setIsDismissed(false);
        return;
      }
    }
    setEvent(null);
  }, []);

  // Initial fetch + poll every 60s
  useEffect(() => {
    if (!initialEvent) fetchEvents();
    const interval = setInterval(fetchEvents, 60_000);
    return () => clearInterval(interval);
  }, [fetchEvents, initialEvent]);

  // Realtime subscription for global_events changes
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('global-events-banner')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'global_events',
        },
        () => {
          fetchEvents();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchEvents]);

  // Countdown timer
  useEffect(() => {
    if (!event || event.status !== 'active') return;

    const tick = () => {
      const remaining = new Date(event.ends_at).getTime() - Date.now();
      if (remaining <= 0) {
        setTimeLeft('Bitti!');
        setEvent(null);
        return;
      }
      const mins = Math.floor(remaining / 60_000);
      const secs = Math.floor((remaining % 60_000) / 1000);
      setTimeLeft(`${mins}:${secs.toString().padStart(2, '0')}`);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [event]);

  if (!event || isDismissed) return null;

  const eventConfig: Record<string, { bg: string; icon: string }> = {
    focus_hour: { bg: 'from-purple-600/80 to-indigo-600/80', icon: '🌍' },
    country_challenge: { bg: 'from-amber-600/80 to-orange-600/80', icon: '⚔️' },
    canvas_reveal: { bg: 'from-pink-600/80 to-rose-600/80', icon: '🎨' },
    system_announcement: { bg: 'from-blue-600/80 to-cyan-600/80', icon: '📢' },
  };

  const config = eventConfig[event.event_type] ?? eventConfig.system_announcement;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: -60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -60, opacity: 0 }}
        transition={{ type: 'spring', damping: 20 }}
        className={`fixed top-0 inset-x-0 z-[70] bg-gradient-to-r ${config.bg} backdrop-blur-md border-b border-white/10`}
      >
        <div className="max-w-lg mx-auto flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-lg flex-shrink-0">{config.icon}</span>
            <div className="min-w-0">
              <p className="text-white text-sm font-semibold truncate">{event.title}</p>
              {event.description && (
                <p className="text-white/60 text-[10px] truncate">{event.description}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            {/* Timer */}
            {event.status === 'active' && timeLeft && (
              <div className="bg-black/30 rounded-lg px-2.5 py-1">
                <span className="text-white font-mono text-sm tabular-nums">{timeLeft}</span>
              </div>
            )}

            {/* Participants */}
            {event.participant_count > 0 && (
              <span className="text-white/50 text-[10px]">
                {event.participant_count} kisi
              </span>
            )}

            {/* Dismiss */}
            <button
              onClick={() => setIsDismissed(true)}
              className="text-white/30 hover:text-white/60 text-sm transition-colors"
            >
              &times;
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
