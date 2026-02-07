// ============================================================
// Sessiz Ortak - Sabitler
// ============================================================

// Avatarlar (MVP: 4 ücretsiz)
export const AVATARS = [
  { id: 1, name: 'Kedi', emoji: '🐱' },
  { id: 2, name: 'Ayı', emoji: '🐻' },
  { id: 3, name: 'Tavşan', emoji: '🐰' },
  { id: 4, name: 'Tilki', emoji: '🦊' },
] as const;

// Temalar
export const THEMES = [
  { id: 'rainy_cafe', name: 'Yağmurlu Kafe', emoji: '🌧️', free: true },
  { id: 'library', name: 'Kütüphane', emoji: '📚', free: true },
  { id: 'forest_cabin', name: 'Orman Kulübesi', emoji: '🌲', free: true },
] as const;

// Pomodoro süreleri (dakika)
export const DURATIONS = [
  { value: 15, label: '15 dk', description: 'Hızlı görev' },
  { value: 25, label: '25 dk', description: 'Klasik Pomodoro', recommended: true },
  { value: 50, label: '50 dk', description: 'Derin odak' },
  { value: 90, label: '90 dk', description: 'Uzun maraton' },
] as const;

// Trust score sınırları
export const TRUST = {
  SOLO_ONLY_THRESHOLD: 50,
  LOW_PRIORITY_THRESHOLD: 70,
  HIGH_PRIORITY_THRESHOLD: 90,
  INITIAL_SCORE: 100,
  MAX_SCORE: 200,
} as const;

// Trust Levels - Score aralıkları ve karşılık gelen seviyeler
export const TRUST_LEVELS = {
  RESTRICTED: {
    min: 0, max: 49,
    label: 'Restricted', labelTR: 'Kısıtlı',
    priority: -1, color: '#ef4444', emoji: '🔴',
    canMatch: false
  },
  NEWBIE: {
    min: 50, max: 69,
    label: 'Newbie', labelTR: 'Yeni',
    priority: 0, color: '#f97316', emoji: '🟠',
    canMatch: true
  },
  TRUSTED: {
    min: 70, max: 89,
    label: 'Trusted', labelTR: 'Güvenilir',
    priority: 1, color: '#eab308', emoji: '🟡',
    canMatch: true
  },
  VERIFIED: {
    min: 90, max: 119,
    label: 'Verified', labelTR: 'Doğrulanmış',
    priority: 2, color: '#22c55e', emoji: '🟢',
    canMatch: true
  },
  ELITE: {
    min: 120, max: 149,
    label: 'Elite', labelTR: 'Seçkin',
    priority: 3, color: '#3b82f6', emoji: '🔵',
    canMatch: true
  },
  LEGEND: {
    min: 150, max: 200,
    label: 'Legend', labelTR: 'Efsane',
    priority: 4, color: '#a855f7', emoji: '⭐',
    canMatch: true
  },
} as const;

// Trust level helper
export function getTrustLevel(score: number) {
  if (score >= TRUST_LEVELS.LEGEND.min) return TRUST_LEVELS.LEGEND;
  if (score >= TRUST_LEVELS.ELITE.min) return TRUST_LEVELS.ELITE;
  if (score >= TRUST_LEVELS.VERIFIED.min) return TRUST_LEVELS.VERIFIED;
  if (score >= TRUST_LEVELS.TRUSTED.min) return TRUST_LEVELS.TRUSTED;
  if (score >= TRUST_LEVELS.NEWBIE.min) return TRUST_LEVELS.NEWBIE;
  return TRUST_LEVELS.RESTRICTED;
}

// Rehabilitasyon sistemi
export const REHABILITATION = {
  REQUIRED_SESSIONS: 3,
  TRUST_PER_SESSION: 5,
  TOTAL_GAIN: 15,
  THRESHOLD: 50,
} as const;

// Günlük seans limiti (free tier)
export const FREE_DAILY_LIMIT = 3;

// Matching timeout (ms)
export const MATCHING_TIMEOUT_MS = 30_000;

// Session warm-up süresi (ms)
export const WARMUP_DURATION_MS = 30_000;

// Presence heartbeat interval (ms)
export const HEARTBEAT_INTERVAL_MS = 15_000;

// ============================================================
// MOTIVATIONAL MESSAGES - Matching wait screen'de gösterilir
// ============================================================
export const MOTIVATIONAL_MESSAGES = [
  // Sessizlik & Topluluk
  "Bugün sessizce ilerlemek yeterli.",
  "Odaklanmak için yalnız değilsin.",
  "Sessiz bir ortak seni bekliyor.",
  "Birisi seninle birlikte çalışacak.",
  // Küçük Adımlar
  "Küçük adımlar, büyük değişimler.",
  "Sadece başlamak yeterli.",
  "Her seans bir adımdır.",
  "İlerliyorsun, devam et.",
  // Kendine Zaman
  "Bugün kendine zaman ayırıyorsun.",
  "Sen bugün burada olmayı seçtin.",
  "Kendine yatırım yapıyorsun.",
  "Bu an senin için.",
  // Hazırlık
  "Bir nefes al, hazırsın.",
  "Odaklanmaya hazırlan.",
  "Şimdi senin zamanın.",
  "Başlamak için hazırsın.",
] as const;

// Random mesaj seç
export function getRandomMessage(): string {
  return MOTIVATIONAL_MESSAGES[Math.floor(Math.random() * MOTIVATIONAL_MESSAGES.length)];
}

// ============================================================
// FUN FACTS - Matching wait screen'de eğitici bilgiler
// ============================================================
export const FUN_FACTS = [
  "Pomodoro tekniği İtalyan 'domates' kelimesinden gelir.",
  "Ortalama insan odaklanma süresi 25 dakikadır.",
  "Çalışma arkadaşı bulma 'body doubling' tekniği olarak biliniyor.",
  "İnsanlar yalnızken değil, birlikte varken zirveye ulaşır.",
  "Sessizlik içinde kolektif enerji güçlüdür.",
  "Odaklanma bir yetenek değil, bir ortamdır.",
  "Küçük adımlar, büyük değişimler yaratır.",
  "Birlikte olmak, tek başına olmaktan güçlüdür.",
] as const;

// Random fun fact seç
export function getRandomFunFact(): string {
  return FUN_FACTS[Math.floor(Math.random() * FUN_FACTS.length)];
}

// Microcopy — Yargısız, baskısız, sessiz, minimal
export const COPY = {
  // Auth
  AUTH_TITLE: 'Sessiz Ortak',
  AUTH_SUBTITLE: 'Sen çalış, biz yanındayız.',
  AUTH_CTA: 'Google ile Devam Et',

  // Onboarding
  ONBOARDING_WELCOME: 'Hoş geldin!',
  ONBOARDING_AVATAR: 'Avatarını seç',
  ONBOARDING_GOAL: 'Bugün ne üzerinde çalışacaksın?',
  ONBOARDING_START: 'Hazırım',

  // Dashboard
  DASHBOARD_CTA: 'Hemen Başla',
  DASHBOARD_STREAK: 'Günlük Seri',
  DASHBOARD_TRUST: 'Güven',
  DASHBOARD_SESSIONS: 'Toplam Seans',

  // Matching
  MATCHING_SEARCHING: 'Sessiz ortağın aranıyor...',
  MATCHING_FOUND: 'Eşleşme bulundu!',
  MATCHING_TIMEOUT: 'Şu an uygun ortak bulunamadı.',
  MATCHING_SOLO: 'Tek başına devam et',
  MATCHING_RETRY: 'Tekrar dene',

  // Session
  SESSION_PARTNER_ACTIVE: 'çalışıyor',
  SESSION_PARTNER_IDLE: 'düşünüyor',
  SESSION_PARTNER_AWAY: 'uzakta',
  SESSION_EXIT: 'Sessizce Bitir',

  // Session End
  SESSION_COMPLETE: 'Harika iş!',
  SESSION_RATE: 'Seansı değerlendir',
  SESSION_AGAIN: 'Tekrar Eşleş',
  SESSION_DONE: 'Bugünlük Yeter',

  // Trust warning (ceza dili yok)
  TRUST_WARNING: 'Erken ayrılırsan eşleşmelerin yavaşlayabilir.',

  // Rehabilitation
  REHAB_TITLE: 'Trust Score Düşük',
  REHAB_MESSAGE: 'Topluluk güvenliği için kısa bir ara. Solo modda 3 seans tamamla, tekrar eşleş.',
  REHAB_COMPLETE: 'Hoş geldin! 🎉 Artık tekrar eşleşebilirsin.',
} as const;

