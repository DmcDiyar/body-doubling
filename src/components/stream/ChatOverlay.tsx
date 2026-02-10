'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { StreamEvent } from '@/lib/stream-events';
import { isEventExpired, applyPriorityQueue, EVENT_ICON } from '@/lib/stream-events';
import { createClient } from '@/lib/supabase-client';

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

const PRESET_MESSAGES = [
  { emoji: '🎯', text: 'Odaklaniyorum' },
  { emoji: '🚀', text: 'Basliyorum' },
  { emoji: '💪', text: 'Yapabiliriz' },
  { emoji: '🍵', text: 'Cay molasi' },
  { emoji: '✅', text: 'Bitti!' },
  { emoji: '🤝', text: 'Birlikte guclu' },
];

/**
 * Chat overlay — displays event stream + message input.
 * CANONICAL SOURCE: stream_events table (DB).
 * User messages go through send_user_message RPC.
 */
export function ChatOverlay({
  events,
  userCityId,
  focusMode,
  variant = 'overlay',
}: ChatOverlayProps) {
  const [scope, setScope] = useState<ChatScope>('global');
  const [visibleMessages, setVisibleMessages] = useState<StreamEvent[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [cooldownEnd, setCooldownEnd] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const maxMessages = variant === 'drawer' ? MAX_MESSAGES_DRAWER : MAX_MESSAGES_OVERLAY;

  // Filter events by scope
  const filterByScope = useCallback(
    (event: StreamEvent) => {
      if (scope === 'global') return true;
      if (scope === 'country') return true;
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

  // Auto-scroll on new messages (drawer only)
  useEffect(() => {
    if (variant === 'drawer' && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [visibleMessages, variant]);

  // Send message
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isSending || !userCityId) return;
    if (Date.now() < cooldownEnd) return;

    setIsSending(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase.rpc('send_user_message', {
        p_city_id: userCityId,
        p_message: text.trim().slice(0, 100),
      });

      if (!error) {
        setInputText('');
        setCooldownEnd(Date.now() + 30_000); // 30s client cooldown
      }
    } finally {
      setIsSending(false);
    }
  }, [isSending, userCityId, cooldownEnd]);

  const handlePreset = (text: string) => {
    sendMessage(text);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(inputText);
  };

  const isOnCooldown = Date.now() < cooldownEnd;

  if (focusMode) return null;

  // ─── Scope toggle (shared) ───
  const ScopeToggle = ({ small }: { small?: boolean }) => (
    <div className={`flex gap-1 ${small ? 'mb-2' : 'mb-3'}`}>
      {(['city', 'country', 'global'] as const).map((s) => (
        <button
          key={s}
          onClick={() => setScope(s)}
          className={`text-[10px] px-2${small ? '' : '.5'} py-${small ? '0.5' : '1'} rounded-full transition-all ${
            scope === s
              ? 'bg-white/15 text-white'
              : 'bg-transparent text-white/30 hover:text-white/50'
          }`}
        >
          {s === 'city' ? 'Sehrim' : s === 'country' ? 'Turkiye' : 'Global'}
        </button>
      ))}
    </div>
  );

  // ─── Message input (shared) ───
  const MessageInput = () => (
    <div className="mt-2">
      {/* Preset buttons */}
      <div className="flex flex-wrap gap-1 mb-2">
        {PRESET_MESSAGES.map((preset) => (
          <button
            key={preset.text}
            onClick={() => handlePreset(`${preset.emoji} ${preset.text}`)}
            disabled={isSending || isOnCooldown}
            className="text-[10px] px-2 py-1 rounded-full bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {preset.emoji} {preset.text}
          </button>
        ))}
      </div>

      {/* Text input */}
      <form onSubmit={handleSubmit} className="flex gap-1.5">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={isOnCooldown ? 'Bekleniyor...' : 'Mesaj yaz...'}
          maxLength={100}
          disabled={isSending || isOnCooldown}
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/20 focus:outline-none focus:border-[#ffcb77]/40 disabled:opacity-30"
        />
        <button
          type="submit"
          disabled={isSending || isOnCooldown || !inputText.trim()}
          className="px-3 py-1.5 rounded-lg bg-[#ffcb77]/20 text-[#ffcb77] text-xs font-medium hover:bg-[#ffcb77]/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Gonder
        </button>
      </form>
    </div>
  );

  // ─── Drawer variant: scrollable list with scope toggle + input ───
  if (variant === 'drawer') {
    return (
      <div className="flex flex-col h-full">
        <ScopeToggle />

        {/* Scrollable message list */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-1.5 min-h-0">
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

        <MessageInput />
      </div>
    );
  }

  // ─── Overlay variant: bottom-left on video + compact input ───
  return (
    <div className="absolute bottom-4 left-4 z-10 w-[280px] md:w-[320px]">
      <ScopeToggle small />

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

      <MessageInput />
    </div>
  );
}
