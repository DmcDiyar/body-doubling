'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase-client';
import { useAuthStore } from '@/stores/auth-store';
import { getCityInfo } from '@/lib/city-detection';
import { CityPrompt } from '@/components/city/CityPrompt';
import { VideoScene } from '@/components/stream/VideoScene';
import { ChatOverlay } from '@/components/stream/ChatOverlay';
import { MiniStats } from '@/components/stream/MiniStats';
import { CityModal } from '@/components/stream/CityModal';
import { CityCanvas } from '@/components/stream/CityCanvas';
import { GlobalEventBanner } from '@/components/stream/GlobalEventBanner';
import { BottomNav } from '@/components/layout/BottomNav';
import {
  type StreamEvent,
  type CityActivity,
  EVENT_PRIORITY,
  EVENT_TTL,
} from '@/lib/stream-events';
import type { User } from '@/types/database';

// Dynamic import for Mapbox (no SSR — uses window/document)
const MapboxCityMap = dynamic(
  () => import('@/components/stream/MapboxCityMap').then((m) => m.MapboxCityMap),
  { ssr: false, loading: () => <div className="w-full h-full bg-[#0f172a] animate-pulse" /> },
);

// DB row shape from stream_events table
interface StreamEventRow {
  id: number;
  event_type: string;
  city_id: string;
  user_id: string | null;
  message: string;
  priority: number;
  created_at: string;
}

/** Convert DB row to frontend StreamEvent */
function rowToStreamEvent(row: StreamEventRow): StreamEvent {
  const info = getCityInfo(row.city_id);
  const eventType = row.event_type as StreamEvent['type'];
  return {
    id: `db-${row.id}`,
    type: eventType,
    city_id: row.city_id,
    city_name: info?.name ?? row.city_id,
    city_emoji: info?.emoji ?? '',
    message: row.message,
    priority: row.priority ?? EVENT_PRIORITY[eventType] ?? 2,
    ttl: EVENT_TTL[eventType] ?? 120,
    created_at: row.created_at,
  };
}

export default function CityWarsStreamPage() {
  const router = useRouter();
  const { user, setUser } = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);
  const [userCityId, setUserCityId] = useState<string | null>(null);
  const [showCityPrompt, setShowCityPrompt] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [selectedCityModal, setSelectedCityModal] = useState<string | null>(null);
  const [isMobileChatOpen, setIsMobileChatOpen] = useState(false);
  const [isCanvasExpanded, setIsCanvasExpanded] = useState(false);

  // Stream data — aggregate (map + stats)
  const [cities, setCities] = useState<CityActivity[]>([]);
  const [totalActive, setTotalActive] = useState(0);
  const [totalMinutesToday, setTotalMinutesToday] = useState(0);

  // Events — from stream_events table ONLY (chat canonical source)
  const [events, setEvents] = useState<StreamEvent[]>([]);

  // Refs for debounce + polling
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      setUserCityId(city);
      if (!city) setShowCityPrompt(true);

      setIsLoading(false);
    }
    load();
  }, [router, setUser, user]);

  // ─── Fetch aggregate data (map + stats ONLY, no events) ───
  const fetchAggregateData = useCallback(async () => {
    const supabase = createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;

    const { data: atmosData } = await supabase.rpc('get_city_atmosphere', {
      p_city_id: null,
    });

    if (atmosData && Array.isArray(atmosData)) {
      const cityList = atmosData as Array<{
        city_id: string;
        active_now: number;
        today_minutes: number;
        mood: string;
      }>;

      const mapped: CityActivity[] = cityList.map((c) => ({
        city_id: c.city_id,
        active_users: c.active_now ?? 0,
        today_minutes: c.today_minutes ?? 0,
        mood: c.mood ?? 'quiet',
      }));

      setCities(mapped);
      setTotalActive(mapped.reduce((sum, c) => sum + c.active_users, 0));
      setTotalMinutesToday(mapped.reduce((sum, c) => sum + c.today_minutes, 0));
    }
  }, []);

  // ─── Debounced aggregate fetch (for realtime callbacks) ───
  const debouncedAggregateFetch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fetchAggregateData, 1000);
  }, [fetchAggregateData]);

  // ─── Load initial events from stream_events table ───
  const loadRecentEvents = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('stream_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30);

    if (data && Array.isArray(data)) {
      const mapped = (data as StreamEventRow[])
        .reverse()
        .map(rowToStreamEvent);
      setEvents(mapped);
    }
  }, []);

  // ─── Polling: aggregate data every 15s + event fallback every 60s ───
  useEffect(() => {
    if (isLoading) return;

    fetchAggregateData();
    loadRecentEvents();
    pollRef.current = setInterval(fetchAggregateData, 15_000);

    // Fail-safe: re-fetch events every 60s in case Realtime disconnects
    const fallbackRef = setInterval(loadRecentEvents, 60_000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      clearInterval(fallbackRef);
    };
  }, [isLoading, fetchAggregateData, loadRecentEvents]);

  // ─── Realtime: stream_events table → Chat (canonical source) ───
  useEffect(() => {
    if (isLoading) return;

    const supabase = createClient();
    const channel = supabase
      .channel('stream-events-canonical')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'stream_events',
          filter: 'event_type=in.(session_started,session_completed,session_milestone,city_activity_change,city_milestone,user_message,global_focus_hour,country_challenge,canvas_reveal,system_announcement)',
        },
        (payload) => {
          const row = payload.new as StreamEventRow;
          const event = rowToStreamEvent(row);
          setEvents((prev) => [...prev.slice(-50), event]);

          // Also refresh aggregate data (debounced)
          debouncedAggregateFetch();
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [isLoading, debouncedAggregateFetch]);

  // ─── City select handler ───
  const handleCitySelect = async (cityId: string) => {
    const supabase = createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;

    await supabase.rpc('set_user_city', {
      p_user_id: authUser.id,
      p_city_id: cityId,
    });

    setUserCityId(cityId);
    setShowCityPrompt(false);

    const { data: updatedProfile } = await supabase
      .from('users').select('*').eq('id', authUser.id).single();
    if (updatedProfile) setUser(updatedProfile as User);
  };

  // ─── Derived state ───
  const modalCity = selectedCityModal
    ? cities.find((c) => c.city_id === selectedCityModal)
    : null;

  const sortedCities = [...cities].sort((a, b) => b.today_minutes - a.today_minutes);
  const userCityRank = userCityId
    ? sortedCities.findIndex((c) => c.city_id === userCityId) + 1
    : null;
  const userCityInfo = userCityId ? getCityInfo(userCityId) : null;

  // Unread count: events in last 5 minutes
  const recentEventCount = events.filter((e) => {
    const age = (Date.now() - new Date(e.created_at).getTime()) / 1000;
    return age < 300;
  }).length;

  // ─── Loading state ───
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <div className="text-white/50 text-lg">Yukleniyor...</div>
      </div>
    );
  }

  // ─── City prompt ───
  if (showCityPrompt) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#1a1a2e] via-[#16213e] to-[#0f3460] flex items-center justify-center px-4 pb-24">
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

        {/* Exit focus button */}
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          onClick={() => setFocusMode(false)}
          className="absolute top-6 right-6 z-[60] px-4 py-2 rounded-full bg-[#ffcb77] text-[#1a1a2e] text-sm font-semibold shadow-lg hover:scale-105 transition-transform"
        >
          Focustan Cik
        </motion.button>

        {/* Subtle overlay info */}
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
    <div className="min-h-screen bg-[#0f172a] pb-20">
      {/* Global Event Banner */}
      <GlobalEventBanner />

      {/* ===== DESKTOP: 60/40 Split Layout ===== */}
      <div className="hidden md:flex h-screen">
        {/* Sol Panel (60%) — Video Scene + Chat */}
        <div className="relative w-[60%] h-full">
          <VideoScene focusMode={false} />
          <ChatOverlay
            events={events}
            userCityId={userCityId}
            focusMode={false}
          />

          {/* Focus mode toggle */}
          <button
            onClick={() => setFocusMode(true)}
            className="absolute top-4 right-4 z-20 px-3 py-1.5 rounded-full text-xs font-medium transition-all bg-black/40 backdrop-blur-md text-white/60 hover:text-white/90 border border-white/10 hover:bg-black/60"
          >
            Focus Mode
          </button>
        </div>

        {/* Sag Panel (40%) — Map + Stats + Canvas */}
        <div className="relative w-[40%] h-full border-l border-white/5 flex flex-col">
          {/* Map (top section) */}
          <div className="relative flex-1 min-h-0">
            <MapboxCityMap
              cities={cities}
              userCityId={userCityId}
              onCityClick={setSelectedCityModal}
            />
            <MiniStats
              totalActive={totalActive}
              totalMinutesToday={totalMinutesToday}
              userCityName={userCityInfo?.name ?? null}
              userCityRank={userCityRank}
              userCityEmoji={userCityInfo?.emoji ?? null}
            />
          </div>

          {/* Canvas (bottom section — collapsible) */}
          {userCityId && (
            <div className="border-t border-white/5 bg-[#0f172a]/90 backdrop-blur-md p-3">
              <CityCanvas
                cityId={userCityId}
                cityName={userCityInfo?.name ?? userCityId}
                cityEmoji={userCityInfo?.emoji ?? '🏙️'}
                isExpanded={isCanvasExpanded}
                onToggle={() => setIsCanvasExpanded(!isCanvasExpanded)}
              />
            </div>
          )}
        </div>
      </div>

      {/* ===== MOBILE: Stacked Layout ===== */}
      <div className="md:hidden flex flex-col h-screen">
        {/* Scene (35% height) */}
        <div className="relative h-[35vh]">
          <VideoScene focusMode={false} />

          <button
            onClick={() => setFocusMode(true)}
            className="absolute top-3 right-3 z-20 px-2.5 py-1 rounded-full text-[10px] font-medium transition-all bg-black/40 backdrop-blur-md text-white/60 border border-white/10"
          >
            Focus
          </button>
        </div>

        {/* Map (35% height) */}
        <div className="relative h-[35vh] border-t border-white/5">
          <MapboxCityMap
            cities={cities}
            userCityId={userCityId}
            onCityClick={setSelectedCityModal}
          />
          <MiniStats
            totalActive={totalActive}
            totalMinutesToday={totalMinutesToday}
            userCityName={userCityInfo?.name ?? null}
            userCityRank={userCityRank}
            userCityEmoji={userCityInfo?.emoji ?? null}
          />
        </div>

        {/* Canvas (mobile — collapsible section) */}
        {userCityId && (
          <div className="border-t border-white/5 bg-[#0f172a]/90 p-2">
            <CityCanvas
              cityId={userCityId}
              cityName={userCityInfo?.name ?? userCityId}
              cityEmoji={userCityInfo?.emoji ?? '🏙️'}
              isExpanded={isCanvasExpanded}
              onToggle={() => setIsCanvasExpanded(!isCanvasExpanded)}
            />
          </div>
        )}

        {/* Mobile Chat — Floating button + Drawer */}
        <>
          <button
            onClick={() => setIsMobileChatOpen(true)}
            className="fixed bottom-24 right-4 z-30 bg-[#1a1a2e]/90 backdrop-blur-md border border-white/10 rounded-full w-12 h-12 flex items-center justify-center shadow-lg"
          >
            <span className="text-lg">💬</span>
            {recentEventCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-[#ffcb77] text-[#1a1a2e] text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {Math.min(recentEventCount, 9)}
              </span>
            )}
          </button>

          <AnimatePresence>
            {isMobileChatOpen && (
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="fixed inset-x-0 bottom-0 z-40 h-[60vh] bg-[#1a1a2e]/95 backdrop-blur-xl rounded-t-2xl border-t border-white/10 p-4"
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-white text-sm font-medium">Akis</h3>
                  <button
                    onClick={() => setIsMobileChatOpen(false)}
                    className="text-white/40 hover:text-white/70 text-lg"
                  >
                    &times;
                  </button>
                </div>
                <div className="relative h-[calc(100%-40px)]">
                  <ChatOverlay
                    events={events}
                    userCityId={userCityId}
                    focusMode={false}
                    variant="drawer"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>

        <div className="h-[20vh]" />
      </div>

      {/* City Modal */}
      <AnimatePresence>
        {selectedCityModal && (
          <CityModal
            cityId={selectedCityModal}
            activeUsers={modalCity?.active_users ?? 0}
            todayMinutes={modalCity?.today_minutes ?? 0}
            events={events}
            onClose={() => setSelectedCityModal(null)}
          />
        )}
      </AnimatePresence>

      <BottomNav />
    </div>
  );
}
