'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase-client';
import { useAuthStore } from '@/stores/auth-store';
import { AVATARS, FREE_DAILY_LIMIT } from '@/lib/constants';
import { useFullscreen } from '@/hooks/useFullscreen';
import { useLiveStats } from '@/hooks/useRitualFlow';
import { DashboardHeader } from '@/components/home/DashboardHeader';
import { ModeSelector } from '@/components/home/ModeSelector';
import { GoalPrompt } from '@/components/home/GoalPrompt';
import { TimerDisplay } from '@/components/home/TimerDisplay';
import { ActionButtons } from '@/components/home/ActionButtons';
import { ActiveMatchBanner } from '@/components/home/ActiveMatchBanner';
import { DailyLimitInfo } from '@/components/home/DailyLimitInfo';
import { UtilityButtons } from '@/components/home/UtilityButtons';
import { FocusControls } from '@/components/home/FocusControls';
import { DashboardBottomNav } from '@/components/layout/DashboardBottomNav';
import {
  createSoloSession,
  completeSoloSession,
  abandonSession,
  refreshUserProfile,
  refreshDailyUsage,
  beaconAbandonSession,
} from '@/lib/session-actions';
import type { User, UserLimit } from '@/types/database';

// ── Apple Easing ────────────────────────────────────
const APPLE_EASE = [0.16, 1, 0.3, 1] as const;

// ── Timer State Machine ─────────────────────────────
type TimerState = 'idle' | 'running' | 'paused';

// ── Staggered Animations ────────────────────────────
const headerAnim = {
  initial: { opacity: 0, y: -24 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.42, ease: APPLE_EASE, delay: 0.15 } },
  exit: { opacity: 0, y: -24, transition: { duration: 0.42, ease: APPLE_EASE, delay: 0 } },
};

const modeAnim = {
  initial: { opacity: 0, y: 32 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.42, ease: APPLE_EASE, delay: 0.2 } },
  exit: { opacity: 0, y: 32, transition: { duration: 0.42, ease: APPLE_EASE, delay: 0.04 } },
};

const goalAnim = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.42, ease: APPLE_EASE, delay: 0.25 } },
  exit: { opacity: 0, y: 24, transition: { duration: 0.38, ease: APPLE_EASE, delay: 0.06 } },
};

const actionsAnim = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.42, ease: APPLE_EASE, delay: 0.3 } },
  exit: { opacity: 0, y: 24, transition: { duration: 0.42, ease: APPLE_EASE, delay: 0.08 } },
};

const utilityAnim = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.42, ease: APPLE_EASE, delay: 0.35 } },
  exit: { opacity: 0, y: 24, transition: { duration: 0.38, ease: APPLE_EASE, delay: 0.1 } },
};

const bottomBarAnim = {
  initial: { opacity: 0, y: 100 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.52, ease: APPLE_EASE, delay: 0.4 } },
  exit: { opacity: 0, y: 100, transition: { duration: 0.52, ease: APPLE_EASE, delay: 0.06 } },
};

const focusControlsAnim = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.42, ease: APPLE_EASE, delay: 0.35 } },
  exit: { opacity: 0, y: 20, transition: { duration: 0.25, ease: APPLE_EASE } },
};

// ── Types ───────────────────────────────────────────
interface ActiveMatchInfo {
  matchId: string;
  sessionId: string;
  state: string;
}

// ── Component ───────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter();
  const { user, setUser } = useAuthStore();
  const { isFullscreen, isSupported: isFullscreenSupported, toggle: toggleFullscreen } = useFullscreen();

  // FOMO: live stats
  const { stats } = useLiveStats();

  // UI state
  const [duration, setDuration] = useState(25);
  const [dailyUsed, setDailyUsed] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [activeMatch, setActiveMatch] = useState<ActiveMatchInfo | null>(null);

  // Timer state machine: idle → running ⇄ paused → idle
  const [timerState, setTimerState] = useState<TimerState>('idle');
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const sessionStartTimeRef = useRef<number>(0);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const isFocusMode = timerState === 'running';
  const isPaused = timerState === 'paused';

  // ── Data Loading (PARALLEL — fixed waterfall) ─────
  useEffect(() => {
    const supabase = createClient();

    async function load() {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        router.push('/auth');
        return;
      }

      // Parallel fetch: profile + daily limits + active match
      const [profileResult, limitResult, matchResult] = await Promise.all([
        supabase.from('users').select('*').eq('id', authUser.id).maybeSingle(),
        supabase.from('user_limits').select('sessions_used')
          .eq('user_id', authUser.id)
          .eq('date', new Date().toISOString().split('T')[0])
          .maybeSingle(),
        supabase.rpc('get_active_match'),
      ]);

      // Profile handling
      const { data: profile, error: profileError } = profileResult;
      if (profileError) {
        console.error('Profil yüklenemedi:', profileError.message);
        if (profileError.code === '42P01' || !profile) {
          const { data: newProfile } = await supabase
            .from('users')
            .upsert({
              id: authUser.id,
              email: authUser.email ?? '',
              name: authUser.email?.split('@')[0] ?? 'Kullanıcı',
              avatar_id: 1,
            })
            .select('*')
            .single();
          if (newProfile) {
            router.push('/onboarding');
            return;
          }
        }
      } else if (profile) {
        const emailPrefix = authUser.email?.split('@')[0] || '';
        const googleName = authUser.user_metadata?.full_name || authUser.user_metadata?.name || '';
        const isAutoGenerated =
          profile.avatar_id === 1 &&
          (profile.name === emailPrefix || profile.name === googleName || profile.name === '');

        if (isAutoGenerated) {
          router.push('/onboarding');
          return;
        }

        setUser(profile as User);
      } else {
        const { data: newProfile } = await supabase
          .from('users')
          .upsert({
            id: authUser.id,
            email: authUser.email ?? '',
            name: authUser.email?.split('@')[0] ?? 'Kullanıcı',
            avatar_id: 1,
          })
          .select('*')
          .single();
        if (newProfile) setUser(newProfile as User);
      }

      // Daily usage
      setDailyUsed((limitResult.data as UserLimit | null)?.sessions_used ?? 0);

      // Active match
      const activeMatchResult = matchResult.data;
      if (activeMatchResult && activeMatchResult.has_active) {
        setActiveMatch({
          matchId: activeMatchResult.match_id,
          sessionId: activeMatchResult.session_id,
          state: activeMatchResult.can_rejoin ? 'broken' : 'active',
        });
      }

      setIsLoading(false);
    }

    load();
  }, [router, setUser]);

  // ── Screen Wake Lock ──────────────────────────────
  useEffect(() => {
    if (isFocusMode) {
      if ('wakeLock' in navigator) {
        navigator.wakeLock.request('screen').then((wl) => {
          wakeLockRef.current = wl;
        }).catch(() => { });
      }
    } else {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => { });
        wakeLockRef.current = null;
      }
    }
    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => { });
        wakeLockRef.current = null;
      }
    };
  }, [isFocusMode]);

  // ── Beforeunload: abandon active session on page close ──
  useEffect(() => {
    const handler = () => {
      if (currentSessionId && timerState !== 'idle') {
        beaconAbandonSession(currentSessionId);
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [currentSessionId, timerState]);

  // ── FINISH handler (stable ref for timer) ─────────
  const handleFinish = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);

    const sid = currentSessionId;
    const uid = user?.id;

    if (sid && uid) {
      await completeSoloSession(sid, uid, false);
    }

    await new Promise(r => setTimeout(r, 350));

    setTimerState('idle');
    setTimeRemaining(0);
    setCurrentSessionId(null);

    const freshProfile = await refreshUserProfile();
    if (freshProfile) setUser(freshProfile);

    if (uid) {
      const used = await refreshDailyUsage(uid);
      setDailyUsed(used);
    }
  }, [currentSessionId, user?.id, setUser]);

  // ── Countdown Timer (drift-corrected, fixed closure) ──
  useEffect(() => {
    if (timerState !== 'running' || timeRemaining <= 0) return;

    startTimeRef.current = Date.now();
    const expectedRemaining = timeRemaining;

    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const corrected = expectedRemaining - elapsed;

      if (corrected <= 0) {
        clearInterval(timerRef.current!);
        setTimeRemaining(0);
        handleFinish();
      } else {
        setTimeRemaining(corrected);
      }
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timerState, handleFinish]);

  // ── Derived state ─────────────────────────────────
  const canStartSession = user?.is_premium || dailyUsed < FREE_DAILY_LIMIT;
  const isRestricted = user ? user.trust_score < 50 : false;
  const avatar = AVATARS.find(a => a.id === user?.avatar_id) ?? AVATARS[0];

  const timerMinutes = Math.floor(timeRemaining / 60);
  const timerSeconds = timeRemaining % 60;

  // FOMO: waiting count for selected duration
  const waitingCount = (stats?.waiting as Record<string, number> | undefined)?.[String(duration)] ?? 0;

  // ── Handle mode change while paused ───────────────
  const handleModeChange = (newDuration: number) => {
    setDuration(newDuration);
    if (isPaused) {
      setTimeRemaining(0);
      setTimerState('idle');
      if (currentSessionId && user) {
        abandonSession(currentSessionId, user.id);
        setCurrentSessionId(null);
      }
    }
  };

  // ── BAŞLA / Devam Et ──────────────────────────────
  const handleSoloStart = async () => {
    if (!user || !canStartSession || isRestricted || isStarting) return;

    if (isPaused && timeRemaining > 0) {
      setTimerState('running');
      return;
    }

    setIsStarting(true);
    const sessionId = await createSoloSession(user.id, duration);
    if (sessionId) {
      setCurrentSessionId(sessionId);
      sessionStartTimeRef.current = Date.now();
    }
    setTimeRemaining(duration * 60);
    setTimerState('running');
    setIsStarting(false);
  };

  // ── DURAKLAT ──────────────────────────────────────
  const handlePause = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimerState('paused');
  };

  // ── RESET ─────────────────────────────────────────
  const handleReset = async () => {
    if (!user || !canStartSession || isRestricted) return;

    if (currentSessionId) {
      if (timerRef.current) clearInterval(timerRef.current);
      await abandonSession(currentSessionId, user.id);
      setCurrentSessionId(null);
    }

    setIsStarting(true);
    const sessionId = await createSoloSession(user.id, duration);
    if (sessionId) {
      setCurrentSessionId(sessionId);
      sessionStartTimeRef.current = Date.now();
    }
    setTimeRemaining(duration * 60);
    setTimerState('running');
    setIsStarting(false);
  };

  // ── Simple reset (idle mode) ──────────────────────
  const handleSimpleReset = () => {
    if (timerState !== 'idle') return;
    setDuration(25);
  };

  // ── EŞLEŞME BUL ──────────────────────────────────
  const handleMatchStart = () => {
    if (!canStartSession || isRestricted) return;
    router.push(`/session/quick-match?duration=${duration}`);
  };

  // ── REJOIN ────────────────────────────────────────
  const handleRejoin = async () => {
    if (!activeMatch) return;
    if (activeMatch.state === 'active') {
      router.push(`/session/active?id=${activeMatch.sessionId}`);
    } else if (activeMatch.state === 'preparing') {
      router.push(`/session/prepare?id=${activeMatch.sessionId}`);
    } else if (activeMatch.state === 'broken') {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('rejoin_match', {
        p_match_id: activeMatch.matchId,
      });
      if (error || !(data as { success: boolean })?.success) {
        setActiveMatch(null);
        return;
      }
      router.push(`/session/active?id=${activeMatch.sessionId}`);
    }
  };

  // ── DISMISS MATCH ─────────────────────────────────
  const handleDismissMatch = async () => {
    if (!activeMatch) return;
    const supabase = createClient();
    await supabase.rpc('complete_match', { p_match_id: activeMatch.matchId });
    await abandonSession(activeMatch.sessionId);
    setActiveMatch(null);
  };

  // ── Loading ───────────────────────────────────────
  if (isLoading || !user) {
    return (
      <div className="min-h-screen bg-[#0B0E14] flex items-center justify-center">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-white/40 text-lg">
          Yükleniyor...
        </motion.div>
      </div>
    );
  }

  const showDashboardUI = !isFocusMode;

  // ── Render ────────────────────────────────────────
  return (
    <div className="relative h-screen overflow-hidden flex flex-col">
      {/* Background Image */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/images/backgrounds/1b651162dfdd425d13f7.jpg"
          alt="Focus background"
          fill
          priority
          className="object-cover"
          sizes="100vw"
          quality={90}
        />
        <motion.div
          className="absolute inset-0"
          animate={{
            background: isFocusMode
              ? 'linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.75))'
              : 'linear-gradient(rgba(0,0,0,0.25), rgba(0,0,0,0.55))',
          }}
          transition={{ duration: 0.6, ease: APPLE_EASE }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col h-full px-6 pb-24">

        {/* ─── HEADER ─── */}
        <AnimatePresence mode="wait">
          {showDashboardUI && (
            <motion.div key="header" {...headerAnim}>
              <DashboardHeader
                avatarEmoji={avatar.emoji}
                userName={user.name}
                streak={user.current_streak}
                activeUsers={stats?.activeUsers ?? 0}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Active match banner */}
        <AnimatePresence>
          {showDashboardUI && activeMatch && (
            <motion.div key="match-banner" {...headerAnim}>
              <ActiveMatchBanner
                activeMatch={activeMatch}
                onRejoin={handleRejoin}
                onDismiss={handleDismissMatch}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Spacer */}
        <div className="flex-1" />

        {/* ─── MODE SELECTOR ─── */}
        <AnimatePresence mode="wait">
          {showDashboardUI && (
            <motion.div key="mode-selector" {...modeAnim} className="mb-8">
              <ModeSelector selected={duration} onChange={handleModeChange} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─── GOAL PROMPT ─── */}
        <AnimatePresence mode="wait">
          {showDashboardUI && (
            <motion.div key="goal-prompt" {...goalAnim}>
              <GoalPrompt />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─── TIMER — ALWAYS VISIBLE (hero) ─── */}
        <div className="flex items-center justify-center mb-8">
          {timerState !== 'idle' ? (
            <TimerDisplay minutes={timerMinutes} seconds={timerSeconds} isFocusMode={isFocusMode} />
          ) : (
            <TimerDisplay minutes={duration} />
          )}
        </div>

        {/* ─── Paused indicator ─── */}
        <AnimatePresence>
          {isPaused && (
            <motion.div
              key="pause-indicator"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center mb-4"
            >
              <span className="text-white/30 text-sm font-medium tracking-wider uppercase">
                Duraklatıldı
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─── ACTION BUTTONS (idle & paused) ─── */}
        <AnimatePresence mode="wait">
          {showDashboardUI && (
            <motion.div key="action-buttons" {...actionsAnim}>
              <ActionButtons
                onSoloStart={handleSoloStart}
                onMatchStart={handleMatchStart}
                canStart={canStartSession}
                isRestricted={isRestricted}
                isStarting={isStarting}
                isPaused={isPaused}
                waitingCount={waitingCount}
              />
              <DailyLimitInfo
                used={dailyUsed}
                limit={FREE_DAILY_LIMIT}
                isPremium={user.is_premium}
                canStart={canStartSession}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─── FOCUS MODE: Duraklat + Bitir ─── */}
        <AnimatePresence>
          {isFocusMode && (
            <motion.div key="focus-controls" {...focusControlsAnim}>
              <FocusControls onPause={handlePause} onFinish={handleFinish} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─── UTILITY BUTTONS + RESET ─── */}
        <AnimatePresence mode="wait">
          {showDashboardUI && (
            <motion.div key="utility-buttons" {...utilityAnim}>
              {isPaused ? (
                <div className="flex items-center justify-center gap-6 mt-10 text-white/40">
                  <button
                    onClick={handleReset}
                    className="flex items-center gap-2 hover:text-white/80 transition-colors
                               p-2 rounded-xl hover:bg-white/[0.05] text-sm font-medium"
                    title="Süreyi sıfırla ve yeniden başla"
                    aria-label="Sıfırla ve başla"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="23 4 23 10 17 10" />
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                    </svg>
                    Sıfırla ve Başla
                  </button>
                </div>
              ) : (
                <UtilityButtons onReset={handleSimpleReset} />
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Spacer */}
        <div className="flex-1" />
      </div>

      {/* ─── BOTTOM NAV ─── */}
      <AnimatePresence mode="wait">
        {showDashboardUI && (
          <motion.div key="bottom-nav" {...bottomBarAnim}>
            <DashboardBottomNav
              streak={user.current_streak}
              dailyUsed={dailyUsed}
              dailyLimit={FREE_DAILY_LIMIT}
              isPremium={user.is_premium}
              isFullscreen={isFullscreen}
              isFullscreenSupported={isFullscreenSupported}
              onToggleFullscreen={toggleFullscreen}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
