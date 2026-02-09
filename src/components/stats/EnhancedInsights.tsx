'use client';

import { motion } from 'framer-motion';

interface EnhancedStats {
  completion_rate: number;
  best_hour: number | null;
  preferred_duration: number | null;
  avg_sessions_per_week: number;
  city_contributions: number;
}

interface EnhancedInsightsProps {
  stats: EnhancedStats;
}

function getHourLabel(hour: number): string {
  if (hour >= 5 && hour < 12) return `Sabah (${hour}:00)`;
  if (hour >= 12 && hour < 17) return `Öğle sonrası (${hour}:00)`;
  if (hour >= 17 && hour < 21) return `Akşam (${hour}:00)`;
  return `Gece (${hour}:00)`;
}

function getDurationLabel(duration: number): string {
  if (duration <= 15) return '15dk - Hızlı';
  if (duration <= 25) return '25dk - Klasik';
  if (duration <= 50) return '50dk - Derin';
  return '90dk - Maraton';
}

export function EnhancedInsights({ stats }: EnhancedInsightsProps) {
  const insights = [
    {
      icon: '📊',
      label: 'Tamamlama',
      value: `%${stats.completion_rate}`,
      sublabel: 'tamamlandı',
    },
    stats.best_hour !== null ? {
      icon: '⏰',
      label: 'En Verimli',
      value: getHourLabel(stats.best_hour),
      sublabel: 'en çok tamamlanan saat',
    } : null,
    stats.preferred_duration !== null ? {
      icon: '⏱️',
      label: 'Tercih',
      value: getDurationLabel(stats.preferred_duration),
      sublabel: 'en çok kullanılan',
    } : null,
    {
      icon: '📅',
      label: 'Haftalık',
      value: `${stats.avg_sessions_per_week}`,
      sublabel: 'seans/hafta ort.',
    },
  ].filter(Boolean) as Array<{ icon: string; label: string; value: string; sublabel: string }>;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="mb-6"
    >
      <p className="text-white/40 text-xs uppercase tracking-wide mb-3">Detaylı Bakış</p>
      <div className="grid grid-cols-2 gap-2">
        {insights.map((item, i) => (
          <div
            key={i}
            className="bg-white/5 backdrop-blur-sm rounded-xl p-3 border border-white/5"
          >
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-sm">{item.icon}</span>
              <span className="text-white/50 text-[10px]">{item.label}</span>
            </div>
            <p className="text-white text-sm font-medium">{item.value}</p>
            <p className="text-white/30 text-[10px]">{item.sublabel}</p>
          </div>
        ))}
      </div>

      {/* Cross-page bağlantı: "Bu hafta şehir akışına X katkı yaptın" */}
      {stats.city_contributions > 0 && (
        <div className="mt-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-center">
          <span className="text-emerald-300 text-xs">
            🌆 Bu hafta şehir akışına {stats.city_contributions} katkı yaptın
          </span>
        </div>
      )}
    </motion.div>
  );
}
