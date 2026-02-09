'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import { useAuthStore } from '@/stores/auth-store';
import { FREE_DAILY_LIMIT } from '@/lib/constants';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendCard } from '@/components/stats/TrendCard';
import { InsightMessage } from '@/components/stats/InsightMessage';
import { TimeRangeToggle } from '@/components/stats/TimeRangeToggle';
import { StatsSummaryCards } from '@/components/stats/StatsSummaryCards';
import { EnhancedInsights } from '@/components/stats/EnhancedInsights';
import { StreakAnalysis } from '@/components/stats/StreakAnalysis';
import { MysteryQuestCard, HIDDEN_QUEST_INFO } from '@/components/quests/QuestComponents';
import type { DailyQuest, WeeklyQuest } from '@/components/quests/QuestComponents';
import { FomoMessage } from '@/components/quests/FomoMessage';
import { QuestRevealModal } from '@/components/quests/QuestRevealModal';
import { MissedQuestGhost } from '@/components/quests/MissedQuestGhost';
import { QUEST_MYSTERY_DESCRIPTIONS } from '@/lib/quest-fomo';
import { useExperiment, EXPERIMENTS } from '@/lib/experiments';
import { RehabBanner } from '@/components/trust/TrustComponents';
import { BottomNav } from '@/components/layout/BottomNav';
import { buildTrendItems, getOverallInsight, getPersonalInsights } from '@/lib/self-competition';
import type { SelfComparisonData, TrendItem, EnhancedStatsData } from '@/lib/self-competition';
import type { User, UserLimit } from '@/types/database';

interface MissedQuestEntry {
  id: string;
  missed_at: string;
  type: string;
}

export default function StatsPage() {
  const router = useRouter();
  const { user, setUser } = useAuthStore();
  const [range, setRange] = useState<'week' | 'month'>('week');
  const [items, setItems] = useState<TrendItem[]>([]);
  const [overallInsight, setOverallInsight] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [enhancedStats, setEnhancedStats] = useState<EnhancedStatsData | null>(null);
  const [personalInsights, setPersonalInsights] = useState<string[]>([]);

  // Quest state (dashboard'dan taşındı)
  const [dailyQuest, setDailyQuest] = useState<DailyQuest | null>(null);
  const [weeklyQuest, setWeeklyQuest] = useState<WeeklyQuest | null>(null);
  const [hiddenCount, setHiddenCount] = useState(0);
  const [fomoMessage, setFomoMessage] = useState<string | null>(null);
  const [missedQuests, setMissedQuests] = useState<MissedQuestEntry[]>([]);
  const [revealModal, setRevealModal] = useState<'daily' | 'weekly' | null>(null);
  const [dailyUsed, setDailyUsed] = useState(0);

  const { isTreatment: fomoEnabled } = useExperiment(EXPERIMENTS.QUEST_FOMO.id);

  // Initial load (user, quests, enhanced stats)
  useEffect(() => {
    async function loadBase() {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        router.push('/auth');
        return;
      }

      // User profile
      if (!user) {
        const { data: profile } = await supabase
          .from('users')
          .select('*')
          .eq('id', authUser.id)
          .maybeSingle();
        if (profile) setUser(profile as User);
      }

      // Enhanced stats
      const { data: statsData } = await supabase.rpc('get_enhanced_stats', {
        p_user_id: authUser.id,
      });
      if (statsData) {
        const es = statsData as EnhancedStatsData;
        setEnhancedStats(es);
        setPersonalInsights(getPersonalInsights(es));
      }

      // Quest data
      const { data: meta } = await supabase
        .from('users')
        .select('metadata')
        .eq('id', authUser.id)
        .single();

      if (meta?.metadata) {
        const m = meta.metadata as {
          quests?: {
            daily?: DailyQuest;
            weekly?: WeeklyQuest;
            hidden_completed?: string[];
          };
          fomo?: { missed_quests?: MissedQuestEntry[] };
        };
        if (m.quests?.daily) setDailyQuest(m.quests.daily);
        if (m.quests?.weekly) setWeeklyQuest(m.quests.weekly);
        setHiddenCount((m.quests?.hidden_completed ?? []).length);
        if (m.fomo?.missed_quests) setMissedQuests(m.fomo.missed_quests);
      }

      // FOMO message
      const { data: fomoData } = await supabase.rpc('get_fomo_messages', {
        p_user_id: authUser.id,
      });
      if (fomoData && (fomoData as { message?: string }).message) {
        setFomoMessage((fomoData as { message: string }).message);
      }

      // Daily limit
      const today = new Date().toISOString().split('T')[0];
      const { data: limit } = await supabase
        .from('user_limits')
        .select('sessions_used')
        .eq('user_id', authUser.id)
        .eq('date', today)
        .maybeSingle();
      setDailyUsed((limit as UserLimit | null)?.sessions_used ?? 0);
    }

    loadBase();
  }, [router, setUser, user]);

  // Trend data (range-dependent)
  useEffect(() => {
    async function loadTrends() {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;

      setIsLoading(true);
      const { data } = await supabase.rpc('get_self_comparison', {
        p_user_id: authUser.id,
        p_range: range,
      });

      if (data) {
        const comparison = data as SelfComparisonData;
        const trendItems = buildTrendItems(comparison);
        setItems(trendItems);
        setOverallInsight(getOverallInsight(trendItems));
      }
      setIsLoading(false);
    }

    loadTrends();
  }, [range]);

  const handleRevealQuest = async (questType: 'daily' | 'weekly') => {
    if (!user) return;
    const supabase = createClient();
    await supabase.rpc('reveal_quest', {
      p_user_id: user.id,
      p_quest_type: questType,
    });
    const { data: updated } = await supabase.from('users').select('metadata').eq('id', user.id).single();
    if (updated?.metadata) {
      const meta = updated.metadata as { quests?: { daily?: DailyQuest; weekly?: WeeklyQuest } };
      if (meta.quests?.daily) setDailyQuest(meta.quests.daily);
      if (meta.quests?.weekly) setWeeklyQuest(meta.quests.weekly);
    }
    setRevealModal(null);
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    router.push('/auth');
  };

  const revealQuest = revealModal === 'daily' ? dailyQuest : weeklyQuest;
  const revealMystery = revealQuest ? QUEST_MYSTERY_DESCRIPTIONS[revealQuest.id] : null;

  if (!user) {
    return (
      <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center">
        <div className="text-white/50 text-lg">Yükleniyor...</div>
      </div>
    );
  }

  const isRestricted = user.trust_score < 50;

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Background Image */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/images/backgrounds/night-city.jpg')" }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/30 to-black/70" />

      {/* Content */}
      <div className="relative z-10 min-h-screen px-4 py-8 pb-24">
        <div className="max-w-sm mx-auto">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-6"
          >
            <span className="text-4xl mb-2 block">🪞</span>
            <h1 className="text-white text-xl font-semibold mb-1">Aynam</h1>
            <p className="text-white/40 text-sm">Sadece kendinle kıyasla. Yargısız.</p>
          </motion.div>

          {/* Stat Summary Cards (dashboard'dan) */}
          <StatsSummaryCards
            streak={user.current_streak}
            trustScore={user.trust_score}
            completedSessions={user.completed_sessions}
          />

          {/* Streak Analysis */}
          <StreakAnalysis
            currentStreak={user.current_streak}
            longestStreak={user.longest_streak}
          />

          {/* Time Range Toggle */}
          <div className="mb-6">
            <TimeRangeToggle range={range} onChange={setRange} />
          </div>

          {/* Trend Cards */}
          {isLoading ? (
            <div className="text-center py-8">
              <div className="text-white/30 text-sm">Yükleniyor...</div>
            </div>
          ) : items.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 mb-6">
              {items.map((item, i) => (
                <TrendCard key={item.label} item={item} index={i} />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 mb-6">
              <span className="text-3xl mb-3 block">🌱</span>
              <p className="text-white/40 text-sm">Henüz yeterli veri yok.</p>
              <p className="text-white/20 text-xs mt-1">Birkaç seans sonra burada trendlerin görünecek.</p>
            </div>
          )}

          {/* Enhanced Insights */}
          {enhancedStats && (
            <EnhancedInsights stats={enhancedStats} />
          )}

          {/* Overall Insight */}
          {overallInsight && (
            <InsightMessage message={overallInsight} />
          )}

          {/* Personal Insights */}
          {personalInsights.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="mb-6 space-y-2"
            >
              {personalInsights.map((insight, i) => (
                <div key={i} className="bg-white/5 backdrop-blur-sm rounded-lg p-3 border border-white/5">
                  <p className="text-white/60 text-xs">{insight}</p>
                </div>
              ))}
            </motion.div>
          )}

          {/* FOMO Message Banner */}
          {fomoEnabled && fomoMessage && (
            <div className="mb-6">
              <FomoMessage message={fomoMessage} missedCount={missedQuests.length} />
            </div>
          )}

          {/* Quest section */}
          {(dailyQuest || weeklyQuest) && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 space-y-3"
            >
              <div className="flex items-center justify-between">
                <p className="text-white/40 text-xs uppercase tracking-wide">Görevler</p>
                <p className="text-white/20 text-xs">
                  {hiddenCount}/{Object.keys(HIDDEN_QUEST_INFO).length} gizli görev
                </p>
              </div>
              <MysteryQuestCard
                quest={dailyQuest}
                questType="daily"
                fomoEnabled={fomoEnabled}
                onRevealClick={() => setRevealModal('daily')}
              />
              <MysteryQuestCard
                quest={weeklyQuest}
                questType="weekly"
                fomoEnabled={fomoEnabled}
                onRevealClick={() => setRevealModal('weekly')}
              />
            </motion.div>
          )}

          {/* Missed Quest Ghosts */}
          {fomoEnabled && missedQuests.length > 0 && (
            <div className="mb-6 space-y-2">
              {missedQuests.slice(0, 3).map((mq) => (
                <MissedQuestGhost key={mq.id + mq.missed_at} questId={mq.id} missedAt={mq.missed_at} />
              ))}
            </div>
          )}

          {/* Daily Usage */}
          {!user.is_premium && (
            <div className="text-center text-white/30 text-xs mb-4">
              Bugün: {dailyUsed}/{FREE_DAILY_LIMIT} seans
            </div>
          )}

          {/* Rehabilitation Banner */}
          {isRestricted && (
            <div className="mb-6">
              <RehabBanner userId={user.id} />
            </div>
          )}

          {/* Total focus time */}
          <div className="text-center mb-6">
            <p className="text-white/20 text-sm">
              Toplam {Math.floor(user.total_minutes / 60)} saat {user.total_minutes % 60} dk odaklandın
            </p>
          </div>

          {/* Logout */}
          <div className="text-center">
            <button
              onClick={handleLogout}
              className="text-white/30 hover:text-white/50 text-sm transition-colors"
            >
              Çıkış Yap
            </button>
          </div>
        </div>
      </div>

      {/* Quest Reveal Modal */}
      <AnimatePresence>
        {revealModal && revealMystery && (
          <QuestRevealModal
            questType={revealModal}
            teaser={revealMystery.teaser}
            hint={revealMystery.hint}
            onReveal={() => handleRevealQuest(revealModal)}
            onCancel={() => setRevealModal(null)}
          />
        )}
      </AnimatePresence>

      <BottomNav />
    </div>
  );
}
