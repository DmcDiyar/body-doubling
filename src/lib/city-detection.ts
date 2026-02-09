// ============================================================
// City Detection — Two-layer approach
// Layer 1: Timezone/locale auto-detection (~70% accuracy)
// Layer 2: Soft prompt after 1-2 days
// ============================================================

export interface CityInfo {
  id: string;
  name: string;
  emoji: string;
  timezone: string;
  population: 'large' | 'medium' | 'small';
}

/**
 * Turkish city catalog — major cities with timezone associations.
 * Turkey is entirely in Europe/Istanbul timezone (UTC+3).
 * We use locale hints and user agent patterns for finer detection.
 */
export const CITIES: CityInfo[] = [
  { id: 'istanbul', name: 'İstanbul', emoji: '🌉', timezone: 'Europe/Istanbul', population: 'large' },
  { id: 'ankara', name: 'Ankara', emoji: '🏛️', timezone: 'Europe/Istanbul', population: 'large' },
  { id: 'izmir', name: 'İzmir', emoji: '🌊', timezone: 'Europe/Istanbul', population: 'large' },
  { id: 'bursa', name: 'Bursa', emoji: '🏔️', timezone: 'Europe/Istanbul', population: 'medium' },
  { id: 'antalya', name: 'Antalya', emoji: '☀️', timezone: 'Europe/Istanbul', population: 'medium' },
  { id: 'adana', name: 'Adana', emoji: '🌶️', timezone: 'Europe/Istanbul', population: 'medium' },
  { id: 'konya', name: 'Konya', emoji: '🌾', timezone: 'Europe/Istanbul', population: 'medium' },
  { id: 'gaziantep', name: 'Gaziantep', emoji: '🍢', timezone: 'Europe/Istanbul', population: 'medium' },
  { id: 'diyarbakir', name: 'Diyarbakır', emoji: '🧱', timezone: 'Europe/Istanbul', population: 'medium' },
  { id: 'eskisehir', name: 'Eskişehir', emoji: '🎓', timezone: 'Europe/Istanbul', population: 'medium' },
  { id: 'trabzon', name: 'Trabzon', emoji: '🍵', timezone: 'Europe/Istanbul', population: 'medium' },
  { id: 'kayseri', name: 'Kayseri', emoji: '🏔️', timezone: 'Europe/Istanbul', population: 'medium' },
  { id: 'other_tr', name: 'Diğer (Türkiye)', emoji: '🇹🇷', timezone: 'Europe/Istanbul', population: 'small' },
  { id: 'abroad', name: 'Yurt Dışı', emoji: '🌍', timezone: 'other', population: 'small' },
];

/**
 * Auto-detect city from timezone.
 * Layer 1: If timezone is Europe/Istanbul → likely Turkey → return null (needs prompt)
 * If timezone is NOT Europe/Istanbul → "Yurt Dışı"
 */
export function detectCityFromTimezone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz === 'Europe/Istanbul') {
      // Turkey — but which city? Return null to trigger soft prompt
      return null;
    }
    // Not Turkey timezone
    return 'abroad';
  } catch {
    return null;
  }
}

/**
 * Get city info by ID.
 */
export function getCityInfo(cityId: string): CityInfo | undefined {
  return CITIES.find((c) => c.id === cityId);
}

/**
 * Get city mood description (atmospheric, no numbers).
 */
export function getCityMoodText(mood: string, cityName: string): string {
  switch (mood) {
    case 'rising':
      return `${cityName} hareketleniyor. Odak enerjisi yükseliyor.`;
    case 'quiet':
      return `${cityName} sessizleşti. Sakin bir dönem.`;
    case 'awakening':
      return `${cityName} uyanıyor. Şu an aktif olanlar var.`;
    case 'steady':
      return `${cityName} dengeli bir ritimde. İstikrarlı enerji.`;
    default:
      return `${cityName} bekliyor.`;
  }
}

/**
 * Get mood emoji
 */
export function getMoodEmoji(mood: string): string {
  switch (mood) {
    case 'rising': return '📈';
    case 'quiet': return '🌙';
    case 'awakening': return '🌅';
    case 'steady': return '⚖️';
    default: return '💤';
  }
}
