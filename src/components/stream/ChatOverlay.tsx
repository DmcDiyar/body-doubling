'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { StreamEvent } from '@/lib/stream-events';
import { isEventExpired, applyPriorityQueue, EVENT_ICON } from '@/lib/stream-events';

type ChatScope = 'city' | 'country' | 'global';

interface ChatOverlayProps {
  events: StreamEvent[];
  userCityId: string | null;
  focusMode: boolean;
  /** 'overlay' = video overlay (desktop default), 'drawer' = mobile drawer reuse */
  variant?: 'overlay' | 'drawer';
}

const MAX_MESSAGES_OVERLAY = 4;
const MAX_MESSAGES_DRAWER = 12;

/**
 * Chat overlay — displays event stream in human language.
 * NOT a chat app. Priority-based message queue with TTL cleanup.
 *
 * CANONICAL SOURCE: stream_events table (DB).
 * This component NEVER creates events — it only REFLECTS them.
 *
 * Two variants:
 * - overlay: bottom-left on video (desktop), max 4 messages
 * - drawer: scrollable list inside mobile drawer, max 12 messages
 */
export function ChatOverlay({
  events,
  userCityId,
  focusMode,
  variant = 'overlay',
}: ChatOverlayProps) {
  const [scope, setScope] = useState<ChatScope>('city');
  const [visibleMessages, setVisibleMessages] = useState<StreamEvent[]>([]);

  const maxMessages = variant === 'drawer' ? MAX_MESSAGES_DRAWER : MAX_MESSAGES_OVERLAY;

  // Filter events by scope
  const filterByScope = useCallback(
    (event: StreamEvent) => {
      if (scope === 'global') return true;
      if (scope === 'country') return true; // All Turkish cities for now
      return event.city_id === userCityId;
    },
    [scope, userCityId],
  );

  // Process incoming events into priority queue
  useEffect(() => {
    const scopedEvents = events.filter(filterByScope);

    let queue: StreamEvent[] = [];
    for (const event of scopedEvents) {
      if (!isEventExpired(event)) {
        queue = applyPriorityQueue(queue, event, maxMessages);
      }
    }

    setVisibleMessages(queue.slice(-maxMessages));
  }, [events, filterByScope, maxMessages]);

  // TTL cleanup every 10s
  useEffect(() => {
    const interval = setInterval(() => {
      setVisibleMessages((prev) => prev.filter((e) => !isEventExpired(e)));
    }, 10_000);
    return () => clearInterval(interval);
  }, []);

  if (focusMode) return null;

  // ─── Drawer variant: scrollable list with scope toggle ───
  if (variant === 'drawer') {
    return (
      <div className="flex flex-col h-full">
        {/* Scope toggle */}
        <div className="flex gap-1 mb-3">
          {(['city', 'country', 'global'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`text-[10px] px-2.5 py-1 rounded-full transition-all ${
                scope === s
                  ? 'bg-white/15 text-white'
                  : 'bg-transparent text-white/30 hover:text-white/50'
              }`}
            >
              {s === 'city' ? 'Sehrim' : s === 'country' ? 'Turkiye' : 'Global'}
            </button>
          ))}
        </div>

        {/* Scrollable message list */}
        <div className="flex-1 overflow-y-auto space-y-1.5">
          {visibleMessages.length > 0 ? (
            visibleMessages.map((event) => (
              <div
                key={event.id}
                className="bg-white/5 rounded-lg px-3 py-2"
              >
                <p className="text-white/70 text-xs leading-relaxed">
                  <span className="mr-1">{EVENT_ICON[event.type]}</span>
                  <span className="text-white/40">{event.city_emoji} {event.city_name}</span>
                  <span className="text-white/60"> {event.message}</span>
                </p>
                <p className="text-white/20 text-[9px] mt-0.5">
                  {new Date(event.created_at).toLocaleTimeString('tr-TR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            ))
          ) : (
            <p className="text-white/20 text-xs text-center py-8">
              {scope === 'city' ? 'Sehrinden henuz aktivite yok...' : 'Bekleniyor...'}
            </p>
          )}
        </div>
      </div>
    );
  }

  // ─── Overlay variant: bottom-left on video ───
  return (
    <div className="absolute bottom-4 left-4 z-10 w-[280px] md:w-[320px]">
      {/* Scope toggle */}
      <div className="flex gap-1 mb-2">
        {(['city', 'country', 'global'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setScope(s)}
            className={`text-[10px] px-2 py-0.5 rounded-full transition-all ${
              scope === s
                ? 'bg-white/20 text-white'
                : 'bg-transparent text-white/30 hover:text-white/50'
            }`}
          >
            {s === 'city' ? 'Sehrim' : s === 'country' ? 'Turkiye' : 'Global'}
          </button>
        ))}
      </div>

      {/* Message list */}
      <div className="space-y-1.5">
        <AnimatePresence mode="popLayout">
          {visibleMessages.map((event) => (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className="bg-black/60 backdrop-blur-md rounded-lg px-3 py-2 border border-white/5"
            >
              <p className="text-white/80 text-xs leading-relaxed">
                <span className="mr-1">{EVENT_ICON[event.type]}</span>
                <span className="text-white/40">{event.city_emoji} {event.city_name}</span>
                {event.user_name && (
                  <span className="text-white/50"> - {event.user_name}</span>
                )}
                <span className="text-white/70"> {event.message}</span>
              </p>
            </motion.div>
          ))}
        </AnimatePresence>

        {visibleMessages.length === 0 && (
          <div className="bg-black/40 backdrop-blur-md rounded-lg px-3 py-2 border border-white/5">
            <p className="text-white/30 text-xs">
              {scope === 'city' ? 'Sehrinden henuz aktivite yok...' : 'Bekleniyor...'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
