'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import { motion } from 'framer-motion';
import { TrendCard } from '@/components/stats/TrendCard';
import { InsightMessage } from '@/components/stats/InsightMessage';
import { TimeRangeToggle } from '@/components/stats/TimeRangeToggle';
import { BottomNav } from '@/components/layout/BottomNav';
import { buildTrendItems, getOverallInsight } from '@/lib/self-competition';
import type { SelfComparisonData, TrendItem } from '@/lib/self-competition';

export default function StatsPage() {
  const router = useRouter();
  const [range, setRange] = useState<'week' | 'month'>('week');
  const [items, setItems] = useState<TrendItem[]>([]);
  const [overallInsight, setOverallInsight] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        router.push('/auth');
        return;
      }

      const { data } = await supabase.rpc('get_self_comparison', {
        p_user_id: authUser.id,
        p_range: range,
      });

      if (data) {
        const comparison = data as SelfComparisonData;
        const trendItems = buildTrendItems(comparison);
        setItems(trendItems);
        setOverallInsight(getOverallInsight(trendItems));
        setStreak(comparison.current.streak);
      }

      setIsLoading(false);
    }

    setIsLoading(true);
    load();
  }, [range, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center">
        <div className="text-white/50 text-lg">Yükleniyor...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#1a1a2e] via-[#16213e] to-[#0f3460] px-4 py-8 pb-24">
      <div className="max-w-sm mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <span className="text-4xl mb-2 block">🪞</span>
          <h1 className="text-white text-xl font-semibold mb-1">Aynam</h1>
          <p className="text-gray-500 text-sm">Sadece kendinle kıyasla. Yargısız.</p>
        </motion.div>

        {/* Time Range Toggle */}
        <div className="mb-6">
          <TimeRangeToggle range={range} onChange={setRange} />
        </div>

        {/* Streak */}
        {streak > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-[#ffcb77]/10 border border-[#ffcb77]/20 rounded-xl p-3 mb-6 text-center"
          >
            <span className="text-lg">🔥</span>
            <span className="text-[#ffcb77] text-sm ml-2">
              {streak} günlük aktif seri
            </span>
          </motion.div>
        )}

        {/* Trend Cards */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {items.map((item, i) => (
            <TrendCard key={item.label} item={item} index={i} />
          ))}
        </div>

        {/* Overall Insight */}
        {overallInsight && (
          <InsightMessage message={overallInsight} />
        )}

        {/* Empty state */}
        {items.length === 0 && (
          <div className="text-center py-12">
            <span className="text-4xl mb-4 block">🌱</span>
            <p className="text-gray-400 text-sm">Henüz yeterli veri yok.</p>
            <p className="text-gray-600 text-xs mt-1">Birkaç seans sonra burada trendlerin görünecek.</p>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
