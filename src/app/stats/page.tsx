'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import { useAuthStore } from '@/stores/auth-store';
import { AVATARS, getTrustLevel, FREE_DAILY_LIMIT } from '@/lib/constants';
import { motion, AnimatePresence } from 'framer-motion';
import { BottomNav } from '@/components/layout/BottomNav';
import { buildTrendItems, getTrendArrow, getOverallInsight } from '@/lib/self-competition';
import type { SelfComparisonData, TrendItem } from '@/lib/self-competition';
import type { DailyQuest, WeeklyQuest } from '@/components/quests/QuestComponents';
import { DAILY_QUEST_INFO, WEEKLY_QUEST_INFO } from '@/components/quests/QuestComponents';
import type { User } from '@/types/database';

// ── RPC Return Types ──────────────────────────────────

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

// ── Main Page ──────────────────────────────────────────

export default function StatsPage() {
  const router = useRouter();
  const { user, setUser } = useAuthStore();
  const [loading, setLoading] = useState(true);

  // Data states
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

  // ── Data Fetch ──
  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { router.push('/auth'); return; }

      // User profile
      let profile = user;
      if (!profile) {
        const { data: p } = await supabase
          .from('users').select('*').eq('id', authUser.id).maybeSingle();
        if (p) { setUser(p as User); profile = p as User; }
      }

      // Extract quests from metadata
      if (profile?.metadata) {
        const meta = profile.metadata as Record<string, unknown>;
        if (meta.daily_quest) setDailyQuest(meta.daily_quest as DailyQuest);
        if (meta.weekly_quest) setWeeklyQuest(meta.weekly_quest as WeeklyQuest);
      }

      // Daily limit
      const today = new Date().toISOString().split('T')[0];
      const { data: limitData } = await supabase
        .from('user_limits').select('sessions_used')
        .eq('user_id', authUser.id).eq('date', today).maybeSingle();
      if (limitData) setDailyUsed(limitData.sessions_used);

      // Parallel RPC calls
      const uid = authUser.id;
      const now = new Date();
      const [
        focusRes, heatRes, calRes, recRes, memRes, badgeRes, pulseRes, compRes
      ] = await Promise.allSettled([
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

  // ── Toggle self-comparison range ──
  const toggleCompRange = useCallback(async () => {
    const next = compRange === 'week' ? 'month' : 'week';
    setCompRange(next);
    const supabase = createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;
    const { data } = await supabase.rpc('get_self_comparison', { p_user_id: authUser.id, p_range: next });
    if (data) setSelfComp(data as SelfComparisonData);
  }, [compRange]);

  // ── Logout ──
  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    router.push('/auth');
  };

  // ── Derived ──
  const trustLevel = user ? getTrustLevel(user.trust_score) : null;
  const avatar = user ? AVATARS.find(a => a.id === user.avatar_id)?.emoji ?? '🐱' : '🐱';
  const xpInLevel = user ? user.xp % 100 : 0;
  const trendItems = useMemo(() => selfComp ? buildTrendItems(selfComp) : [], [selfComp]);
  const overallInsight = useMemo(() => trendItems.length > 0 ? getOverallInsight(trendItems) : '', [trendItems]);

  // ── Loading ──
  if (!user || loading) {
    return (
      <div className="min-h-screen bg-[#060912] flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
          className="w-10 h-10 border-2 border-amber-500/20 border-t-amber-500 rounded-full"
        />
      </div>
    );
  }

  const completionRate = user.total_sessions > 0
    ? Math.round((user.completed_sessions / user.total_sessions) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-[#060912] pb-28">
      {/* Ambient */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-amber-500/[0.02] rounded-full blur-[120px] pointer-events-none" />
      <div className="fixed bottom-40 right-0 w-80 h-80 bg-purple-500/[0.015] rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 max-w-2xl mx-auto px-4 pt-8">

        {/* ━━━ HERO ━━━ */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/20 flex items-center justify-center text-3xl shrink-0">
              {avatar}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-white text-lg font-semibold truncate">{user.name}</h1>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase"
                  style={{ backgroundColor: trustLevel?.color + '20', color: trustLevel?.color }}>
                  {trustLevel?.labelTR}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
                <span>Seviye {user.level}</span>
                <span className="w-1 h-1 rounded-full bg-gray-700" />
                <span>{user.completed_sessions} seans</span>
                <span className="w-1 h-1 rounded-full bg-gray-700" />
                <span>{Math.floor(user.total_minutes / 60)}s {user.total_minutes % 60}dk</span>
              </div>
              {/* XP Bar */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${xpInLevel}%` }}
                    transition={{ duration: 1, ease: 'easeOut', delay: 0.3 }}
                    className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-400"
                  />
                </div>
                <span className="text-[10px] text-gray-600 tabular-nums">{xpInLevel}/100 XP</span>
              </div>
            </div>
          </div>
        </motion.section>

        {/* ━━━ SILENT MEMORY ━━━ */}
        <AnimatePresence>
          {memory.length > 0 && (
            <motion.section
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-6"
            >
              <div className="bg-gradient-to-r from-amber-500/[0.06] to-orange-500/[0.04] border border-amber-500/10 rounded-xl px-4 py-3">
                <p className="text-amber-200/80 text-sm leading-relaxed">{memory[0].text}</p>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* ━━━ ROW: FOCUS SCORE + RADAR ━━━ */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4"
        >
          {/* Focus Score */}
          {focusScore && (
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white/60 text-xs uppercase tracking-wider font-medium">Odak Skoru</h2>
                <TrendBadge trend={focusScore.trend} prev={focusScore.previous_score} current={focusScore.score} />
              </div>
              <div className="flex items-center gap-5">
                <FocusRing score={focusScore.score} />
                <div className="flex-1 space-y-2">
                  <BreakdownBar label="Tutarlılık" value={focusScore.breakdown.consistency} max={25} color="amber" />
                  <BreakdownBar label="Tamamlama" value={focusScore.breakdown.completion} max={25} color="emerald" />
                  <BreakdownBar label="Seri" value={focusScore.breakdown.streak} max={25} color="blue" />
                  <BreakdownBar label="Hacim" value={focusScore.breakdown.volume} max={25} color="purple" />
                </div>
              </div>
            </div>
          )}

          {/* Radar Chart */}
          {focusScore && (
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
              <h2 className="text-white/60 text-xs uppercase tracking-wider font-medium mb-4">Yetenek Haritası</h2>
              <RadarChart
                axes={[
                  { label: 'Tutarlılık', value: focusScore.breakdown.consistency, max: 25 },
                  { label: 'Tamamlama', value: focusScore.breakdown.completion, max: 25 },
                  { label: 'Seri', value: focusScore.breakdown.streak, max: 25 },
                  { label: 'Hacim', value: focusScore.breakdown.volume, max: 25 },
                  { label: 'Oran', value: completionRate / 4, max: 25 },
                ]}
              />
            </div>
          )}
        </motion.div>

        {/* ━━━ STAT CARDS (4 in row / 2x2) ━━━ */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4"
        >
          <MiniStatCard
            icon="🔥"
            label="Aktif Seri"
            value={user.current_streak}
            unit="gün"
            accent="from-orange-500/20 to-red-500/10"
            textColor="text-orange-400"
          />
          <MiniStatCard
            icon="⏱"
            label="Toplam"
            value={Math.floor(user.total_minutes / 60)}
            unit={`s ${user.total_minutes % 60}dk`}
            accent="from-amber-500/20 to-yellow-500/10"
            textColor="text-amber-400"
          />
          <MiniStatCard
            icon="🛡"
            label="Güven"
            value={user.trust_score}
            unit="/ 200"
            accent="from-blue-500/20 to-cyan-500/10"
            textColor="text-blue-400"
          />
          <MiniStatCard
            icon="✓"
            label="Tamamlama"
            value={completionRate}
            unit="%"
            accent="from-emerald-500/20 to-green-500/10"
            textColor="text-emerald-400"
          />
        </motion.div>

        {/* ━━━ ROW: QUESTS ━━━ */}
        {(dailyQuest || weeklyQuest) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4"
          >
            {dailyQuest && <InlineQuestCard quest={dailyQuest} type="daily" />}
            {weeklyQuest && <InlineQuestCard quest={weeklyQuest} type="weekly" />}
          </motion.div>
        )}

        {/* ━━━ ROW: SELF-COMPARISON + STREAK VISUAL ━━━ */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4"
        >
          {/* Self Comparison */}
          {selfComp && trendItems.length > 0 && (
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white/60 text-xs uppercase tracking-wider font-medium">Kendine Kıyasla</h2>
                <button
                  onClick={toggleCompRange}
                  className="text-[10px] text-amber-500/70 hover:text-amber-400 bg-amber-500/[0.08] px-2 py-0.5 rounded-md transition-colors"
                >
                  {compRange === 'week' ? 'Haftalık' : 'Aylık'}
                </button>
              </div>

              <div className="space-y-3">
                {trendItems.map((item) => (
                  <TrendRow key={item.label} item={item} />
                ))}
              </div>

              {overallInsight && (
                <p className="text-gray-500 text-[11px] mt-4 italic leading-relaxed border-t border-white/[0.04] pt-3">
                  {overallInsight}
                </p>
              )}
            </div>
          )}

          {/* Streak Visual */}
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
            <h2 className="text-white/60 text-xs uppercase tracking-wider font-medium mb-4">Seri Analizi</h2>
            <StreakVisual
              current={user.current_streak}
              longest={user.longest_streak}
              lastDate={user.last_session_date}
            />
          </div>
        </motion.div>

        {/* ━━━ ACTIVITY HEATMAP (full width) ━━━ */}
        {heatmap.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mb-4"
          >
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white/60 text-xs uppercase tracking-wider font-medium">Aktivite Haritası</h2>
                <HeatmapLegend />
              </div>
              <ActivityHeatmap days={heatmap} />
            </div>
          </motion.section>
        )}

        {/* ━━━ ROW: BADGES + CALENDAR ━━━ */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4"
        >
          {/* Badges */}
          {badgeData && (
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white/60 text-xs uppercase tracking-wider font-medium">Rozetler</h2>
                <span className="text-xs text-amber-500/60 tabular-nums">{badgeData.unlocked}/{badgeData.total}</span>
              </div>
              <BadgeGrid badges={badgeData.badges} />
            </div>
          )}

          {/* Calendar */}
          {calendar && (
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white/60 text-xs uppercase tracking-wider font-medium">
                  {MONTH_NAMES[calendar.month - 1]} {calendar.year}
                </h2>
                <span className="text-xs text-gray-600">{calendar.total_active_days} aktif gün</span>
              </div>
              <MonthDots days={calendar.days} year={calendar.year} month={calendar.month} />
              <div className="flex justify-between mt-3 text-[10px] text-gray-600">
                <span>{calendar.total_sessions} seans</span>
                <span>{Math.floor(calendar.total_minutes / 60)}s {calendar.total_minutes % 60}dk</span>
              </div>
            </div>
          )}
        </motion.div>

        {/* ━━━ ROW: RECORDS + COMMUNITY ━━━ */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6"
        >
          {/* Personal Records */}
          {records && (
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
              <h2 className="text-white/60 text-xs uppercase tracking-wider font-medium mb-4">Kişisel Rekorlar</h2>
              <div className="space-y-2.5">
                <RecordRow icon="🔥" label="En uzun seri" value={`${records.longest_streak} gün`} />
                <RecordRow icon="🏆" label="En uzun seans" value={`${records.longest_session_minutes} dk`} />
                {records.most_sessions_in_day && (
                  <RecordRow icon="💪" label="Bir günde en çok" value={`${records.most_sessions_in_day.count} seans`} />
                )}
                {records.earliest_session && (
                  <RecordRow icon="🌅" label="En erken" value={`${String(records.earliest_session.hour).padStart(2, '0')}:00`} />
                )}
                {records.latest_session && (
                  <RecordRow icon="🌙" label="En geç" value={`${String(records.latest_session.hour).padStart(2, '0')}:00`} />
                )}
                <RecordRow icon="📅" label="Aktif gün" value={`${records.total_active_days}`} />
              </div>
            </div>
          )}

          {/* Community Pulse */}
          {pulse && (
            <div className="bg-gradient-to-br from-emerald-500/[0.05] to-blue-500/[0.05] border border-white/[0.06] rounded-2xl p-5">
              <h2 className="text-white/60 text-xs uppercase tracking-wider font-medium mb-4">Topluluk Nabzı</h2>
              <div className="flex items-center gap-3 mb-4">
                <div className="relative">
                  <div className="w-3 h-3 rounded-full bg-emerald-400" />
                  <div className="absolute inset-0 w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
                </div>
                <p className="text-white/70 text-sm">{pulse.active_now_message}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/[0.04] rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-emerald-400 tabular-nums">{pulse.today_sessions}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">bugün seans</p>
                </div>
                <div className="bg-white/[0.04] rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-blue-400 tabular-nums">{Math.floor(pulse.today_minutes / 60)}s {pulse.today_minutes % 60}dk</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">toplam odak</p>
                </div>
              </div>
              {pulse.peak_hour !== null && (
                <p className="text-gray-600 text-[10px] mt-3 text-center">
                  Zirve saati: {String(pulse.peak_hour).padStart(2, '0')}:00
                </p>
              )}
            </div>
          )}
        </motion.div>

        {/* ━━━ FOOTER ━━━ */}
        <div className="text-center space-y-3 pt-2 pb-4">
          {!user.is_premium && (
            <p className="text-gray-700 text-xs">Bugün: {dailyUsed}/{FREE_DAILY_LIMIT} seans</p>
          )}
          <button
            onClick={handleLogout}
            className="text-gray-700 hover:text-gray-500 text-xs transition-colors"
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
// SUB-COMPONENTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const MONTH_NAMES = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
];

const DOW_SHORT = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pa'];

// ── Focus Ring (SVG) ──
function FocusRing({ score }: { score: number }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const getColor = (s: number) => {
    if (s >= 80) return ['#22c55e', '#4ade80'];
    if (s >= 60) return ['#f59e0b', '#fbbf24'];
    if (s >= 40) return ['#f97316', '#fb923c'];
    return ['#ef4444', '#f87171'];
  };
  const [c1, c2] = getColor(score);

  return (
    <div className="relative w-24 h-24 shrink-0">
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="7" />
        <motion.circle
          cx="50" cy="50" r={radius}
          fill="none"
          stroke="url(#scoreGrad)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.5, ease: 'easeOut', delay: 0.3 }}
        />
        <defs>
          <linearGradient id="scoreGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={c1} />
            <stop offset="100%" stopColor={c2} />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.8, type: 'spring' }}
          className="text-2xl font-bold text-white tabular-nums"
        >{score}</motion.span>
        <span className="text-[8px] text-gray-500 uppercase tracking-widest">puan</span>
      </div>
    </div>
  );
}

// ── Trend Badge ──
function TrendBadge({ trend, prev, current }: { trend: 'up' | 'down' | 'stable'; prev: number; current: number }) {
  const diff = current - prev;
  const config = {
    up: { icon: '↑', color: 'text-emerald-400 bg-emerald-500/10', sign: '+' },
    down: { icon: '↓', color: 'text-red-400 bg-red-500/10', sign: '' },
    stable: { icon: '→', color: 'text-gray-400 bg-white/5', sign: '' },
  };
  const c = config[trend];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium ${c.color}`}>
      {c.icon} {diff !== 0 ? `${c.sign}${diff}` : 'Stabil'}
    </span>
  );
}

// ── Breakdown Bar ──
function BreakdownBar({ label, value, max, color }: {
  label: string; value: number; max: number; color: string;
}) {
  const pct = Math.min((value / max) * 100, 100);
  const colors: Record<string, string> = {
    amber: 'from-amber-500/60 to-amber-400/80',
    emerald: 'from-emerald-500/60 to-emerald-400/80',
    blue: 'from-blue-500/60 to-blue-400/80',
    purple: 'from-purple-500/60 to-purple-400/80',
  };
  return (
    <div>
      <div className="flex justify-between mb-0.5">
        <span className="text-[10px] text-gray-500">{label}</span>
        <span className="text-[10px] text-gray-600 tabular-nums">{Math.round(value)}/{max}</span>
      </div>
      <div className="h-1 bg-white/[0.04] rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut', delay: 0.5 }}
          className={`h-full rounded-full bg-gradient-to-r ${colors[color] || colors.amber}`}
        />
      </div>
    </div>
  );
}

// ── Radar Chart (Pentagon) ──
function RadarChart({ axes }: { axes: { label: string; value: number; max: number }[] }) {
  const n = axes.length;
  const cx = 100, cy = 100, R = 75;
  const angleStep = (2 * Math.PI) / n;
  const startAngle = -Math.PI / 2;

  const getPoint = (i: number, r: number) => {
    const angle = startAngle + i * angleStep;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  };

  // Grid rings
  const rings = [0.25, 0.5, 0.75, 1];

  // Data polygon
  const dataPoints = axes.map((a, i) => {
    const ratio = Math.min(a.value / a.max, 1);
    return getPoint(i, R * ratio);
  });
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + ' Z';

  return (
    <div className="flex items-center justify-center">
      <svg viewBox="0 0 200 200" className="w-full max-w-[200px] h-auto">
        {/* Grid rings */}
        {rings.map((r) => {
          const pts = Array.from({ length: n }, (_, i) => getPoint(i, R * r));
          const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + ' Z';
          return <path key={r} d={path} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />;
        })}

        {/* Axis lines */}
        {axes.map((_, i) => {
          const p = getPoint(i, R);
          return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />;
        })}

        {/* Data fill */}
        <motion.path
          d={dataPath}
          fill="rgba(245,158,11,0.12)"
          stroke="rgba(245,158,11,0.6)"
          strokeWidth="1.5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.8 }}
        />

        {/* Data dots */}
        {dataPoints.map((p, i) => (
          <motion.circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="3"
            fill="#f59e0b"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.8 + i * 0.1 }}
          />
        ))}

        {/* Labels */}
        {axes.map((a, i) => {
          const labelR = R + 18;
          const p = getPoint(i, labelR);
          return (
            <text
              key={i}
              x={p.x}
              y={p.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="rgba(255,255,255,0.4)"
              fontSize="8"
              fontFamily="system-ui"
            >
              {a.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

// ── Mini Stat Card ──
function MiniStatCard({ icon, label, value, unit, accent, textColor }: {
  icon: string; label: string; value: number; unit: string; accent: string; textColor: string;
}) {
  return (
    <div className={`bg-gradient-to-br ${accent} border border-white/[0.06] rounded-xl p-3`}>
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-sm">{icon}</span>
        <span className="text-gray-500 text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`text-xl font-bold tabular-nums ${textColor}`}>{value}</span>
        <span className="text-gray-600 text-[10px]">{unit}</span>
      </div>
    </div>
  );
}

// ── Inline Quest Card ──
function InlineQuestCard({ quest, type }: { quest: DailyQuest | WeeklyQuest; type: 'daily' | 'weekly' }) {
  const info = type === 'daily'
    ? DAILY_QUEST_INFO[quest.id]
    : WEEKLY_QUEST_INFO[quest.id];
  if (!info) return null;

  const progress = Math.min(quest.progress / quest.target, 1);
  const isDaily = type === 'daily';

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider">
          {isDaily ? '📌 Bugünün Odağı' : '📅 Bu Hafta'}
        </span>
        {quest.completed && (
          <span className="text-[10px] text-emerald-400 font-medium">✓ Tamamlandı</span>
        )}
      </div>
      <h3 className="text-white text-sm font-medium mb-0.5">{info.title}</h3>
      <p className="text-gray-500 text-xs mb-3">{info.description}</p>

      {isDaily ? (
        <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress * 100}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className={`h-full rounded-full ${quest.completed ? 'bg-emerald-500' : 'bg-gradient-to-r from-amber-500 to-amber-400'}`}
          />
        </div>
      ) : (
        <div className="flex gap-1">
          {Array.from({ length: quest.target }).map((_, i) => (
            <div
              key={i}
              className={`flex-1 h-1.5 rounded-full transition-all ${
                i < quest.progress
                  ? quest.completed ? 'bg-emerald-500' : 'bg-amber-500'
                  : 'bg-white/[0.06]'
              }`}
            />
          ))}
        </div>
      )}

      <div className="flex justify-between mt-2 text-[10px] text-gray-600">
        <span className="tabular-nums">{quest.progress} / {quest.target}</span>
        <span>{isDaily ? '+5 XP' : '+15 XP, +1 Trust'}</span>
      </div>
    </div>
  );
}

// ── Trend Row ──
function TrendRow({ item }: { item: TrendItem }) {
  const arrow = getTrendArrow(item.trend);
  const trendColors: Record<string, string> = {
    up: 'text-emerald-400',
    down: 'text-red-400',
    same: 'text-gray-500',
    new: 'text-amber-400',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-400">{item.label}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-white tabular-nums">{item.current} <span className="text-gray-600">{item.unit}</span></span>
          <span className={`text-xs font-medium ${trendColors[item.trend]}`}>{arrow}</span>
        </div>
      </div>
      <p className="text-[10px] text-gray-600 italic">{item.insight}</p>
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

  // Last 7 days streak visualization
  const streakDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dayStr = d.toISOString().split('T')[0];
    const isLast = lastDate ? dayStr <= lastDate : false;
    const isFuture = d > new Date();
    return { day: ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pa'][d.getDay() === 0 ? 6 : d.getDay() - 1], active: isLast && !isFuture && current > 0, isFuture };
  });

  return (
    <div className="space-y-4">
      {/* Big number */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-2">
          <motion.span
            className="text-4xl font-bold text-orange-400 tabular-nums"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', delay: 0.3 }}
          >
            {current}
          </motion.span>
          <span className="text-gray-500 text-sm">gün</span>
        </div>
        {isAtRisk && (
          <motion.p
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="text-orange-400/80 text-[10px] mt-1"
          >
            Bugün seans yapmazsan serin sıfırlanır!
          </motion.p>
        )}
      </div>

      {/* Progress to record */}
      <div>
        <div className="flex justify-between text-[10px] text-gray-600 mb-1">
          <span>Mevcut</span>
          <span>Rekor: {longest} gün</span>
        </div>
        <div className="h-2 bg-white/[0.04] rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 1, ease: 'easeOut', delay: 0.4 }}
            className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400"
          />
        </div>
      </div>

      {/* 7-day streak dots */}
      <div className="flex justify-between">
        {streakDays.map((d, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.5 + i * 0.05 }}
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                d.active
                  ? 'bg-orange-500/30 text-orange-400'
                  : d.isFuture
                    ? 'bg-white/[0.02] text-gray-800'
                    : 'bg-white/[0.04] text-gray-700'
              }`}
            >
              {d.active ? '🔥' : '·'}
            </motion.div>
            <span className="text-[8px] text-gray-700">{d.day}</span>
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
      <span className="text-[9px] text-gray-600">Az</span>
      {[0.1, 0.3, 0.6, 1].map((o, i) => (
        <div key={i} className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: `rgba(245,158,11,${o})` }} />
      ))}
      <span className="text-[9px] text-gray-600">Çok</span>
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
          <div key={d.date} className="flex-1 text-center text-[9px] text-gray-600">
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
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: Math.random() * 0.3 + 0.3 }}
                className="flex-1 aspect-square rounded-[3px]"
                style={{
                  backgroundColor: intensity > 0
                    ? `rgba(245,158,11,${intensity})`
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

// ── Badge Grid ──
function BadgeGrid({ badges }: { badges: Badge[] }) {
  const rarityGlow: Record<string, string> = {
    common: 'border-gray-700',
    rare: 'border-blue-500/30 shadow-blue-500/5',
    epic: 'border-purple-500/30 shadow-purple-500/5',
    legendary: 'border-amber-500/30 shadow-amber-500/10',
  };

  return (
    <div className="grid grid-cols-4 gap-2">
      {badges.map((badge) => (
        <motion.div
          key={badge.code}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: Math.random() * 0.2 + 0.4 }}
          className={`relative flex flex-col items-center gap-1 p-2 rounded-xl border shadow-sm ${
            badge.unlocked
              ? rarityGlow[badge.rarity] || 'border-gray-700'
              : 'border-white/[0.04]'
          } ${badge.unlocked ? 'bg-white/[0.03]' : 'bg-white/[0.01]'}`}
        >
          <span className={`text-xl ${badge.unlocked ? '' : 'grayscale opacity-25'}`}>
            {badge.icon}
          </span>
          <span className={`text-[8px] text-center leading-tight ${
            badge.unlocked ? 'text-gray-400' : 'text-gray-700'
          }`}>
            {badge.unlocked ? badge.name : '???'}
          </span>
          {!badge.unlocked && (
            <div className="absolute top-0.5 right-0.5">
              <svg className="w-2 h-2 text-gray-700" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
            </div>
          )}
        </motion.div>
      ))}
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
          <div key={d} className="text-center text-[8px] text-gray-700">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: startOffset }).map((_, i) => <div key={`off-${i}`} />)}
        {days.map((d) => {
          const isToday = d.day === currentDay;
          const hasSession = d.sessions > 0;
          const isCompleted = d.completed;
          return (
            <div key={d.day} className="flex items-center justify-center">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] tabular-nums ${
                isToday ? 'ring-1 ring-amber-500/40' : ''
              } ${
                isCompleted
                  ? 'bg-amber-500/25 text-amber-300'
                  : hasSession
                    ? 'bg-amber-500/10 text-amber-500/50'
                    : 'text-gray-700'
              }`}>
                {d.day}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Record Row ──
function RecordRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-sm">{icon}</span>
        <span className="text-xs text-gray-400">{label}</span>
      </div>
      <span className="text-xs font-medium text-white tabular-nums">{value}</span>
    </div>
  );
}
