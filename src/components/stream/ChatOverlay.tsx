'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { StreamEvent, StreamEventType } from '@/lib/stream-events';
import { EVENT_ICON } from '@/lib/stream-events';
import { createClient } from '@/lib/supabase-client';

type ChatScope = 'city' | 'global';

interface ChatOverlayProps {
  events: StreamEvent[];
  userCityId: string | null;
  focusMode: boolean;
  /** 'overlay' = video overlay (desktop), 'drawer' = mobile drawer */
  variant?: 'overlay' | 'drawer';
}

const MAX_OVERLAY = 6;
const MAX_DRAWER = 50;

const PRESET_MESSAGES = [
  { emoji: '🎯', text: 'Odaklaniyorum' },
  { emoji: '🚀', text: 'Basliyorum' },
  { emoji: '💪', text: 'Yapabiliriz' },
  { emoji: '🍵', text: 'Cay molasi' },
  { emoji: '✅', text: 'Bitti!' },
  { emoji: '🤝', text: 'Birlikte guclu' },
];

/** Get a human-readable time ago string */
function timeAgo(dateStr: string): string {
  const secs = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (secs < 10) return 'simdi';
  if (secs < 60) return `${secs}sn`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}dk`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}s`;
}

/** Get event category styling */
function getEventStyle(type: StreamEventType): { bg: string; accent: string } {
  switch (type) {
    case 'session_started':
      return { bg: 'bg-emerald-500/8', accent: 'text-emerald-400' };
    case 'session_completed':
      return { bg: 'bg-blue-500/8', accent: 'text-blue-400' };
    case 'session_milestone':
    case 'city_milestone':
      return { bg: 'bg-amber-500/10', accent: 'text-amber-400' };
    case 'user_message':
      return { bg: 'bg-white/5', accent: 'text-white/60' };
    case 'global_focus_hour':
    case 'system_announcement':
      return { bg: 'bg-purple-500/10', accent: 'text-purple-400' };
    case 'country_challenge':
      return { bg: 'bg-orange-500/8', accent: 'text-orange-400' };
    case 'canvas_reveal':
      return { bg: 'bg-pink-500/8', accent: 'text-pink-400' };
    default:
      return { bg: 'bg-white/5', accent: 'text-white/50' };
  }
}

export function ChatOverlay({
  events,
  userCityId,
  focusMode,
  variant = 'overlay',
}: ChatOverlayProps) {
  const [scope, setScope] = useState<ChatScope>('global');
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [cooldownEnd, setCooldownEnd] = useState(0);
  const [, setTick] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const maxMessages = variant === 'drawer' ? MAX_DRAWER : MAX_OVERLAY;

  // Tick for timeAgo updates every 10s
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(interval);
  }, []);

  // Filter events by scope — no expiry, show all history
  const filteredEvents = events.filter((e) => {
    if (scope === 'global') return true;
    return e.city_id === userCityId;
  }).slice(-maxMessages);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredEvents.length]);

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
        setCooldownEnd(Date.now() + 30_000);
      }
    } finally {
      setIsSending(false);
    }
  }, [isSending, userCityId, cooldownEnd]);

  const handlePreset = (text: string) => sendMessage(text);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(inputText);
  };

  const isOnCooldown = Date.now() < cooldownEnd;

  if (focusMode) return null;

  // ─── Single event message row ───
  const EventRow = ({ event }: { event: StreamEvent }) => {
    const style = getEventStyle(event.type);
    const icon = EVENT_ICON[event.type] || '\u{1F4AC}';

    return (
      <div className={`${style.bg} rounded-lg px-3 py-2 border border-white/[0.03]`}>
        <div className="flex items-start gap-2">
          <span className="text-sm flex-shrink-0 mt-0.5">{icon}</span>
          <div className="flex-1 min-w-0">
            <p className="text-white/80 text-xs leading-relaxed">
              <span className={`font-medium ${style.accent}`}>
                {event.city_emoji} {event.city_name}
              </span>
              {event.user_name && (
                <span className="text-white/50"> - {event.user_name}</span>
              )}
              <span className="text-white/60"> {event.message}</span>
            </p>
            <p className="text-white/20 text-[9px] mt-0.5">{timeAgo(event.created_at)}</p>
          </div>
        </div>
      </div>
    );
  };

  // ─── Scope toggle — 2 tabs only ───
  const ScopeToggle = () => (
    <div className="flex gap-1 mb-2">
      {([['global', 'Global'], ['city', 'Sehrim']] as const).map(([s, label]) => (
        <button
          key={s}
          onClick={() => setScope(s)}
          className={`text-[10px] px-2.5 py-1 rounded-full transition-all ${
            scope === s
              ? 'bg-white/15 text-white font-medium'
              : 'bg-transparent text-white/30 hover:text-white/50'
          }`}
        >
          {s === 'global' ? '\u{1F30D}' : '\u{1F3D9}'} {label}
        </button>
      ))}
    </div>
  );

  // ─── Message input ───
  const MessageInput = () => (
    <div className="mt-2 border-t border-white/5 pt-2">
      {/* Preset quick messages */}
      <div className="flex flex-wrap gap-1 mb-2">
        {PRESET_MESSAGES.map((preset) => (
          <button
            key={preset.text}
            onClick={() => handlePreset(`${preset.emoji} ${preset.text}`)}
            disabled={isSending || isOnCooldown}
            className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60 transition-all disabled:opacity-20 disabled:cursor-not-allowed"
          >
            {preset.emoji}
          </button>
        ))}
      </div>

      {/* Text input */}
      <form onSubmit={handleSubmit} className="flex gap-1.5">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={isOnCooldown ? 'Bekleniyor...' : 'Mesajini yaz...'}
          maxLength={100}
          disabled={isSending || isOnCooldown}
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/20 focus:outline-none focus:border-[#ffcb77]/40 disabled:opacity-30"
        />
        <button
          type="submit"
          disabled={isSending || isOnCooldown || !inputText.trim()}
          className="px-3 py-1.5 rounded-lg bg-[#ffcb77]/20 text-[#ffcb77] text-xs font-medium hover:bg-[#ffcb77]/30 transition-all disabled:opacity-20 disabled:cursor-not-allowed"
        >
          &#9654;
        </button>
      </form>
    </div>
  );

  // ─── DRAWER variant: full scrollable chat ───
  if (variant === 'drawer') {
    return (
      <div className="flex flex-col h-full">
        <ScopeToggle />

        <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-1.5 min-h-0">
          {filteredEvents.length > 0 ? (
            filteredEvents.map((event) => (
              <EventRow key={event.id} event={event} />
            ))
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-white/20 text-xs text-center py-8">
                {scope === 'city' ? 'Sehrinden henuz aktivite yok' : 'Akis bekleniyor...'}
              </p>
            </div>
          )}
        </div>

        <MessageInput />
      </div>
    );
  }

  // ─── OVERLAY variant: floating on video ───
  return (
    <div className="absolute bottom-4 left-4 z-10 w-[300px] md:w-[340px]">
      <ScopeToggle />

      <div ref={scrollRef} className="space-y-1 max-h-[260px] overflow-y-auto">
        <AnimatePresence mode="popLayout">
          {filteredEvents.length > 0 ? (
            filteredEvents.map((event) => (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                transition={{ duration: 0.3 }}
              >
                <div className={`${getEventStyle(event.type).bg} backdrop-blur-md rounded-lg px-3 py-2 border border-white/5`}>
                  <div className="flex items-start gap-2">
                    <span className="text-xs flex-shrink-0 mt-0.5">{EVENT_ICON[event.type]}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-white/80 text-[11px] leading-relaxed">
                        <span className={`font-medium ${getEventStyle(event.type).accent}`}>
                          {event.city_emoji} {event.city_name}
                        </span>
                        {event.user_name && (
                          <span className="text-white/40"> - {event.user_name}</span>
                        )}
                        <span className="text-white/60"> {event.message}</span>
                      </p>
                      <p className="text-white/15 text-[8px] mt-0.5">{timeAgo(event.created_at)}</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))
          ) : (
            <div className="bg-black/40 backdrop-blur-md rounded-lg px-3 py-3 border border-white/5">
              <p className="text-white/20 text-xs text-center">
                {scope === 'city' ? 'Sehrinden henuz aktivite yok' : 'Akis bekleniyor...'}
              </p>
            </div>
          )}
        </AnimatePresence>
      </div>

      <MessageInput />
    </div>
  );
}
