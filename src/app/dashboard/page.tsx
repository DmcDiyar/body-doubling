'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase-client';
import { useAuthStore } from '@/stores/auth-store';
import { AVATARS, FREE_DAILY_LIMIT } from '@/lib/constants';
import { useFullscreen } from '@/hooks/useFullscreen';
import { DashboardHeader } from '@/components/home/DashboardHeader';
import { ModeSelector } from '@/components/home/ModeSelector';
import { GoalPrompt } from '@/components/home/GoalPrompt';
import { TimerDisplay } from '@/components/home/TimerDisplay';
import { ActionButtons } from '@/components/home/ActionButtons';
import { ActiveMatchBanner } from '@/components/home/ActiveMatchBanner';
import { DailyLimitInfo } from '@/components/home/DailyLimitInfo';
import { UtilityButtons } from '@/components/home/UtilityButtons';
import { DashboardBottomNav } from '@/components/layout/DashboardBottomNav';
import { createSoloSession } from '@/lib/session-actions';
import type { User, UserLimit } from '@/types/database';

// ── Apple Easing ────────────────────────────────────
// cubic-bezier(0.16, 1, 0.3, 1) — Apple's secret weapon
const APPLE_EASE = [0.16, 1, 0.3, 1] as const;

// ── Staggered Exit Animations ───────────────────────
// Order: Header↑ → Mode↓ → Actions↓ → Utility↓ → BottomBar↓↓
// Each element has a specific direction and delay

const headerExit = {
  initial: { opacity: 1, y: 0 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.42, ease: APPLE_EASE } },
  exit: { opacity: 0, y: -24, transition: { duration: 0.42, ease: APPLE_EASE, delay: 0 } },
};

const headerEnter = {
  initial: { opacity: 0, y: -24 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.42, ease: APPLE_EASE, delay: 0.15 } },
};

const modeExit = {
  initial: { opacity: 1, y: 0 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.42, ease: APPLE_EASE } },
  exit: { opacity: 0, y: 32, transition: { duration: 0.42, ease: APPLE_EASE, delay: 0.04 } },
};

const modeEnter = {
  initial: { opacity: 0, y: 32 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.42, ease: APPLE_EASE, delay: 0.2 } },
};

const goalExit = {
  initial: { opacity: 1, y: 0 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.42, ease: APPLE_EASE } },
  exit: { opacity: 0, y: 24, transition: { duration: 0.38, ease: APPLE_EASE, delay: 0.06 } },
};

const goalEnter = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.42, ease: APPLE_EASE, delay: 0.25 } },
};

const actionsExit = {
  initial: { opacity: 1, y: 0 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.42, ease: APPLE_EASE } },
  exit: { opacity: 0, y: 24, transition: { duration: 0.42, ease: APPLE_EASE, delay: 0.08 } },
};

const actionsEnter = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.42, ease: APPLE_EASE, delay: 0.3 } },
};

const utilityExit = {
  initial: { opacity: 1, y: 0 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.38, ease: APPLE_EASE } },
  exit: { opacity: 0, y: 24, transition: { duration: 0.38, ease: APPLE_EASE, delay: 0.1 } },
};

const utilityEnter = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.42, ease: APPLE_EASE, delay: 0.35 } },
};

const bottomBarExit = {
  initial: { opacity: 1, y: 0 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.52, ease: APPLE_EASE } },
  exit: { opacity: 0, y: 100, transition: { duration: 0.52, ease: APPLE_EASE, delay: 0.06 } },
};

const bottomBarEnter = {
  initial: { opacity: 0, y: 100 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.52, ease: APPLE_EASE, delay: 0.4 } },
};

const finishBtnVariants = {
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

  // UI state
  const [duration, setDuration] = useState(25);
  const [dailyUsed, setDailyUsed] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [activeMatch, setActiveMatch] = useState<ActiveMatchInfo | null>(null);

  // Focus mode state
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // ── Data Loading ──────────────────────────────────
  useEffect(() => {
    const supabase = createClient();

    async function load() {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        router.push('/auth');
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle();

      if (profileError) {
        console.error('Profil yuklenemedi:', profileError.message);
        if (profileError.code === '42P01' || !profile) {
          const { data: newProfile } = await supabase
            .from('users')
            .upsert({
              id: authUser.id,
              email: authUser.email ?? '',
              name: authUser.email?.split('@')[0] ?? 'Kullanici',
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
            name: authUser.email?.split('@')[0] ?? 'Kullanici',
            avatar_id: 1,
          })
          .select('*')
          .single();
        if (newProfile) setUser(newProfile as User);
      }

      const today = new Date().toISOString().split('T')[0];
      const { data: limit } = await supabase
        .from('user_limits')
        .select('sessions_used')
        .eq('user_id', authUser.id)
        .eq('date', today)
        .maybeSingle();

      setDailyUsed((limit as UserLimit | null)?.sessions_used ?? 0);

      const { data: activeMatchResult } = await supabase.rpc('get_active_match');
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
      // Request wake lock to prevent screen from sleeping
      if ('wakeLock' in navigator) {
        navigator.wakeLock.request('screen').then((wl) => {
          wakeLockRef.current = wl;
        }).catch(() => {
          // Wake lock not available or denied — silent fail
        });
      }
    } else {
      // Release wake lock
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

  // ── Countdown Timer ───────────────────────────────
  useEffect(() => {
    if (!isFocusMode || timeRemaining <= 0) return;

    timerRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          handleFinish();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocusMode, timeRemaining > 0]);

  // ── Derived state ─────────────────────────────────
  const canStartSession = user?.is_premium || dailyUsed < FREE_DAILY_LIMIT;
  const isRestricted = user ? user.trust_score < 50 : false;
  const avatar = AVATARS.find(a => a.id === user?.avatar_id) ?? AVATARS[0];

  const timerMinutes = Math.floor(timeRemaining / 60);
  const timerSeconds = timeRemaining % 60;

  // ── Handlers ──────────────────────────────────────
  const handleSoloStart = async () => {
    if (!user || !canStartSession || isRestricted || isStarting) return;
    setIsStarting(true);

    const sessionId = await createSoloSession(user.id, duration);
    if (sessionId) {
      setCurrentSessionId(sessionId);
    }

    setTimeRemaining(duration * 60);
    setIsFocusMode(true);
    setIsStarting(false);
  };

  const handleFinish = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);

    if (currentSessionId) {
      const supabase = createClient();
      await supabase
        .from('sessions')
        .update({ status: 'completed', ended_at: new Date().toISOString() })
        .eq('id', currentSessionId);
    }

    // Small delay so completion flash can play
    await new Promise(r => setTimeout(r, 350));

    setIsFocusMode(false);
    setTimeRemaining(0);
    setCurrentSessionId(null);

    // Refresh daily usage
    const supabase = createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser) {
      const today = new Date().toISOString().split('T')[0];
      const { data: limit } = await supabase
        .from('user_limits')
        .select('sessions_used')
        .eq('user_id', authUser.id)
        .eq('date', today)
        .maybeSingle();
      setDailyUsed((limit as UserLimit | null)?.sessions_used ?? 0);
    }
  }, [currentSessionId]);

  const handleMatchStart = () => {
    if (!canStartSession || isRestricted) return;
    router.push(`/session/quick-match?duration=${duration}`);
  };

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

  const handleDismissMatch = async () => {
    if (!activeMatch) return;
    const supabase = createClient();
    await supabase.rpc('complete_match', { p_match_id: activeMatch.matchId });
    await supabase
      .from('sessions')
      .update({ status: 'abandoned', ended_at: new Date().toISOString() })
      .eq('id', activeMatch.sessionId)
      .in('status', ['waiting', 'preparing', 'active']);
    setActiveMatch(null);
  };

  const handleReset = () => setDuration(25);

  // ── Loading ───────────────────────────────────────
  if (isLoading || !user) {
    return (
      <div className="min-h-screen bg-[#0B0E14] flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-white/40 text-lg"
        >
          Yukleniyor...
        </motion.div>
      </div>
    );
  }

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
        {/* Overlay — darkens in focus mode */}
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

        {/* ─── HEADER (slides UP on exit) ─── */}
        <AnimatePresence mode="wait">
          {!isFocusMode && (
            <motion.div key="header" {...headerExit} {...headerEnter}>
              <DashboardHeader avatarEmoji={avatar.emoji} userName={user.name} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Active match banner */}
        <AnimatePresence>
          {!isFocusMode && activeMatch && (
            <motion.div key="match-banner" {...headerExit} {...headerEnter}>
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

        {/* ─── MODE SELECTOR (slides DOWN on exit) ─── */}
        <AnimatePresence mode="wait">
          {!isFocusMode && (
            <motion.div key="mode-selector" {...modeExit} {...modeEnter} className="mb-8">
              <ModeSelector selected={duration} onChange={setDuration} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─── GOAL PROMPT (slides DOWN on exit) ─── */}
        <AnimatePresence mode="wait">
          {!isFocusMode && (
            <motion.div key="goal-prompt" {...goalExit} {...goalEnter}>
              <GoalPrompt />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─── TIMER — ALWAYS VISIBLE (hero element) ─── */}
        <div className="flex items-center justify-center mb-8">
          {isFocusMode ? (
            <TimerDisplay minutes={timerMinutes} seconds={timerSeconds} isFocusMode />
          ) : (
            <TimerDisplay minutes={duration} />
          )}
        </div>

        {/* ─── ACTION BUTTONS (slides DOWN on exit) ─── */}
        <AnimatePresence mode="wait">
          {!isFocusMode && (
            <motion.div key="action-buttons" {...actionsExit} {...actionsEnter}>
              <ActionButtons
                onSoloStart={handleSoloStart}
                onMatchStart={handleMatchStart}
                canStart={canStartSession}
                isRestricted={isRestricted}
                isStarting={isStarting}
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

        {/* ─── FOCUS MODE: Bitir Button ─── */}
        <AnimatePresence>
          {isFocusMode && (
            <motion.div
              key="finish-btn"
              {...finishBtnVariants}
              className="flex justify-center"
            >
              <button
                onClick={handleFinish}
                className="bg-white/[0.1] border border-white/[0.15] text-white text-lg
                           font-semibold px-14 py-4 rounded-2xl
                           shadow-2xl hover:bg-white/[0.15] active:scale-[0.97]"
                style={{
                  transition: 'background-color 300ms, transform 200ms cubic-bezier(0.16, 1, 0.3, 1)',
                }}
              >
                Bitir
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─── UTILITY BUTTONS (slides DOWN on exit) ─── */}
        <AnimatePresence mode="wait">
          {!isFocusMode && (
            <motion.div key="utility-buttons" {...utilityExit} {...utilityEnter}>
              <UtilityButtons onReset={handleReset} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Spacer */}
        <div className="flex-1" />
      </div>

      {/* ─── BOTTOM NAV (cinematic slide DOWN on exit) ─── */}
      <AnimatePresence mode="wait">
        {!isFocusMode && (
          <motion.div key="bottom-nav" {...bottomBarExit} {...bottomBarEnter}>
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
