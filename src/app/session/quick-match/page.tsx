'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import { DURATIONS, TRUST, MATCHING_TIMEOUT_MS, AVATARS, getRandomFunFact } from '@/lib/constants';
import { INTENTS, INTENT_MAP } from '@/lib/intents';
import { useSessionStore } from '@/stores/session-store';
import { useUserIntent } from '@/hooks/useRitualFlow';
import LiveStatsPanel from '@/components/session/LiveStatsPanel';
import RecentMatchesFeed from '@/components/session/RecentMatchesFeed';
import { useRateLimit } from '@/hooks/useRateLimit';
import { RateLimitBanner } from '@/components/ui/RateLimitUI';
import { motion, AnimatePresence } from 'framer-motion';
import type { Session, SessionParticipant, User } from '@/types/database';

// ============================================================
// Phase: intent → matching → reveal → (redirect to active)
// ============================================================
type Phase = 'intent' | 'matching' | 'reveal' | 'solo-offer';

interface PartnerPreview {
  name: string;
  sessions: number;
  trustScore: number;
  streak: number;
  intent: string | null;
}

export default function QuickMatchPage() {
  const router = useRouter();
  const { setSession, setMyParticipation } = useSessionStore();
  const { intent: userIntent, saveIntent } = useUserIntent();

  // Config state
  const [phase, setPhase] = useState<Phase>('intent');
  const [selectedIntent, setSelectedIntent] = useState<string | null>(null);
  const [duration, setDuration] = useState(25);
  const [theme] = useState('rainy_cafe');

  // Matching state
  const [matchTimer, setMatchTimer] = useState(30);
  const [funFact, setFunFact] = useState(getRandomFunFact());
  const [userAvatar, setUserAvatar] = useState('🐱');

  // Reveal state
  const [partner, setPartner] = useState<PartnerPreview | null>(null);
  const [revealCountdown, setRevealCountdown] = useState(5);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Rate limiting
  const { limited: rateLimited, status: rateLimitStatus, findMatchWithLimit, reset: resetRateLimit } = useRateLimit();

  // Adaptive intent: if returning user, show their last intent
  const showAdaptive = userIntent?.hasIntent && userIntent.lastIntent;

  // Auto-select from last intent
  useEffect(() => {
    if (userIntent?.lastIntent) {
      setSelectedIntent(userIntent.lastIntent);
      setDuration(userIntent.lastDuration || 25);
    }
  }, [userIntent]);

  // Rotate fun facts during matching
  useEffect(() => {
    if (phase !== 'matching') return;
    const interval = setInterval(() => setFunFact(getRandomFunFact()), 6000);
    return () => clearInterval(interval);
  }, [phase]);

  // Load user avatar
  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('users')
          .select('avatar_id')
          .eq('id', user.id)
          .single();
        if (profile) {
          const avatar = AVATARS.find(a => a.id === (profile as { avatar_id: number }).avatar_id);
          if (avatar) setUserAvatar(avatar.emoji);
        }
      }
    };
    load();
  }, []);

  // ---- START MATCHING ----
  const handleStartMatching = useCallback(async () => {
    if (!selectedIntent) return;

    const supabase = createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;

    // Save intent for adaptive flow
    await saveIntent(selectedIntent, duration);

    // Trust check
    const { data: profile } = await supabase
      .from('users')
      .select('trust_score')
      .eq('id', authUser.id)
      .single();

    if (!profile || (profile as User).trust_score < TRUST.SOLO_ONLY_THRESHOLD) {
      handleStartSolo(authUser.id);
      return;
    }

    setPhase('matching');

    // Queue management
    const priority = (profile as User).trust_score >= TRUST.HIGH_PRIORITY_THRESHOLD ? 2 :
      (profile as User).trust_score >= TRUST.LOW_PRIORITY_THRESHOLD ? 1 : 0;

    const { data: existingQueue } = await supabase
      .from('matching_queue')
      .select('id, status')
      .eq('user_id', authUser.id)
      .eq('status', 'waiting')
      .maybeSingle();

    if (!existingQueue) {
      await supabase.from('matching_queue').delete().eq('user_id', authUser.id);
      await supabase.from('matching_queue').insert({
        user_id: authUser.id,
        duration,
        theme,
        priority,
        status: 'waiting',
        expires_at: new Date(Date.now() + MATCHING_TIMEOUT_MS).toISOString(),
      });
    }

    // Try match (rate-limited)
    const { sessionId: foundSessionId, rateLimited: wasLimited } = await findMatchWithLimit(
      authUser.id,
      duration,
      theme
    );

    if (wasLimited) {
      setPhase('intent');
      return;
    }

    if (foundSessionId) {
      await handleMatchFound(foundSessionId as string, authUser.id);
      return;
    }

    // Listen for match via realtime
    const channel = supabase
      .channel('matching-redesign')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'session_participants',
        filter: `user_id=eq.${authUser.id}`,
      }, async (payload) => {
        const participant = payload.new as SessionParticipant;
        await handleMatchFound(participant.session_id, authUser.id);
        channel.unsubscribe();
      })
      .subscribe();

    // Countdown timer
    let count = 30;
    const interval = setInterval(() => {
      count--;
      setMatchTimer(count);
      if (count <= 0) {
        clearInterval(interval);
        channel.unsubscribe();
        supabase.from('matching_queue')
          .update({ status: 'expired' })
          .eq('user_id', authUser.id)
          .eq('status', 'waiting')
          .then();
        setPhase('solo-offer');
      }
    }, 1000);

    return () => {
      clearInterval(interval);
      channel.unsubscribe();
    };
  }, [selectedIntent, duration, theme, saveIntent]);

  // ---- MATCH FOUND → Go to reveal ----
  const handleMatchFound = async (sid: string, userId: string) => {
    const supabase = createClient();

    // Load session
    const { data: session } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', sid)
      .single();

    const { data: myPart } = await supabase
      .from('session_participants')
      .select('*')
      .eq('session_id', sid)
      .eq('user_id', userId)
      .single();

    if (session) setSession(session as Session);
    if (myPart) setMyParticipation(myPart as SessionParticipant);

    // Get match & mark ready (returns partner preview)
    const { data: matchData } = await supabase
      .from('matches')
      .select('id')
      .eq('session_id', sid)
      .single();

    if (matchData) {
      const { data: readyResult } = await supabase.rpc('mark_match_ready', {
        p_match_id: matchData.id,
      });

      if (readyResult?.partner) {
        setPartner({
          name: readyResult.partner.name,
          sessions: readyResult.partner.sessions,
          trustScore: readyResult.partner.trust_score,
          streak: readyResult.partner.streak,
          intent: readyResult.partner.intent,
        });
      }
    }

    setSessionId(sid);
    setPhase('reveal');
  };

  // ---- REVEAL COUNTDOWN → navigate to active ----
  useEffect(() => {
    if (phase !== 'reveal' || !sessionId) return;
    const interval = setInterval(() => {
      setRevealCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          router.push(`/session/active?id=${sessionId}`);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [phase, sessionId, router]);

  // ---- SOLO SESSION ----
  const handleStartSolo = async (userId?: string) => {
    const supabase = createClient();
    if (!userId) {
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id;
    }
    if (!userId) return;
    if (selectedIntent) await saveIntent(selectedIntent, duration);

    const { data: session } = await supabase
      .from('sessions')
      .insert({ duration, mode: 'solo', theme, status: 'active', started_at: new Date().toISOString() })
      .select()
      .single();
    if (!session) return;

    await supabase.from('session_participants').insert({
      session_id: (session as Session).id,
      user_id: userId,
      status: 'active',
      joined_at: new Date().toISOString(),
    });

    setSession(session as Session);
    router.push(`/session/active?id=${(session as Session).id}`);
  };

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="min-h-screen bg-[#221b10] text-white font-[family-name:var(--font-geist-sans)]">
      {/* Rate Limit Banner */}
      <RateLimitBanner
        show={rateLimited}
        status={rateLimitStatus}
        onDismiss={resetRateLimit}
      />
      {/* Background */}
      <div className="fixed inset-0 bg-gradient-to-b from-[#221b10]/70 to-[#221b10]/90 -z-10" />
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none -z-5">
        <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-[#eea62b]/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] left-[-5%] w-[400px] h-[400px] bg-[#eea62b]/5 blur-[100px] rounded-full" />
      </div>

      {/* Main Content */}
      <div className="min-h-screen flex items-center justify-center p-4 md:p-6">
        <AnimatePresence mode="wait">

          {/* ============================================= */}
          {/* PHASE 1: INTENT + CONFIG                      */}
          {/* ============================================= */}
          {phase === 'intent' && (
            <motion.div
              key="intent"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, x: -20 }}
              className="w-full max-w-lg"
            >
              <div className="bg-[#221b10]/85 backdrop-blur-xl border border-[#eea62b]/20 rounded-xl shadow-2xl p-6 md:p-8 space-y-6">

                {/* Header */}
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => router.push('/dashboard')}
                    className="flex items-center gap-1.5 text-[#eea62b]/60 hover:text-[#eea62b] transition-colors text-sm"
                  >
                    ← Geri
                  </button>
                  {userIntent && userIntent.currentStreak > 0 && (
                    <div className="flex items-center gap-1.5 bg-[#eea62b]/10 border border-[#eea62b]/20 rounded-full px-3 py-1.5">
                      <span className="text-base">🔥</span>
                      <span className="text-[#eea62b] text-sm font-bold">
                        {userIntent.currentStreak} günlük seri!
                      </span>
                    </div>
                  )}
                </div>

                {/* Adaptive Intent Banner */}
                {showAdaptive && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-[#eea62b]/[0.08] border border-[#eea62b]/20 rounded-xl p-4 flex items-center gap-4"
                  >
                    <div className="w-12 h-12 bg-[#eea62b]/15 rounded-xl flex items-center justify-center text-2xl flex-shrink-0">
                      {INTENT_MAP[userIntent!.lastIntent!]?.emoji ?? '🎯'}
                    </div>
                    <div className="flex-1">
                      <p className="text-xs uppercase tracking-widest text-[#eea62b]/50 font-semibold">Son seçimin</p>
                      <p className="text-white font-bold">
                        {INTENT_MAP[userIntent!.lastIntent!]?.label ?? userIntent!.lastIntent}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        handleStartMatching();
                      }}
                      className="bg-[#eea62b] text-[#221b10] font-bold text-sm px-4 py-2 rounded-lg shadow-[0_0_15px_rgba(238,166,43,0.3)] hover:shadow-[0_0_25px_rgba(238,166,43,0.5)] transition-all"
                    >
                      Devam ✨
                    </button>
                  </motion.div>
                )}

                {/* Title */}
                <div className="text-center space-y-1">
                  <h1 className="text-2xl md:text-3xl font-bold text-white">Bugün ne yapacaksın?</h1>
                  <p className="text-[#eea62b]/60 text-sm">Bir niyet seç, odaklan</p>
                </div>

                {/* Intent Grid */}
                <div className="grid grid-cols-2 gap-3">
                  {INTENTS.map((intent) => (
                    <button
                      key={intent.id}
                      onClick={() => setSelectedIntent(intent.id)}
                      className={`
                        p-4 rounded-xl border text-center transition-all duration-300
                        flex flex-col items-center gap-2
                        ${selectedIntent === intent.id
                          ? 'bg-[#eea62b]/15 border-[#eea62b]/60 shadow-[0_0_25px_rgba(238,166,43,0.2)]'
                          : 'bg-white/[0.03] border-[#eea62b]/10 hover:border-[#eea62b]/30 hover:-translate-y-0.5'
                        }
                      `}
                    >
                      <span className="text-3xl">{intent.emoji}</span>
                      <span className="text-white font-semibold text-sm">{intent.label}</span>
                      <span className="text-[#eea62b]/40 text-xs">{intent.desc}</span>
                    </button>
                  ))}
                </div>

                {/* Duration Selector */}
                <div className="space-y-3">
                  <p className="text-xs uppercase tracking-widest text-[#eea62b]/50 font-semibold text-center">
                    Süre Seç
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    {DURATIONS.map((d) => (
                      <button
                        key={d.value}
                        onClick={() => setDuration(d.value)}
                        className={`
                          px-4 py-2 rounded-full text-sm font-semibold border transition-all
                          ${duration === d.value
                            ? 'bg-[#eea62b] text-[#221b10] border-[#eea62b] shadow-[0_0_15px_rgba(238,166,43,0.35)]'
                            : 'bg-white/[0.05] text-[#eea62b]/60 border-[#eea62b]/10 hover:border-[#eea62b]/30'
                          }
                        `}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* FOMO Stats */}
                <LiveStatsPanel selectedDuration={duration} />

                {/* CTA */}
                <motion.button
                  whileHover={{ scale: 1.01, y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleStartMatching}
                  disabled={!selectedIntent}
                  className={`
                    w-full py-4 font-bold text-lg rounded-xl flex items-center justify-center gap-2
                    transition-all
                    ${selectedIntent
                      ? 'bg-[#eea62b] text-[#221b10] shadow-[0_0_20px_rgba(238,166,43,0.3)] hover:shadow-[0_0_35px_rgba(238,166,43,0.5)]'
                      : 'bg-white/10 text-white/30 cursor-not-allowed'
                    }
                  `}
                >
                  <span className="material-icons-round">bolt</span>
                  ✨ Eşleş ve Başla
                </motion.button>

                <p className="text-center text-[#eea62b]/40 text-xs">
                  Eşleşme genellikle 5-15 saniye sürer
                </p>
              </div>
            </motion.div>
          )}

          {/* ============================================= */}
          {/* PHASE 2: MATCHING                             */}
          {/* ============================================= */}
          {phase === 'matching' && (
            <motion.div
              key="matching"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="w-full max-w-lg"
            >
              <div className="bg-[#221b10]/85 backdrop-blur-xl border border-[#eea62b]/20 rounded-xl shadow-2xl p-6 md:p-8 space-y-6">

                {/* Avatar Connection */}
                <div className="flex items-center justify-center gap-6 py-4">
                  {/* User avatar */}
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-20 h-20 rounded-full bg-[#eea62b]/15 border-2 border-[#eea62b]/40 flex items-center justify-center text-4xl">
                      {userAvatar}
                    </div>
                    <span className="text-xs text-[#eea62b]/60 font-medium">Sen</span>
                  </div>

                  {/* Connection animation */}
                  <div className="w-16 h-0.5 bg-gradient-to-r from-[#eea62b]/30 via-[#eea62b] to-[#eea62b]/30 relative">
                    <motion.div
                      animate={{ x: [0, 48, 0] }}
                      transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
                      className="absolute top-[-3px] left-0 w-4 h-2 bg-[#eea62b] rounded-full"
                    />
                  </div>

                  {/* Partner (unknown) */}
                  <div className="flex flex-col items-center gap-2">
                    <motion.div
                      animate={{ scale: [1, 1.05, 1], borderColor: ['rgba(238,166,43,0.2)', 'rgba(238,166,43,0.5)', 'rgba(238,166,43,0.2)'] }}
                      transition={{ repeat: Infinity, duration: 2 }}
                      className="w-20 h-20 rounded-full bg-[#eea62b]/8 border-2 border-dashed border-[#eea62b]/30 flex items-center justify-center text-3xl"
                    >
                      ❓
                    </motion.div>
                    <span className="text-xs text-[#eea62b]/40 font-medium">Ortağın</span>
                  </div>
                </div>

                {/* Search text */}
                <div className="text-center space-y-3">
                  <h2 className="text-xl font-semibold text-white/90">Sessiz ortağın aranıyor...</h2>
                  <div className="flex items-center justify-center gap-3">
                    <div className="w-5 h-5 border-2 border-[#eea62b]/10 border-t-[#eea62b] rounded-full animate-spin" />
                    <span className="text-[#eea62b] text-2xl font-bold">{matchTimer}</span>
                    <span className="text-[#eea62b]/60 text-sm">saniye</span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full space-y-2">
                  <div className="h-2 w-full bg-[#eea62b]/10 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-[#eea62b] rounded-full shadow-[0_0_10px_rgba(238,166,43,0.3)]"
                      initial={{ width: '100%' }}
                      animate={{ width: `${(matchTimer / 30) * 100}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-[#eea62b]/40">
                    <span>Eşleşme aranıyor</span>
                    <span>{duration}dk seans</span>
                  </div>
                </div>

                {/* Recent Matches Feed (FOMO) */}
                <RecentMatchesFeed />

                {/* Fun Fact */}
                <motion.div
                  key={funFact}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-[#eea62b]/[0.06] border border-[#eea62b]/10 rounded-xl p-4 flex gap-3"
                >
                  <span className="text-xl mt-0.5">💡</span>
                  <p className="text-sm text-white/80">{funFact}</p>
                </motion.div>

                {/* Solo fallback */}
                <button
                  onClick={() => setPhase('solo-offer')}
                  className="w-full text-[#eea62b]/40 hover:text-[#eea62b]/70 transition-colors text-sm font-medium"
                >
                  Solo devam et →
                </button>
              </div>
            </motion.div>
          )}

          {/* ============================================= */}
          {/* PHASE 3: PARTNER REVEAL                       */}
          {/* ============================================= */}
          {phase === 'reveal' && (
            <motion.div
              key="reveal"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 200 }}
              className="w-full max-w-lg"
            >
              <div className="bg-[#221b10]/85 backdrop-blur-xl border border-[#eea62b]/30 rounded-xl shadow-2xl p-8 space-y-8">
                {/* Header */}
                <div className="text-center">
                  <motion.h1
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2, type: 'spring' }}
                    className="text-3xl font-bold text-[#eea62b] mb-2"
                    style={{ textShadow: '0 0 10px rgba(238,166,43,0.5)' }}
                  >
                    🎉 Eşleşme Bulundu!
                  </motion.h1>
                  <p className="text-[#eea62b]/70 font-medium">Odaklanma seansınız başlamak üzere</p>
                </div>

                {/* Partner Avatar */}
                <div className="flex justify-center">
                  <motion.div
                    animate={{ scale: [1, 1.03, 1] }}
                    transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
                    className="w-32 h-32 rounded-full bg-[#eea62b]/10 border-4 border-[#eea62b]/50 flex items-center justify-center text-6xl shadow-[0_0_25px_rgba(238,166,43,0.25)]"
                  >
                    🦊
                  </motion.div>
                </div>

                {/* Partner Info */}
                <div className="text-center space-y-2">
                  <div className="flex items-center justify-center gap-2">
                    <h2 className="text-2xl font-semibold text-white">{partner?.name ?? '?***'}</h2>
                    {partner && partner.trustScore >= 90 && (
                      <span className="flex items-center gap-1 bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full text-xs font-bold border border-green-500/30">
                        <span className="w-2 h-2 bg-green-500 rounded-full" />
                        Doğrulanmış
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-center gap-4 text-[#eea62b]/80 text-sm">
                    <span>{partner?.sessions ?? 0} seans</span>
                    <span>·</span>
                    <span>%{partner?.trustScore ?? 100} Güven</span>
                  </div>
                </div>

                {/* Intent Comparison */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-[#eea62b]/5 border border-[#eea62b]/10 rounded-lg p-4 text-center">
                    <span className="text-xs uppercase tracking-widest text-[#eea62b]/60 block mb-1">Senin Hedefin</span>
                    <div className="flex items-center justify-center gap-2 text-[#eea62b] font-semibold">
                      <span>{INTENT_MAP[selectedIntent ?? '']?.emoji ?? '🎯'}</span>
                      <span>{INTENT_MAP[selectedIntent ?? '']?.label ?? selectedIntent}</span>
                    </div>
                  </div>
                  <div className="bg-[#eea62b]/5 border border-[#eea62b]/10 rounded-lg p-4 text-center">
                    <span className="text-xs uppercase tracking-widest text-[#eea62b]/60 block mb-1">Ortağının Hedefi</span>
                    <div className="flex items-center justify-center gap-2 text-[#eea62b] font-semibold">
                      <span>{INTENT_MAP[partner?.intent ?? '']?.emoji ?? '🎯'}</span>
                      <span>{INTENT_MAP[partner?.intent ?? '']?.label ?? partner?.intent ?? '—'}</span>
                    </div>
                  </div>
                </div>

                {/* Progress */}
                <div className="space-y-3">
                  <div className="w-full h-2.5 bg-[#221b10] rounded-full overflow-hidden border border-[#eea62b]/20">
                    <motion.div
                      className="h-full bg-[#eea62b] rounded-full shadow-[0_0_10px_#eea62b]"
                      initial={{ width: '0%' }}
                      animate={{ width: `${((5 - revealCountdown) / 5) * 100}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                  <p className="text-center text-[#eea62b]/60 text-sm italic">
                    Seans <span className="text-[#eea62b] font-bold">{revealCountdown} saniye</span> içinde başlıyor...
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* ============================================= */}
          {/* PHASE: SOLO OFFER (timeout fallback)          */}
          {/* ============================================= */}
          {phase === 'solo-offer' && (
            <motion.div
              key="solo"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full max-w-sm"
            >
              <div className="bg-[#221b10]/85 backdrop-blur-xl border border-[#eea62b]/20 rounded-xl shadow-2xl p-8 text-center space-y-6">
                <p className="text-white/70 text-lg">Eşleşme bulunamadı 😔</p>
                <p className="text-[#eea62b]/50 text-sm">Solo modda da harikasın!</p>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleStartSolo()}
                  className="w-full bg-[#eea62b] text-[#221b10] font-bold py-4 rounded-xl shadow-[0_0_20px_rgba(238,166,43,0.3)]"
                >
                  🧘 Solo Başla
                </motion.button>

                <div className="flex gap-4 justify-center">
                  <button
                    onClick={() => {
                      setMatchTimer(30);
                      setPhase('intent');
                    }}
                    className="text-[#eea62b]/50 hover:text-[#eea62b] text-sm transition-colors"
                  >
                    Tekrar dene
                  </button>
                  <button
                    onClick={() => router.push('/dashboard')}
                    className="text-white/30 hover:text-white/60 text-sm transition-colors"
                  >
                    Vazgeç
                  </button>
                </div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
