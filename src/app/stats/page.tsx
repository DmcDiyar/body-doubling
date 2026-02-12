'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import { useAuthStore } from '@/stores/auth-store';
import { AVATARS, getTrustLevel, FREE_DAILY_LIMIT } from '@/lib/constants';
import { motion, AnimatePresence } from 'framer-motion';
import { BottomNav } from '@/components/layout/BottomNav';
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

  // ── Data Fetch ──
  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { router.push('/auth'); return; }

      // User profile
      if (!user) {
        const { data: profile } = await supabase
          .from('users').select('*').eq('id', authUser.id).maybeSingle();
        if (profile) setUser(profile as User);
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
        focusRes, heatRes, calRes, recRes, memRes, badgeRes, pulseRes
      ] = await Promise.allSettled([
        supabase.rpc('get_focus_score', { p_user_id: uid }),
        supabase.rpc('get_focus_heatmap', { p_user_id: uid, p_days: 7 }),
        supabase.rpc('get_monthly_calendar', { p_user_id: uid, p_year: now.getFullYear(), p_month: now.getMonth() + 1 }),
        supabase.rpc('get_personal_records', { p_user_id: uid }),
        supabase.rpc('get_silent_memory', { p_user_id: uid }),
        supabase.rpc('get_user_badges', { p_user_id: uid }),
        supabase.rpc('get_community_pulse'),
      ]);

      if (focusRes.status === 'fulfilled' && focusRes.value.data) setFocusScore(focusRes.value.data as FocusScore);
      if (heatRes.status === 'fulfilled' && heatRes.value.data) setHeatmap((heatRes.value.data as { days: HeatmapDay[] }).days ?? []);
      if (calRes.status === 'fulfilled' && calRes.value.data) setCalendar(calRes.value.data as MonthlyCalendar);
      if (recRes.status === 'fulfilled' && recRes.value.data) setRecords(recRes.value.data as PersonalRecords);
      if (memRes.status === 'fulfilled' && memRes.value.data) setMemory((memRes.value.data as { messages: SilentMemoryMessage[] }).messages ?? []);
      if (badgeRes.status === 'fulfilled' && badgeRes.value.data) setBadgeData(badgeRes.value.data as BadgeData);
      if (pulseRes.status === 'fulfilled' && pulseRes.value.data) setPulse(pulseRes.value.data as CommunityPulse);

      setLoading(false);
    }
    load();
  }, [router, setUser, user]);

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

  return (
    <div className="min-h-screen bg-[#060912] pb-28">
      {/* Ambient glow */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-amber-500/[0.03] rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 max-w-md mx-auto px-4 pt-8">

        {/* ━━━ HERO ━━━ */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-start gap-4">
            {/* Avatar */}
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
                <span>{user.total_sessions} seans</span>
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
                <span className="text-[10px] text-gray-600 tabular-nums">{xpInLevel}/100</span>
              </div>
            </div>
          </div>
        </motion.section>

        {/* ━━━ SILENT MEMORY (FOMO messages) ━━━ */}
        <AnimatePresence>
          {memory.length > 0 && (
            <motion.section
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-6"
            >
              <motion.div
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="bg-amber-500/[0.06] border border-amber-500/10 rounded-xl px-4 py-3"
              >
                <p className="text-amber-200/80 text-sm leading-relaxed">
                  {memory[0].text}
                </p>
              </motion.div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* ━━━ FOCUS SCORE ━━━ */}
        {focusScore && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-6"
          >
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white/60 text-xs uppercase tracking-wider font-medium">Odak Skoru</h2>
                <TrendBadge trend={focusScore.trend} />
              </div>

              <div className="flex items-center gap-6">
                {/* Ring */}
                <FocusRing score={focusScore.score} />

                {/* Breakdown */}
                <div className="flex-1 space-y-2.5">
                  <BreakdownBar label="Tutarlılık" value={focusScore.breakdown.consistency} max={25} />
                  <BreakdownBar label="Tamamlama" value={focusScore.breakdown.completion} max={25} />
                  <BreakdownBar label="Seri" value={focusScore.breakdown.streak} max={25} />
                  <BreakdownBar label="Hacim" value={focusScore.breakdown.volume} max={25} />
                </div>
              </div>
            </div>
          </motion.section>
        )}

        {/* ━━━ STATS ROW ━━━ */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-3 gap-3 mb-6"
        >
          <StatCard
            label="Toplam Saat"
            value={`${Math.floor(user.total_minutes / 60)}`}
            sub={`${user.total_minutes % 60}dk`}
            color="amber"
          />
          <StatCard
            label="Aktif Seri"
            value={`${user.current_streak}`}
            sub="gün"
            color="emerald"
          />
          <StatCard
            label="Güven"
            value={`${user.trust_score}`}
            sub={`/ 200`}
            color="blue"
          />
        </motion.section>

        {/* ━━━ ACTIVITY HEATMAP ━━━ */}
        {heatmap.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mb-6"
          >
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white/60 text-xs uppercase tracking-wider font-medium">Aktivite Haritasi</h2>
                <HeatmapLegend />
              </div>
              <ActivityHeatmap days={heatmap} />
            </div>
          </motion.section>
        )}

        {/* ━━━ BADGES ━━━ */}
        {badgeData && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mb-6"
          >
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white/60 text-xs uppercase tracking-wider font-medium">Rozetler</h2>
                <span className="text-xs text-amber-500/60">{badgeData.unlocked}/{badgeData.total}</span>
              </div>
              <BadgeGrid badges={badgeData.badges} />
            </div>
          </motion.section>
        )}

        {/* ━━━ MONTHLY CALENDAR ━━━ */}
        {calendar && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="mb-6"
          >
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white/60 text-xs uppercase tracking-wider font-medium">
                  {MONTH_NAMES[calendar.month - 1]} {calendar.year}
                </h2>
                <span className="text-xs text-gray-600">
                  {calendar.total_active_days} aktif gün
                </span>
              </div>
              <MonthDots days={calendar.days} />
              <div className="flex justify-between mt-3 text-[10px] text-gray-600">
                <span>{calendar.total_sessions} seans</span>
                <span>{Math.floor(calendar.total_minutes / 60)}s {calendar.total_minutes % 60}dk</span>
              </div>
            </div>
          </motion.section>
        )}

        {/* ━━━ PERSONAL RECORDS ━━━ */}
        {records && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="mb-6"
          >
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
              <h2 className="text-white/60 text-xs uppercase tracking-wider font-medium mb-4">Kisisel Rekorlar</h2>
              <div className="space-y-3">
                <RecordRow icon="🔥" label="En uzun seri" value={`${records.longest_streak} gün`} />
                <RecordRow icon="🏆" label="En uzun seans" value={`${records.longest_session_minutes} dk`} />
                {records.most_sessions_in_day && (
                  <RecordRow icon="💪" label="Bir günde en çok" value={`${records.most_sessions_in_day.count} seans`} />
                )}
                {records.earliest_session && (
                  <RecordRow icon="🌅" label="En erken seans" value={`${String(records.earliest_session.hour).padStart(2, '0')}:00`} />
                )}
                {records.latest_session && (
                  <RecordRow icon="🌙" label="En geç seans" value={`${String(records.latest_session.hour).padStart(2, '0')}:00`} />
                )}
                <RecordRow icon="📅" label="Toplam aktif gün" value={`${records.total_active_days}`} />
              </div>
            </div>
          </motion.section>
        )}

        {/* ━━━ COMMUNITY PULSE ━━━ */}
        {pulse && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="mb-6"
          >
            <div className="bg-gradient-to-r from-emerald-500/[0.06] to-blue-500/[0.06] border border-white/[0.06] rounded-2xl p-4">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                  <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                </div>
                <p className="text-white/70 text-sm flex-1">{pulse.active_now_message}</p>
              </div>
              {pulse.today_sessions > 0 && (
                <div className="flex gap-4 mt-3 pl-5">
                  <span className="text-[10px] text-gray-500">Bugün: {pulse.today_sessions} seans</span>
                  <span className="text-[10px] text-gray-500">{Math.floor(pulse.today_minutes / 60)}s {pulse.today_minutes % 60}dk</span>
                </div>
              )}
            </div>
          </motion.section>
        )}

        {/* ━━━ FOOTER ━━━ */}
        <div className="text-center space-y-3 pt-2 pb-4">
          {!user.is_premium && (
            <p className="text-gray-700 text-xs">Bugün: {dailyUsed}/{FREE_DAILY_LIMIT} seans</p>
          )}
          <button
            onClick={handleLogout}
            className="text-gray-700 hover:text-gray-500 text-xs transition-colors"
          >
            Cikis Yap
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
  'Ocak', 'Subat', 'Mart', 'Nisan', 'Mayis', 'Haziran',
  'Temmuz', 'Agustos', 'Eylul', 'Ekim', 'Kasim', 'Aralik'
];

const DOW_SHORT = ['Pt', 'Sa', 'Ca', 'Pe', 'Cu', 'Ct', 'Pa'];

// ── Focus Ring (SVG) ──
function FocusRing({ score }: { score: number }) {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative w-28 h-28 shrink-0">
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        {/* Track */}
        <circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="6" />
        {/* Progress */}
        <motion.circle
          cx="50" cy="50" r={radius}
          fill="none"
          stroke="url(#scoreGradient)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.5, ease: 'easeOut', delay: 0.3 }}
        />
        <defs>
          <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#fbbf24" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-white tabular-nums">{score}</span>
        <span className="text-[9px] text-gray-500 uppercase tracking-wider">puan</span>
      </div>
    </div>
  );
}

// ── Trend Badge ──
function TrendBadge({ trend }: { trend: 'up' | 'down' | 'stable' }) {
  const config = {
    up: { icon: '↑', color: 'text-emerald-400 bg-emerald-500/10' },
    down: { icon: '↓', color: 'text-red-400 bg-red-500/10' },
    stable: { icon: '→', color: 'text-gray-400 bg-white/5' },
  };
  const c = config[trend];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs ${c.color}`}>
      {c.icon} {trend === 'up' ? 'Yükseliyor' : trend === 'down' ? 'Düşüyor' : 'Stabil'}
    </span>
  );
}

// ── Breakdown Bar ──
function BreakdownBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div>
      <div className="flex justify-between mb-0.5">
        <span className="text-[10px] text-gray-500">{label}</span>
        <span className="text-[10px] text-gray-600 tabular-nums">{Math.round(value)}</span>
      </div>
      <div className="h-1 bg-white/[0.04] rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut', delay: 0.5 }}
          className="h-full rounded-full bg-gradient-to-r from-amber-500/60 to-amber-400/80"
        />
      </div>
    </div>
  );
}

// ── Stat Card ──
function StatCard({ label, value, sub, color }: {
  label: string; value: string; sub: string;
  color: 'amber' | 'emerald' | 'blue';
}) {
  const accent = {
    amber: 'text-amber-400',
    emerald: 'text-emerald-400',
    blue: 'text-blue-400',
  };
  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 text-center">
      <p className="text-gray-600 text-[10px] uppercase tracking-wider mb-1.5">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${accent[color]}`}>{value}</p>
      <p className="text-gray-600 text-[10px] mt-0.5">{sub}</p>
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
      <span className="text-[9px] text-gray-600">Cok</span>
    </div>
  );
}

// ── Activity Heatmap ──
function ActivityHeatmap({ days }: { days: HeatmapDay[] }) {
  const periods = ['sabah', 'ogle', 'aksam', 'gece'] as const;
  const periodLabels = { sabah: '☀️', ogle: '🌤', aksam: '🌅', gece: '🌙' };

  const maxMinutes = useMemo(() => {
    let m = 0;
    days.forEach(d => periods.forEach(p => { if (d.slots[p].minutes > m) m = d.slots[p].minutes; }));
    return m || 1;
  }, [days]);

  return (
    <div className="space-y-1">
      {/* Header */}
      <div className="flex gap-1 pl-6">
        {days.map(d => (
          <div key={d.date} className="flex-1 text-center text-[9px] text-gray-600">
            {DOW_SHORT[d.dow - 1]}
          </div>
        ))}
      </div>

      {/* Grid */}
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
                className="flex-1 aspect-square rounded-sm"
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
  const rarityBorder: Record<string, string> = {
    common: 'border-gray-700',
    rare: 'border-blue-500/30',
    epic: 'border-purple-500/30',
    legendary: 'border-amber-500/30',
  };

  return (
    <div className="grid grid-cols-4 gap-2.5">
      {badges.map((badge) => (
        <motion.div
          key={badge.code}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: Math.random() * 0.2 + 0.4 }}
          className={`relative flex flex-col items-center gap-1 p-2.5 rounded-xl border ${
            badge.unlocked
              ? rarityBorder[badge.rarity] || 'border-gray-700'
              : 'border-white/[0.04]'
          } ${badge.unlocked ? 'bg-white/[0.03]' : 'bg-white/[0.01]'}`}
        >
          <span className={`text-2xl ${badge.unlocked ? '' : 'grayscale opacity-30'}`}>
            {badge.icon}
          </span>
          <span className={`text-[9px] text-center leading-tight ${
            badge.unlocked ? 'text-gray-400' : 'text-gray-700'
          }`}>
            {badge.unlocked ? badge.name : '???'}
          </span>

          {/* Lock icon */}
          {!badge.unlocked && (
            <div className="absolute top-1 right-1">
              <svg className="w-2.5 h-2.5 text-gray-700" fill="currentColor" viewBox="0 0 20 20">
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
function MonthDots({ days }: { days: CalendarDay[] }) {
  // First day of month — what DOW?
  const firstDay = days.length > 0
    ? new Date(new Date().getFullYear(), new Date().getMonth(), 1).getDay()
    : 1;
  // Adjust: JS Sunday=0 → Monday=0
  const startOffset = firstDay === 0 ? 6 : firstDay - 1;
  const today = new Date().getDate();

  return (
    <div>
      {/* DOW headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {DOW_SHORT.map(d => (
          <div key={d} className="text-center text-[9px] text-gray-700">{d}</div>
        ))}
      </div>

      {/* Day dots */}
      <div className="grid grid-cols-7 gap-1">
        {/* Offset */}
        {Array.from({ length: startOffset }).map((_, i) => (
          <div key={`off-${i}`} />
        ))}

        {days.map((d) => {
          const isToday = d.day === today;
          const hasSession = d.sessions > 0;
          const isCompleted = d.completed;

          return (
            <div
              key={d.day}
              className="flex items-center justify-center"
            >
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] tabular-nums transition-all ${
                isToday
                  ? 'ring-1 ring-amber-500/40'
                  : ''
              } ${
                isCompleted
                  ? 'bg-amber-500/20 text-amber-400'
                  : hasSession
                    ? 'bg-amber-500/10 text-amber-500/60'
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
      <div className="flex items-center gap-2.5">
        <span className="text-sm">{icon}</span>
        <span className="text-sm text-gray-400">{label}</span>
      </div>
      <span className="text-sm font-medium text-white tabular-nums">{value}</span>
    </div>
  );
}
