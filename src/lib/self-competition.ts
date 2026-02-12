// ============================================================
// Self-Competition — "Ayna" (Mirror)
// Compare only with your past self. Trends, not numbers.
// ============================================================

export type TrendDirection = 'up' | 'down' | 'same' | 'new';

export interface SelfComparisonData {
  range: 'week' | 'month';
  current: {
    sessions: number;
    minutes: number;
    avg_duration: number;
    rituals: number;
    cooldowns: number;
    streak: number;
  };
  previous: {
    sessions: number;
    minutes: number;
    avg_duration: number;
    rituals: number;
    cooldowns: number;
  };
}

export interface TrendItem {
  label: string;
  current: number;
  previous: number;
  trend: TrendDirection;
  unit: string;
  insight: string;
}

/**
 * Calculate trend direction between two values.
 * No judgment — just direction.
 */
export function getTrend(current: number, previous: number): TrendDirection {
  if (previous === 0 && current === 0) return 'same';
  if (previous === 0) return 'new';
  if (current > previous) return 'up';
  if (current < previous) return 'down';
  return 'same';
}

/**
 * Get trend arrow symbol (non-judgmental colors handled in UI)
 */
export function getTrendArrow(trend: TrendDirection): string {
  switch (trend) {
    case 'up': return '↑';
    case 'down': return '↓';
    case 'new': return '✦';
    case 'same': return '→';
  }
}

/**
 * Transform raw comparison data into displayable trend items.
 */
export function buildTrendItems(data: SelfComparisonData): TrendItem[] {
  const { current: c, previous: p, range } = data;
  const label = range === 'week' ? 'geçen hafta' : 'geçen ay';

  return [
    {
      label: 'Seans',
      current: c.sessions,
      previous: p.sessions,
      trend: getTrend(c.sessions, p.sessions),
      unit: 'seans',
      insight: getSessionInsight(c.sessions, p.sessions, label),
    },
    {
      label: 'Odak Süresi',
      current: c.minutes,
      previous: p.minutes,
      trend: getTrend(c.minutes, p.minutes),
      unit: 'dk',
      insight: getMinutesInsight(c.minutes, p.minutes),
    },
    {
      label: 'Ritüel',
      current: c.rituals,
      previous: p.rituals,
      trend: getTrend(c.rituals, p.rituals),
      unit: 'kez',
      insight: getRitualInsight(c.rituals, p.rituals),
    },
    {
      label: 'Cooldown',
      current: c.cooldowns,
      previous: p.cooldowns,
      trend: getTrend(c.cooldowns, p.cooldowns),
      unit: 'kez',
      insight: getCooldownInsight(c.cooldowns, p.cooldowns),
    },
  ];
}

// ============================================================
// Insight Messages — Non-judgmental, observational
// ============================================================

function getSessionInsight(current: number, previous: number, range: string): string {
  if (previous === 0 && current === 0) return 'Henüz bir şey yok. İlk adımını bekliyor.';
  if (previous === 0) return 'İlk adım atıldı. Güzel başlangıç.';
  if (current > previous) return `${range}dan daha aktifsin.`;
  if (current < previous) return `${range}dan daha sakin bir dönem.`;
  return `${range} ile aynı ritimdesin.`;
}

function getMinutesInsight(current: number, previous: number): string {
  if (previous === 0 && current === 0) return 'Zamana ihtiyaç var. Sadece başla.';
  if (previous === 0) return 'İlk dakikalar birikmeye başladı.';
  if (current > previous) return `Odak süren artıyor.`;
  if (current < previous) return `Daha kısa ama belki daha yoğun.`;
  return `Dengeli bir tempo.`;
}

function getRitualInsight(current: number, previous: number): string {
  if (current === 0) return 'Ritüel henüz alışkanlığa dönmedi.';
  if (previous === 0) return 'Ritüel pratiğin başladı.';
  if (current > previous) return 'Bilinçli başlangıçlar artıyor.';
  if (current < previous) return 'Ritüellere ara verdin.';
  return 'Ritüel alışkanlığın stabil.';
}

function getCooldownInsight(current: number, previous: number): string {
  if (current === 0) return 'Kapanış ritüeli henüz değil.';
  if (previous === 0) return 'Bilinçli kapanış pratiği başladı.';
  if (current > previous) return 'Kapanışlara daha çok dikkat ediyorsun.';
  if (current < previous) return 'Cooldown atlamaları arttı.';
  return 'Kapanış alışkanlığın yerleşmiş.';
}

/**
 * Get overall insight message based on all trends.
 */
export function getOverallInsight(items: TrendItem[]): string {
  const upCount = items.filter((i) => i.trend === 'up').length;
  const downCount = items.filter((i) => i.trend === 'down').length;

  if (upCount >= 3) return 'Genel olarak yükseliş trendinde. Momentum seninle.';
  if (downCount >= 3) return 'Sakin bir dönemdesin. Bu da bir ritim.';
  if (upCount > downCount) return 'Bazı alanlar gelişiyor. Farkında mısın?';
  if (downCount > upCount) return 'Bazı alanlar yavaşladı. Sadece bir gözlem.';
  return 'Dengeli bir dönemdesin. İstikrar da bir başarı.';
}

// ============================================================
// Personal Insights — Enhanced stats interpretation
// ============================================================

export interface EnhancedStatsData {
  completion_rate: number;
  best_hour: number | null;
  preferred_duration: number | null;
  current_streak: number;
  longest_streak: number;
  total_minutes: number;
  total_sessions: number;
  completed_sessions: number;
  avg_sessions_per_week: number;
}

export function getPersonalInsights(stats: EnhancedStatsData): string[] {
  const insights: string[] = [];

  if (stats.completion_rate >= 80) {
    insights.push('Tamamlama oranın çok yüksek. İstikrarlı bir çalışma ritmin var.');
  } else if (stats.completion_rate >= 50) {
    insights.push('Seanslarının yarısından fazlasını tamamlıyorsun.');
  } else if (stats.completion_rate > 0) {
    insights.push('Bazen yarıda bırakmak da bir seçim. Yargısız.');
  }

  if (stats.best_hour !== null) {
    const hourLabel = stats.best_hour < 12 ? 'sabah' : stats.best_hour < 17 ? 'öğle sonrası' : 'akşam';
    insights.push(`En verimli zamanın ${hourLabel} saatleri gibi görünüyor.`);
  }

  if (stats.current_streak > 0 && stats.longest_streak > 0 && stats.current_streak >= stats.longest_streak * 0.8) {
    insights.push('Rekoruna yaklaşıyorsun. Kendi rekabetinde ileriyorsun.');
  }

  if (stats.avg_sessions_per_week >= 5) {
    insights.push('Haftalık ortalamanın düzenli. Alışkanlık oluşmuş.');
  }

  return insights;
}
