'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import { useAuthStore } from '@/stores/auth-store';
import { AVATARS, getTrustLevel, FREE_DAILY_LIMIT } from '@/lib/constants';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import { BottomNav } from '@/components/layout/BottomNav';
import { buildTrendItems, getTrendArrow, getOverallInsight } from '@/lib/self-competition';
import type { SelfComparisonData, TrendItem } from '@/lib/self-competition';
import type { DailyQuest, WeeklyQuest } from '@/components/quests/QuestComponents';
import { DAILY_QUEST_INFO, WEEKLY_QUEST_INFO } from '@/components/quests/QuestComponents';
import type { User } from '@/types/database';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONSTANTS & TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const MONTH_NAMES = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
];
const DOW_SHORT = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pa'];

// Level progression system
function getLevelInfo(level: number) {
  if (level >= 51) return { emoji: '✨', title: 'Transcendent', gradient: 'from-violet-400 to-fuchsia-400' };
  if (level >= 41) return { emoji: '🌟', title: 'İkon', gradient: 'from-yellow-300 to-amber-400' };
  if (level >= 31) return { emoji: '👑', title: 'Efsane', gradient: 'from-amber-400 to-orange-500' };
  if (level >= 21) return { emoji: '🏆', title: 'Usta', gradient: 'from-orange-400 to-red-500' };
  if (level >= 16) return { emoji: '💎', title: 'Elit Odakçı', gradient: 'from-cyan-400 to-blue-500' };
  if (level >= 11) return { emoji: '⚡', title: 'Odak Ustası', gradient: 'from-amber-400 to-yellow-500' };
  if (level >= 6)  return { emoji: '🔥', title: 'Aktif Öğrenci', gradient: 'from-orange-400 to-red-400' };
  return { emoji: '🌱', title: 'Başlangıç', gradient: 'from-green-400 to-emerald-500' };
}

// Badge progress estimation
function getBadgeProgress(code: string, user: User): number {
  switch (code) {
    case 'FIRST_SESSION': return Math.min(user.completed_sessions / 1, 1);
    case 'STREAK_3': return Math.min(user.current_streak / 3, 1);
    case 'STREAK_7': return Math.min(user.current_streak / 7, 1);
    case 'STREAK_30': return Math.min(user.current_streak / 30, 1);
    case 'SESSIONS_10': return Math.min(user.completed_sessions / 10, 1);
    case 'SESSIONS_50': return Math.min(user.completed_sessions / 50, 1);
    case 'SESSIONS_100': return Math.min(user.completed_sessions / 100, 1);
    case 'PERFECT_WEEK': return Math.min(user.current_streak / 7, 1);
    case 'FOCUS_500': return Math.min(user.total_minutes / 500, 1);
    case 'TRUST_120': return Math.min(user.trust_score / 120, 1);
    default: return 0;
  }
}

// Stagger animation variants
const stagger = {
  container: { transition: { staggerChildren: 0.08 } },
  item: {
    hidden: { opacity: 0, y: 24 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.34, 1.56, 0.64, 1] } },
  },
};

// ── RPC Return Types ──

interface FocusScore {
  score: number;
  breakdown: { consistency: number; completion: number; streak: number; volume: number };
  trend: 'up' | 'down' | 'stable';
  previous_score: number;
}

interface HeatmapDay {
  date: string;
  dow: number;
  slots: Record<'sabah' | 'ogle' | 'aksam' | 'gece', { sessions: number; minutes: number }>;
}

interface CalendarDay {
  day: number;
  sessions: number;
  minutes: number;
  completed: boolean;
}

interface MonthlyCalendar {
  year: number;
  month: number;
  days: CalendarDay[];
  total_active_days: number;
  total_sessions: number;
  total_minutes: number;
}

interface PersonalRecords {
  longest_streak: number;
  longest_session_minutes: number;
  most_sessions_in_day: { date: string; count: number } | null;
  earliest_session: { hour: number; date: string } | null;
  latest_session: { hour: number; date: string } | null;
  total_active_days: number;
  first_session_date: string | null;
}

interface SilentMemoryMessage {
  type: string;
  text: string;
  priority: number;
}

interface Badge {
  code: string;
  name: string;
  description: string;
  icon: string;
  rarity: string;
  unlocked: boolean;
  unlocked_at: string | null;
}

interface BadgeData {
  badges: Badge[];
  total: number;
  unlocked: number;
}

interface CommunityPulse {
  active_users: number;
  today_sessions: number;
  today_minutes: number;
  peak_hour: number | null;
  active_now_message: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN PAGE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function StatsPage() {
  const router = useRouter();
  const { user, setUser } = useAuthStore();
  const [loading, setLoading] = useState(true);

  const [focusScore, setFocusScore] = useState<FocusScore | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapDay[]>([]);
  const [calendar, setCalendar] = useState<MonthlyCalendar | null>(null);
  const [records, setRecords] = useState<PersonalRecords | null>(null);
  const [memory, setMemory] = useState<SilentMemoryMessage[]>([]);
  const [badgeData, setBadgeData] = useState<BadgeData | null>(null);
  const [pulse, setPulse] = useState<CommunityPulse | null>(null);
  const [dailyUsed, setDailyUsed] = useState(0);
  const [selfComp, setSelfComp] = useState<SelfComparisonData | null>(null);
  const [dailyQuest, setDailyQuest] = useState<DailyQuest | null>(null);
  const [weeklyQuest, setWeeklyQuest] = useState<WeeklyQuest | null>(null);
  const [compRange, setCompRange] = useState<'week' | 'month'>('week');

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { router.push('/auth'); return; }

      let profile = user;
      if (!profile) {
        const { data: p } = await supabase
          .from('users').select('*').eq('id', authUser.id).maybeSingle();
        if (p) { setUser(p as User); profile = p as User; }
      }

      if (profile?.metadata) {
        const meta = profile.metadata as Record<string, unknown>;
        if (meta.daily_quest) setDailyQuest(meta.daily_quest as DailyQuest);
        if (meta.weekly_quest) setWeeklyQuest(meta.weekly_quest as WeeklyQuest);
      }

      const today = new Date().toISOString().split('T')[0];
      const { data: limitData } = await supabase
        .from('user_limits').select('sessions_used')
        .eq('user_id', authUser.id).eq('date', today).maybeSingle();
      if (limitData) setDailyUsed(limitData.sessions_used);

      const uid = authUser.id;
      const now = new Date();
      const [focusRes, heatRes, calRes, recRes, memRes, badgeRes, pulseRes, compRes] =
        await Promise.allSettled([
          supabase.rpc('get_focus_score', { p_user_id: uid }),
          supabase.rpc('get_focus_heatmap', { p_user_id: uid, p_days: 7 }),
          supabase.rpc('get_monthly_calendar', { p_user_id: uid, p_year: now.getFullYear(), p_month: now.getMonth() + 1 }),
          supabase.rpc('get_personal_records', { p_user_id: uid }),
          supabase.rpc('get_silent_memory', { p_user_id: uid }),
          supabase.rpc('get_user_badges', { p_user_id: uid }),
          supabase.rpc('get_community_pulse'),
          supabase.rpc('get_self_comparison', { p_user_id: uid, p_range: 'week' }),
        ]);

      if (focusRes.status === 'fulfilled' && focusRes.value.data) setFocusScore(focusRes.value.data as FocusScore);
      if (heatRes.status === 'fulfilled' && heatRes.value.data) setHeatmap((heatRes.value.data as { days: HeatmapDay[] }).days ?? []);
      if (calRes.status === 'fulfilled' && calRes.value.data) setCalendar(calRes.value.data as MonthlyCalendar);
      if (recRes.status === 'fulfilled' && recRes.value.data) setRecords(recRes.value.data as PersonalRecords);
      if (memRes.status === 'fulfilled' && memRes.value.data) setMemory((memRes.value.data as { messages: SilentMemoryMessage[] }).messages ?? []);
      if (badgeRes.status === 'fulfilled' && badgeRes.value.data) setBadgeData(badgeRes.value.data as BadgeData);
      if (pulseRes.status === 'fulfilled' && pulseRes.value.data) setPulse(pulseRes.value.data as CommunityPulse);
      if (compRes.status === 'fulfilled' && compRes.value.data) setSelfComp(compRes.value.data as SelfComparisonData);

      setLoading(false);
    }
    load();
  }, [router, setUser, user]);

  const toggleCompRange = useCallback(async () => {
    const next = compRange === 'week' ? 'month' : 'week';
    setCompRange(next);
    const supabase = createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;
    const { data } = await supabase.rpc('get_self_comparison', { p_user_id: authUser.id, p_range: next });
    if (data) setSelfComp(data as SelfComparisonData);
  }, [compRange]);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    router.push('/auth');
  };

  // Derived
  const trustLevel = user ? getTrustLevel(user.trust_score) : null;
  const avatar = user ? AVATARS.find(a => a.id === user.avatar_id)?.emoji ?? '🐱' : '🐱';
  const xpInLevel = user ? user.xp % 100 : 0;
  const xpToNext = 100 - xpInLevel;
  const levelInfo = user ? getLevelInfo(user.level) : getLevelInfo(1);
  const nextLevelInfo = user ? getLevelInfo(user.level + 1) : getLevelInfo(2);
  const trendItems = useMemo(() => selfComp ? buildTrendItems(selfComp) : [], [selfComp]);
  const overallInsight = useMemo(() => trendItems.length > 0 ? getOverallInsight(trendItems) : '', [trendItems]);
  const completionRate = user && user.total_sessions > 0
    ? Math.round((user.completed_sessions / user.total_sessions) * 100) : 0;

  // Loading — skeleton shimmer
  if (!user || loading) {
    return (
      <div className="min-h-screen bg-[#1a1f29] pb-28">
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -bottom-32 -left-32 w-[600px] h-[600px] bg-[#ffca75]/[0.04] rounded-full blur-[150px]" />
          <div className="absolute -top-32 -right-32 w-[500px] h-[500px] bg-[#4ECDC4]/[0.03] rounded-full blur-[150px]" />
        </div>
        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 pt-8">
          {/* Hero skeleton */}
          <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-6 sm:p-8 mb-6 animate-pulse">
            <div className="flex flex-col sm:flex-row items-center gap-5">
              <div className="w-20 h-20 rounded-2xl bg-white/[0.06]" />
              <div className="flex-1 w-full space-y-3">
                <div className="h-5 bg-white/[0.06] rounded-lg w-40 mx-auto sm:mx-0" />
                <div className="h-4 bg-white/[0.04] rounded-lg w-32 mx-auto sm:mx-0" />
                <div className="h-2.5 bg-white/[0.06] rounded-full w-full" />
                <div className="h-3 bg-white/[0.03] rounded-lg w-28" />
              </div>
            </div>
          </div>
          {/* Grid skeleton */}
          <div className="lg:grid lg:grid-cols-[2fr_3fr] lg:gap-6">
            <div className="space-y-4 mb-4 lg:mb-0">
              <div className="grid grid-cols-2 gap-3">
                {[0,1,2,3].map(i => (
                  <div key={i} className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-3.5 h-20 animate-pulse" style={{ animationDelay: `${i * 100}ms` }}>
                    <div className="h-3 bg-white/[0.06] rounded w-16 mb-3" />
                    <div className="h-5 bg-white/[0.06] rounded w-12" />
                  </div>
                ))}
              </div>
              <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-5 h-40 animate-pulse" style={{ animationDelay: '200ms' }} />
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-5 h-48 animate-pulse" style={{ animationDelay: '100ms' }} />
                <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-5 h-48 animate-pulse" style={{ animationDelay: '200ms' }} />
              </div>
              <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-5 h-32 animate-pulse" style={{ animationDelay: '300ms' }} />
              <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-5 h-28 animate-pulse" style={{ animationDelay: '400ms' }} />
            </div>
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1a1f29] pb-28 overflow-x-hidden">
      {/* ── Ambient gradient orbs ── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -bottom-32 -left-32 w-[600px] h-[600px] bg-[#ffca75]/[0.04] rounded-full blur-[150px]" />
        <div className="absolute -top-32 -right-32 w-[500px] h-[500px] bg-[#4ECDC4]/[0.03] rounded-full blur-[150px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-purple-500/[0.02] rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 pt-8">

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            HERO SECTION (Full Width, Centered)
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <motion.section
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
          className="mb-6"
        >
          <GlassCard className="p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row items-center gap-5">
              {/* Avatar */}
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#ffca75]/20 to-[#ffca75]/5 border border-[#ffca75]/20 flex items-center justify-center text-4xl shrink-0 shadow-lg shadow-[#ffca75]/5">
                {avatar}
              </div>

              <div className="flex-1 min-w-0 text-center sm:text-left w-full">
                {/* Name + trust badge */}
                <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
                  <h1 className="text-[#f7fafc] text-xl font-bold truncate">{user.name}</h1>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase shrink-0"
                    style={{ backgroundColor: trustLevel?.color + '15', color: trustLevel?.color }}>
                    {trustLevel?.labelTR}
                  </span>
                </div>

                {/* Level title */}
                <div className="flex items-center justify-center sm:justify-start gap-2 mb-4">
                  <span className="text-lg">{levelInfo.emoji}</span>
                  <span className={`text-sm font-semibold bg-gradient-to-r ${levelInfo.gradient} bg-clip-text text-transparent`}>
                    Seviye {user.level} — {levelInfo.title}
                  </span>
                </div>

                {/* XP Progress Bar (large) */}
                <div className="w-full">
                  <div className="flex justify-between mb-1.5">
                    <span className="text-xs text-white/40 font-medium">{xpInLevel} / 100 XP</span>
                    <span className="text-xs text-white/30">{xpToNext} XP kaldı</span>
                  </div>
                  <div className="h-2.5 bg-white/[0.06] rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${xpInLevel}%` }}
                      transition={{ duration: 1.2, ease: 'easeOut', delay: 0.4 }}
                      className={`h-full rounded-full bg-gradient-to-r ${levelInfo.gradient} shadow-sm`}
                      style={{ boxShadow: '0 0 12px rgba(255,202,117,0.3)' }}
                    />
                  </div>
                  {/* Next level preview */}
                  <p className="text-[10px] text-white/25 mt-1.5">
                    Sonraki: {nextLevelInfo.emoji} {nextLevelInfo.title}
                  </p>
                </div>
              </div>

              {/* Quick stats pills (desktop) */}
              <div className="hidden sm:flex flex-col gap-2 shrink-0">
                {focusScore && (
                  <div className="flex items-center gap-2 bg-white/[0.04] rounded-xl px-4 py-2">
                    <span className="text-2xl font-bold text-[#ffca75] tabular-nums">{focusScore.score}</span>
                    <span className="text-[10px] text-white/40 uppercase tracking-wider">Odak<br/>Skoru</span>
                  </div>
                )}
                <div className="flex items-center gap-2 bg-white/[0.04] rounded-xl px-4 py-2">
                  <span className="text-2xl font-bold text-orange-400 tabular-nums">{user.current_streak}</span>
                  <span className="text-[10px] text-white/40 uppercase tracking-wider">Günlük<br/>Seri 🔥</span>
                </div>
              </div>
            </div>
          </GlassCard>
        </motion.section>

        {/* ━━━ SILENT MEMORY (FOMO banner) ━━━ */}
        <AnimatePresence>
          {memory.length > 0 && (
            <motion.section
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-6"
            >
              <div className="bg-gradient-to-r from-[#ffca75]/[0.07] to-[#4ECDC4]/[0.04] border border-[#ffca75]/10 rounded-xl px-5 py-3.5 backdrop-blur-sm">
                <p className="text-[#ffca75]/80 text-sm leading-relaxed font-medium">{memory[0].text}</p>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            TWO-COLUMN GRID (40/60 on Desktop)
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <div className="lg:grid lg:grid-cols-[2fr_3fr] lg:gap-6">

          {/* ── LEFT COLUMN (40%) ── */}
          <motion.div
            initial="hidden"
            animate="visible"
            variants={stagger.container}
            className="space-y-4 mb-4 lg:mb-0"
          >
            {/* Quick Stats Grid (2×2) */}
            <motion.div variants={stagger.item} className="grid grid-cols-2 gap-3">
              <MiniStatCard
                icon="🔥"
                label="Aktif Seri"
                value={user.current_streak}
                unit="gün"
                accent="from-orange-500/15 to-red-500/5"
                textColor="text-orange-400"
                trend={selfComp ? (selfComp.current.streak > 0 ? 'up' : 'same') : undefined}
              />
              <MiniStatCard
                icon="⏱"
                label="Toplam"
                value={Math.floor(user.total_minutes / 60)}
                unit={`s ${user.total_minutes % 60}dk`}
                accent="from-[#ffca75]/15 to-yellow-500/5"
                textColor="text-[#ffca75]"
                trend={selfComp ? (selfComp.current.minutes > selfComp.previous.minutes ? 'up' : selfComp.current.minutes < selfComp.previous.minutes ? 'down' : 'same') : undefined}
              />
              <MiniStatCard
                icon="🛡"
                label="Güven"
                value={user.trust_score}
                unit="/ 200"
                accent="from-blue-500/15 to-cyan-500/5"
                textColor="text-blue-400"
              />
              <MiniStatCard
                icon="✓"
                label="Tamamlama"
                value={completionRate}
                unit="%"
                accent="from-emerald-500/15 to-green-500/5"
                textColor="text-emerald-400"
              />
            </motion.div>

            {/* Streak Analysis */}
            <motion.div variants={stagger.item}>
              <GlassCard className="p-5">
                <h2 className="text-white/50 text-[11px] uppercase tracking-[0.08em] font-semibold mb-4">Seri Analizi</h2>
                <StreakVisual
                  current={user.current_streak}
                  longest={user.longest_streak}
                  lastDate={user.last_session_date}
                />
              </GlassCard>
            </motion.div>

            {/* Quests */}
            {(dailyQuest || weeklyQuest) && (
              <motion.div variants={stagger.item} className="space-y-3">
                {dailyQuest && <InlineQuestCard quest={dailyQuest} type="daily" />}
                {weeklyQuest && <InlineQuestCard quest={weeklyQuest} type="weekly" />}
              </motion.div>
            )}

            {/* Badges */}
            {badgeData && (
              <motion.div variants={stagger.item}>
                <GlassCard className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-white/50 text-[11px] uppercase tracking-[0.08em] font-semibold">Rozetler</h2>
                    <span className="text-[11px] text-[#ffca75]/50 font-semibold tabular-nums">{badgeData.unlocked}/{badgeData.total}</span>
                  </div>
                  <BadgeGrid badges={badgeData.badges} user={user} />
                </GlassCard>
              </motion.div>
            )}
          </motion.div>

          {/* ── RIGHT COLUMN (60%) ── */}
          <motion.div
            initial="hidden"
            animate="visible"
            variants={stagger.container}
            className="space-y-4"
          >
            {/* Focus Score + Radar side by side */}
            {focusScore && (
              <motion.div variants={stagger.item} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Focus Score */}
                <GlassCard className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-white/50 text-[11px] uppercase tracking-[0.08em] font-semibold">Odak Skoru</h2>
                    <TrendBadge trend={focusScore.trend} prev={focusScore.previous_score} current={focusScore.score} />
                  </div>
                  <div className="flex items-center gap-4">
                    <FocusRing score={focusScore.score} />
                    <div className="flex-1 space-y-2">
                      <BreakdownBar label="Tutarlılık" value={focusScore.breakdown.consistency} max={25} color="#ffca75" />
                      <BreakdownBar label="Tamamlama" value={focusScore.breakdown.completion} max={25} color="#48bb78" />
                      <BreakdownBar label="Seri" value={focusScore.breakdown.streak} max={25} color="#4ECDC4" />
                      <BreakdownBar label="Hacim" value={focusScore.breakdown.volume} max={25} color="#a78bfa" />
                    </div>
                  </div>
                </GlassCard>

                {/* Radar Chart */}
                <GlassCard className="p-5">
                  <h2 className="text-white/50 text-[11px] uppercase tracking-[0.08em] font-semibold mb-3">Yetenek Haritası</h2>
                  <RadarChart
                    axes={[
                      { label: 'Tutarlılık', value: focusScore.breakdown.consistency, max: 25 },
                      { label: 'Tamamlama', value: focusScore.breakdown.completion, max: 25 },
                      { label: 'Seri', value: focusScore.breakdown.streak, max: 25 },
                      { label: 'Hacim', value: focusScore.breakdown.volume, max: 25 },
                      { label: 'Oran', value: completionRate / 4, max: 25 },
                    ]}
                  />
                </GlassCard>
              </motion.div>
            )}

            {/* Self Comparison */}
            {selfComp && trendItems.length > 0 && (
              <motion.div variants={stagger.item}>
                <GlassCard className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-white/50 text-[11px] uppercase tracking-[0.08em] font-semibold">Kendine Kıyasla</h2>
                    <button
                      onClick={toggleCompRange}
                      className="text-[10px] text-[#ffca75]/60 hover:text-[#ffca75] bg-[#ffca75]/[0.06] hover:bg-[#ffca75]/[0.12] px-2.5 py-1 rounded-lg transition-all duration-200"
                    >
                      {compRange === 'week' ? 'Haftalık' : 'Aylık'}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                    {trendItems.map((item) => (
                      <TrendRow key={item.label} item={item} />
                    ))}
                  </div>
                  {overallInsight && (
                    <p className="text-white/30 text-[11px] mt-4 italic leading-relaxed border-t border-white/[0.05] pt-3">
                      {overallInsight}
                    </p>
                  )}
                </GlassCard>
              </motion.div>
            )}

            {/* Activity Heatmap */}
            {heatmap.length > 0 && (
              <motion.div variants={stagger.item}>
                <GlassCard className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-white/50 text-[11px] uppercase tracking-[0.08em] font-semibold">Aktivite Haritası</h2>
                    <HeatmapLegend />
                  </div>
                  <ActivityHeatmap days={heatmap} />
                </GlassCard>
              </motion.div>
            )}

            {/* Calendar + Records side by side */}
            <motion.div variants={stagger.item} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Monthly Calendar */}
              {calendar && (
                <GlassCard className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-white/50 text-[11px] uppercase tracking-[0.08em] font-semibold">
                      {MONTH_NAMES[calendar.month - 1]} {calendar.year}
                    </h2>
                    <span className="text-[10px] text-white/30">{calendar.total_active_days} aktif gün</span>
                  </div>
                  <MonthDots days={calendar.days} year={calendar.year} month={calendar.month} />
                  <div className="flex justify-between mt-3 text-[10px] text-white/25">
                    <span>{calendar.total_sessions} seans</span>
                    <span>{Math.floor(calendar.total_minutes / 60)}s {calendar.total_minutes % 60}dk</span>
                  </div>
                </GlassCard>
              )}

              {/* Personal Records */}
              {records && (
                <GlassCard className="p-5">
                  <h2 className="text-white/50 text-[11px] uppercase tracking-[0.08em] font-semibold mb-4">Kişisel Rekorlar</h2>
                  <div className="space-y-2.5">
                    <RecordRow icon="🔥" label="En uzun seri" value={`${records.longest_streak} gün`} />
                    <RecordRow icon="🏆" label="En uzun seans" value={`${records.longest_session_minutes} dk`} />
                    {records.most_sessions_in_day && (
                      <RecordRow icon="💪" label="Günde en çok" value={`${records.most_sessions_in_day.count} seans`} />
                    )}
                    {records.earliest_session && (
                      <RecordRow icon="🌅" label="En erken" value={`${String(records.earliest_session.hour).padStart(2, '0')}:00`} />
                    )}
                    {records.latest_session && (
                      <RecordRow icon="🌙" label="En geç" value={`${String(records.latest_session.hour).padStart(2, '0')}:00`} />
                    )}
                    <RecordRow icon="📅" label="Aktif gün" value={`${records.total_active_days}`} />
                  </div>
                </GlassCard>
              )}
            </motion.div>
          </motion.div>
        </div>

        {/* ━━━ COMMUNITY PULSE (Full Width, Bottom) ━━━ */}
        {pulse && (
          <motion.section
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="mt-6"
          >
            <div className="bg-gradient-to-r from-emerald-500/[0.05] via-[#4ECDC4]/[0.04] to-blue-500/[0.05] border border-white/[0.08] rounded-2xl p-5 backdrop-blur-sm">
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-3 h-3 rounded-full bg-emerald-400" />
                    <div className="absolute inset-0 w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
                  </div>
                  <p className="text-white/60 text-sm font-medium">{pulse.active_now_message}</p>
                </div>
                <div className="flex gap-6 sm:ml-auto">
                  <div className="text-center">
                    <p className="text-lg font-bold text-emerald-400 tabular-nums">{pulse.today_sessions}</p>
                    <p className="text-[9px] text-white/30 uppercase tracking-wider">bugün</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-[#4ECDC4] tabular-nums">{Math.floor(pulse.today_minutes / 60)}s {pulse.today_minutes % 60}dk</p>
                    <p className="text-[9px] text-white/30 uppercase tracking-wider">toplam odak</p>
                  </div>
                  {pulse.peak_hour !== null && (
                    <div className="text-center">
                      <p className="text-lg font-bold text-blue-400 tabular-nums">{String(pulse.peak_hour).padStart(2, '0')}:00</p>
                      <p className="text-[9px] text-white/30 uppercase tracking-wider">zirve</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.section>
        )}

        {/* ━━━ FOOTER ━━━ */}
        <div className="text-center space-y-3 pt-6 pb-4">
          {!user.is_premium && (
            <p className="text-white/20 text-xs">Bugün: {dailyUsed}/{FREE_DAILY_LIMIT} seans</p>
          )}
          <button
            onClick={handleLogout}
            className="text-white/20 hover:text-white/40 text-xs transition-colors duration-200"
          >
            Çıkış Yap
          </button>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SHARED COMPONENTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── Glass Card (reusable wrapper) ──
function GlassCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`
      bg-white/[0.04] backdrop-blur-xl
      border border-white/[0.08]
      rounded-2xl
      shadow-[0_8px_32px_rgba(0,0,0,0.15)]
      hover:bg-white/[0.06] hover:border-white/[0.12]
      hover:shadow-[0_12px_40px_rgba(0,0,0,0.2)]
      transition-all duration-300 ease-out
      ${className}
    `}>
      {children}
    </div>
  );
}

// ── Count-Up Number ──
function CountUp({ end, duration = 1000, delay = 0 }: { end: number; duration?: number; delay?: number }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });

  useEffect(() => {
    if (!isInView) return;
    const timeout = setTimeout(() => {
      const startTime = Date.now();
      const step = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setCount(Math.round(eased * end));
        if (progress < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, delay);
    return () => clearTimeout(timeout);
  }, [end, duration, delay, isInView]);

  return <span ref={ref}>{count}</span>;
}

// ── Focus Ring (SVG) ──
function FocusRing({ score }: { score: number }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const getColor = (s: number) => {
    if (s >= 80) return ['#48bb78', '#68d391'];
    if (s >= 60) return ['#ffca75', '#fbd38d'];
    if (s >= 40) return ['#f6ad55', '#fc8181'];
    return ['#fc8181', '#feb2b2'];
  };
  const [c1, c2] = getColor(score);

  return (
    <div className="relative w-24 h-24 shrink-0">
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="7" />
        <motion.circle
          cx="50" cy="50" r={radius}
          fill="none"
          stroke="url(#focusGrad)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.5, ease: 'easeOut', delay: 0.4 }}
        />
        <defs>
          <linearGradient id="focusGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={c1} />
            <stop offset="100%" stopColor={c2} />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-[#f7fafc] tabular-nums">
          <CountUp end={score} duration={1200} delay={400} />
        </span>
        <span className="text-[8px] text-white/30 uppercase tracking-[0.1em]">puan</span>
      </div>
    </div>
  );
}

// ── Trend Badge ──
function TrendBadge({ trend, prev, current }: { trend: 'up' | 'down' | 'stable'; prev: number; current: number }) {
  const diff = current - prev;
  const config = {
    up: { icon: '↑', bg: 'bg-emerald-500/10', text: 'text-emerald-400', sign: '+' },
    down: { icon: '↓', bg: 'bg-red-500/10', text: 'text-red-400', sign: '' },
    stable: { icon: '→', bg: 'bg-white/5', text: 'text-white/40', sign: '' },
  };
  const c = config[trend];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold ${c.bg} ${c.text}`}>
      {c.icon} {diff !== 0 ? `${c.sign}${diff}` : 'Stabil'}
    </span>
  );
}

// ── Breakdown Bar ──
function BreakdownBar({ label, value, max, color }: {
  label: string; value: number; max: number; color: string;
}) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div>
      <div className="flex justify-between mb-0.5">
        <span className="text-[10px] text-white/40">{label}</span>
        <span className="text-[10px] text-white/25 tabular-nums">{Math.round(value)}/{max}</span>
      </div>
      <div className="h-1 bg-white/[0.04] rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut', delay: 0.6 }}
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
        />
      </div>
    </div>
  );
}

// ── Radar Chart (Pentagon) ──
function RadarChart({ axes }: { axes: { label: string; value: number; max: number }[] }) {
  const n = axes.length;
  const cx = 100, cy = 100, R = 70;
  const angleStep = (2 * Math.PI) / n;
  const startAngle = -Math.PI / 2;

  const getPoint = (i: number, r: number) => {
    const angle = startAngle + i * angleStep;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  };

  const rings = [0.25, 0.5, 0.75, 1];

  const dataPoints = axes.map((a, i) => {
    const ratio = Math.min(a.value / a.max, 1);
    return getPoint(i, R * ratio);
  });
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + ' Z';

  return (
    <div className="flex items-center justify-center">
      <svg viewBox="0 0 200 200" className="w-full max-w-[190px] h-auto">
        {rings.map((r) => {
          const pts = Array.from({ length: n }, (_, i) => getPoint(i, R * r));
          const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + ' Z';
          return <path key={r} d={path} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />;
        })}
        {axes.map((_, i) => {
          const p = getPoint(i, R);
          return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />;
        })}
        <motion.path
          d={dataPath}
          fill="rgba(255,202,117,0.1)"
          stroke="rgba(255,202,117,0.5)"
          strokeWidth="1.5"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.8, duration: 1 }}
          style={{ transformOrigin: '100px 100px' }}
        />
        {dataPoints.map((p, i) => (
          <motion.circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="3"
            fill="#ffca75"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 1.0 + i * 0.1, type: 'spring' }}
          />
        ))}
        {axes.map((a, i) => {
          const p = getPoint(i, R + 20);
          return (
            <text key={i} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
              fill="rgba(255,255,255,0.35)" fontSize="7.5" fontFamily="system-ui">
              {a.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

// ── Mini Stat Card ──
function MiniStatCard({ icon, label, value, unit, accent, textColor, trend }: {
  icon: string; label: string; value: number; unit: string; accent: string; textColor: string;
  trend?: 'up' | 'down' | 'same';
}) {
  const trendIcon = trend === 'up' ? '↑' : trend === 'down' ? '↓' : null;
  const trendColor = trend === 'up' ? 'text-emerald-400' : trend === 'down' ? 'text-red-400' : '';
  return (
    <GlassCard className={`bg-gradient-to-br ${accent} p-3.5`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">{icon}</span>
          <span className="text-white/35 text-[10px] uppercase tracking-[0.06em] font-medium">{label}</span>
        </div>
        {trendIcon && <span className={`text-[10px] font-bold ${trendColor}`}>{trendIcon}</span>}
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`text-xl font-bold tabular-nums ${textColor}`}>
          <CountUp end={value} duration={800} delay={200} />
        </span>
        <span className="text-white/25 text-[10px]">{unit}</span>
      </div>
    </GlassCard>
  );
}

// ── Inline Quest Card ──
function InlineQuestCard({ quest, type }: { quest: DailyQuest | WeeklyQuest; type: 'daily' | 'weekly' }) {
  const info = type === 'daily' ? DAILY_QUEST_INFO[quest.id] : WEEKLY_QUEST_INFO[quest.id];
  if (!info) return null;
  const progress = Math.min(quest.progress / quest.target, 1);
  const isDaily = type === 'daily';

  return (
    <GlassCard className="p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-white/35 uppercase tracking-[0.06em] font-medium">
          {isDaily ? '📌 Bugünün Odağı' : '📅 Bu Hafta'}
        </span>
        {quest.completed && <span className="text-[10px] text-emerald-400 font-semibold">✓ Tamamlandı</span>}
      </div>
      <h3 className="text-[#f7fafc] text-sm font-semibold mb-0.5">{info.title}</h3>
      <p className="text-white/35 text-xs mb-3">{info.description}</p>
      {isDaily ? (
        <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress * 100}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className={`h-full rounded-full ${quest.completed ? 'bg-emerald-500' : 'bg-gradient-to-r from-[#ffca75] to-[#f6ad55]'}`}
          />
        </div>
      ) : (
        <div className="flex gap-1">
          {Array.from({ length: quest.target }).map((_, i) => (
            <div key={i} className={`flex-1 h-1.5 rounded-full ${
              i < quest.progress ? (quest.completed ? 'bg-emerald-500' : 'bg-[#ffca75]') : 'bg-white/[0.06]'
            }`} />
          ))}
        </div>
      )}
      <div className="flex justify-between mt-2 text-[10px] text-white/25">
        <span className="tabular-nums">{quest.progress} / {quest.target}</span>
        <span>{isDaily ? '+5 XP' : '+15 XP, +1 Trust'}</span>
      </div>
    </GlassCard>
  );
}

// ── Trend Row ──
function TrendRow({ item }: { item: TrendItem }) {
  const arrow = getTrendArrow(item.trend);
  const trendColors: Record<string, string> = {
    up: 'text-emerald-400', down: 'text-red-400', same: 'text-white/30', new: 'text-[#ffca75]',
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[11px] text-white/45 font-medium">{item.label}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-[#f7fafc] tabular-nums font-semibold">{item.current}</span>
          <span className="text-[10px] text-white/25">{item.unit}</span>
          <span className={`text-[11px] font-bold ${trendColors[item.trend]}`}>{arrow}</span>
        </div>
      </div>
      <p className="text-[9px] text-white/20 italic">{item.insight}</p>
    </div>
  );
}

// ── Streak Visual ──
function StreakVisual({ current, longest, lastDate }: {
  current: number; longest: number; lastDate: string | null;
}) {
  const pct = longest > 0 ? Math.min((current / longest) * 100, 100) : 0;
  const isAtRisk = lastDate
    ? (() => {
        const last = new Date(lastDate);
        const now = new Date();
        const diffH = (now.getTime() - last.getTime()) / (1000 * 60 * 60);
        return diffH > 20 && current > 0;
      })()
    : false;

  const streakDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dayStr = d.toISOString().split('T')[0];
    const isActive = lastDate ? dayStr <= lastDate : false;
    const isFuture = d > new Date();
    return {
      day: DOW_SHORT[d.getDay() === 0 ? 6 : d.getDay() - 1],
      active: isActive && !isFuture && current > 0,
      isFuture,
    };
  });

  return (
    <div className="space-y-4">
      <div className="text-center">
        <div className="flex items-center justify-center gap-2">
          <span className="text-4xl font-bold text-orange-400 tabular-nums">
            <CountUp end={current} duration={800} delay={300} />
          </span>
          <span className="text-white/30 text-sm">gün</span>
        </div>
        {isAtRisk && (
          <motion.p
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ repeat: Infinity, duration: 2.5 }}
            className="text-orange-400/70 text-[10px] mt-1 font-medium"
          >
            Bugün seans yapmazsan serin sıfırlanır!
          </motion.p>
        )}
      </div>

      <div>
        <div className="flex justify-between text-[10px] text-white/25 mb-1">
          <span>Mevcut</span>
          <span>Rekor: {longest} gün</span>
        </div>
        <div className="h-2 bg-white/[0.04] rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 1, ease: 'easeOut', delay: 0.5 }}
            className="h-full rounded-full bg-gradient-to-r from-orange-500 to-[#ffca75]"
          />
        </div>
      </div>

      <div className="flex justify-between">
        {streakDays.map((d, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.5 + i * 0.06, type: 'spring' }}
              className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] ${
                d.active
                  ? 'bg-orange-500/25 text-orange-400'
                  : d.isFuture
                    ? 'bg-white/[0.02] text-white/10'
                    : 'bg-white/[0.04] text-white/15'
              }`}
            >
              {d.active ? '🔥' : '·'}
            </motion.div>
            <span className="text-[8px] text-white/20">{d.day}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Heatmap Legend ──
function HeatmapLegend() {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[9px] text-white/25">Az</span>
      {[0.1, 0.3, 0.6, 1].map((o, i) => (
        <div key={i} className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: `rgba(255,202,117,${o})` }} />
      ))}
      <span className="text-[9px] text-white/25">Çok</span>
    </div>
  );
}

// ── Activity Heatmap ──
function ActivityHeatmap({ days }: { days: HeatmapDay[] }) {
  const periods: readonly ('sabah' | 'ogle' | 'aksam' | 'gece')[] = ['sabah', 'ogle', 'aksam', 'gece'];
  const periodLabels = { sabah: '☀️', ogle: '🌤', aksam: '🌅', gece: '🌙' };

  const maxMinutes = useMemo(() => {
    let m = 0;
    for (const d of days) for (const p of ['sabah', 'ogle', 'aksam', 'gece'] as const) { if (d.slots[p].minutes > m) m = d.slots[p].minutes; }
    return m || 1;
  }, [days]);

  return (
    <div className="space-y-1">
      <div className="flex gap-1 pl-6">
        {days.map(d => (
          <div key={d.date} className="flex-1 text-center text-[9px] text-white/25">
            {DOW_SHORT[d.dow - 1]}
          </div>
        ))}
      </div>
      {periods.map(period => (
        <div key={period} className="flex gap-1 items-center">
          <div className="w-5 text-center text-xs">{periodLabels[period]}</div>
          {days.map(d => {
            const mins = d.slots[period].minutes;
            const intensity = mins > 0 ? Math.max(0.15, mins / maxMinutes) : 0;
            return (
              <motion.div
                key={d.date + period}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: Math.random() * 0.3 + 0.4, duration: 0.3 }}
                className="flex-1 aspect-square rounded-[3px]"
                style={{
                  backgroundColor: intensity > 0
                    ? `rgba(255,202,117,${intensity})`
                    : 'rgba(255,255,255,0.03)'
                }}
                title={`${d.date} ${period}: ${mins}dk`}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Badge Grid (with progress) ──
function BadgeGrid({ badges, user }: { badges: Badge[]; user: User }) {
  const unlocked = badges.filter(b => b.unlocked);
  const locked = badges.filter(b => !b.unlocked);
  const nextToUnlock = locked
    .map(b => ({ ...b, progress: getBadgeProgress(b.code, user) }))
    .sort((a, b) => b.progress - a.progress)
    .slice(0, 3);
  const remaining = locked.filter(b => !nextToUnlock.find(n => n.code === b.code));

  const rarityBorder: Record<string, string> = {
    common: 'border-white/10',
    rare: 'border-blue-500/25',
    epic: 'border-purple-500/25',
    legendary: 'border-[#ffca75]/25',
  };

  return (
    <div className="space-y-4">
      {/* Unlocked badges */}
      {unlocked.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {unlocked.map(badge => (
            <motion.div
              key={badge.code}
              whileHover={{ scale: 1.08, y: -2 }}
              className={`flex flex-col items-center gap-1 p-2 rounded-xl border ${rarityBorder[badge.rarity] || 'border-white/10'} bg-white/[0.04]`}
            >
              <span className="text-xl">{badge.icon}</span>
              <span className="text-[8px] text-white/50 text-center leading-tight font-medium">{badge.name}</span>
            </motion.div>
          ))}
        </div>
      )}

      {/* Next to unlock (with progress) */}
      {nextToUnlock.length > 0 && (
        <div>
          <p className="text-[9px] text-white/20 uppercase tracking-[0.08em] mb-2 font-medium">Sıradaki</p>
          <div className="space-y-2">
            {nextToUnlock.map(badge => (
              <div key={badge.code} className="flex items-center gap-3 bg-white/[0.02] rounded-xl p-2.5 border border-white/[0.04]">
                <span className="text-lg grayscale opacity-40">{badge.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-white/40 font-medium truncate">{badge.name}</p>
                  <p className="text-[9px] text-white/20 truncate">{badge.description}</p>
                  <div className="h-1 bg-white/[0.04] rounded-full overflow-hidden mt-1.5">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.round(badge.progress * 100)}%` }}
                      transition={{ duration: 0.6, delay: 0.8 }}
                      className="h-full rounded-full bg-[#ffca75]/40"
                    />
                  </div>
                </div>
                <span className="text-[10px] text-white/20 tabular-nums shrink-0">
                  {Math.round(badge.progress * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Remaining locked (compact) */}
      {remaining.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {remaining.map(badge => (
            <div key={badge.code} className="relative flex flex-col items-center gap-1 p-2 rounded-xl border border-white/[0.03] bg-white/[0.01]">
              <span className="text-lg grayscale opacity-15">{badge.icon}</span>
              <span className="text-[7px] text-white/15 text-center leading-tight">???</span>
              <div className="absolute top-0.5 right-0.5">
                <svg className="w-2 h-2 text-white/15" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Month Dots ──
function MonthDots({ days, year, month }: { days: CalendarDay[]; year: number; month: number }) {
  const firstDay = new Date(year, month - 1, 1).getDay();
  const startOffset = firstDay === 0 ? 6 : firstDay - 1;
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
  const currentDay = isCurrentMonth ? today.getDate() : -1;

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {DOW_SHORT.map(d => (
          <div key={d} className="text-center text-[8px] text-white/20">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: startOffset }).map((_, i) => <div key={`off-${i}`} />)}
        {days.map((d) => {
          const isToday = d.day === currentDay;
          const hasSession = d.sessions > 0;
          const isCompleted = d.completed;
          return (
            <motion.div
              key={d.day}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: d.day * 0.015 + 0.3 }}
              className="flex items-center justify-center"
            >
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] tabular-nums transition-all ${
                isToday ? 'ring-1 ring-[#ffca75]/40' : ''
              } ${
                isCompleted
                  ? 'bg-[#ffca75]/20 text-[#ffca75]'
                  : hasSession
                    ? 'bg-[#ffca75]/8 text-[#ffca75]/50'
                    : 'text-white/15'
              }`}>
                {d.day}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ── Record Row ──
function RecordRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between group">
      <div className="flex items-center gap-2">
        <span className="text-sm group-hover:scale-110 transition-transform">{icon}</span>
        <span className="text-[11px] text-white/40">{label}</span>
      </div>
      <span className="text-[11px] font-semibold text-[#f7fafc] tabular-nums">{value}</span>
    </div>
  );
}
