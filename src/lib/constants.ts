// ============================================================
// Sessiz Ortak - Sabitler
// ============================================================

// Avatarlar (MVP: 4 ucretsiz)
export const AVATARS = [
  { id: 1, name: 'Kedi', emoji: '🐱' },
  { id: 2, name: 'Ayi', emoji: '🐻' },
  { id: 3, name: 'Tavsan', emoji: '🐰' },
  { id: 4, name: 'Tilki', emoji: '🦊' },
] as const;

// Temalar
export const THEMES = [
  { id: 'rainy_cafe', name: 'Yagmurlu Kafe', emoji: '🌧️', free: true },
  { id: 'library', name: 'Kutuphane', emoji: '📚', free: true },
  { id: 'forest_cabin', name: 'Orman Kulubesi', emoji: '🌲', free: true },
] as const;

// Pomodoro sureleri (dakika)
export const DURATIONS = [
  { value: 15, label: '15 dk', description: 'Hizli gorev' },
  { value: 25, label: '25 dk', description: 'Klasik Pomodoro', recommended: true },
  { value: 50, label: '50 dk', description: 'Derin odak' },
  { value: 90, label: '90 dk', description: 'Uzun maraton' },
] as const;

// Trust score sinirlari
export const TRUST = {
  SOLO_ONLY_THRESHOLD: 50,
  LOW_PRIORITY_THRESHOLD: 70,
  HIGH_PRIORITY_THRESHOLD: 90,
  INITIAL_SCORE: 100,
  MAX_SCORE: 200,
} as const;

// Trust Levels - Score araliklari ve karsilik gelen seviyeler
export const TRUST_LEVELS = {
  RESTRICTED: {
    min: 0, max: 49,
    label: 'Restricted', labelTR: 'Kisitli',
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
    label: 'Trusted', labelTR: 'Guvenilir',
    priority: 1, color: '#eab308', emoji: '🟡',
    canMatch: true
  },
  VERIFIED: {
    min: 90, max: 119,
    label: 'Verified', labelTR: 'Dogrulanmis',
    priority: 2, color: '#22c55e', emoji: '🟢',
    canMatch: true
  },
  ELITE: {
    min: 120, max: 149,
    label: 'Elite', labelTR: 'Seckin',
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

// Gunluk seans limiti (free tier)
export const FREE_DAILY_LIMIT = 3;

// Matching timeout (ms)
export const MATCHING_TIMEOUT_MS = 30_000;

// Session warm-up suresi (ms)
export const WARMUP_DURATION_MS = 30_000;

// Presence heartbeat interval (ms)
export const HEARTBEAT_INTERVAL_MS = 15_000;

// ============================================================
// MOTIVATIONAL MESSAGES - Matching wait screen'de gosterilir
// ============================================================
export const MOTIVATIONAL_MESSAGES = [
  // Sessizlik & Topluluk
  "Bugun sessizce ilerlemek yeterli.",
  "Odaklanmak icin yalniz degilsin.",
  "Sessiz bir ortak seni bekliyor.",
  "Birisi seninle birlikte calisacak.",
  // Kucuk Adimlar
  "Kucuk adimlar, buyuk degisimler.",
  "Sadece baslamak yeterli.",
  "Her seans bir adimdir.",
  "Ilerliyorsun, devam et.",
  // Kendine Zaman
  "Bugun kendine zaman ayiriyorsun.",
  "Sen bugun burada olmayi sectin.",
  "Kendine yatirim yapiyorsun.",
  "Bu an senin icin.",
  // Hazirlik
  "Bir nefes al, hazirsin.",
  "Odaklanmaya hazirlan.",
  "Simdi senin zamanin.",
  "Baslamak icin hazirsin.",
] as const;

// Random mesaj sec
export function getRandomMessage(): string {
  return MOTIVATIONAL_MESSAGES[Math.floor(Math.random() * MOTIVATIONAL_MESSAGES.length)];
}

// ============================================================
// FUN FACTS - Matching wait screen'de egitici bilgiler
// ============================================================
export const FUN_FACTS = [
  "Pomodoro teknigi Italyan 'domates' kelimesinden gelir.",
  "Ortalama insan odaklanma suresi 25 dakikadir.",
  "Calisma arkadasi bulma 'body doubling' teknigi olarak biliniyor.",
  "Insanlar yalnizken degil, birlikte varken zirveye ulasir.",
  "Sessizlik icinde kolektif enerji gucludur.",
  "Odaklanma bir yetenek degil, bir ortamdir.",
  "Kucuk adimlar, buyuk degisimler yaratir.",
  "Birlikte olmak, tek basina olmaktan gucludur.",
] as const;

// Random fun fact sec
export function getRandomFunFact(): string {
  return FUN_FACTS[Math.floor(Math.random() * FUN_FACTS.length)];
}

// Microcopy - Yargisiz, baskisiz, sessiz, minimal
export const COPY = {
  // Auth
  AUTH_TITLE: 'Sessiz Ortak',
  AUTH_SUBTITLE: 'Sen calis, biz yanindayiz.',
  AUTH_CTA: 'Google ile Devam Et',

  // Onboarding
  ONBOARDING_WELCOME: 'Hos geldin!',
  ONBOARDING_AVATAR: 'Avatarini sec',
  ONBOARDING_GOAL: 'Bugun ne uzerinde calisacaksin?',
  ONBOARDING_START: 'Hazirim',

  // Dashboard
  DASHBOARD_CTA: 'Hemen Basla',
  DASHBOARD_STREAK: 'Gunluk Seri',
  DASHBOARD_TRUST: 'Guven',
  DASHBOARD_SESSIONS: 'Toplam Seans',

  // Matching
  MATCHING_SEARCHING: 'Sessiz ortagin araniyor...',
  MATCHING_FOUND: 'Eslesme bulundu!',
  MATCHING_TIMEOUT: 'Su an uygun ortak bulunamadi.',
  MATCHING_SOLO: 'Tek basina devam et',
  MATCHING_RETRY: 'Tekrar dene',

  // Session
  SESSION_PARTNER_ACTIVE: 'calisiyor',
  SESSION_PARTNER_IDLE: 'dusunuyor',
  SESSION_PARTNER_AWAY: 'uzakta',
  SESSION_EXIT: 'Sessizce Bitir',

  // Session End
  SESSION_COMPLETE: 'Harika is!',
  SESSION_RATE: 'Seansi degerlendir',
  SESSION_AGAIN: 'Tekrar Esles',
  SESSION_DONE: 'Bugunluk Yeter',

  // Trust warning (ceza dili yok)
  TRUST_WARNING: 'Erken ayrilirsan eslesmelerin yavaslayabilir.',

  // Rehabilitation
  REHAB_TITLE: 'Trust Score Dusuk',
  REHAB_MESSAGE: 'Topluluk guvenligi icin kisa bir ara. Solo modda 3 seans tamamla, tekrar esles.',
  REHAB_COMPLETE: 'Hos geldin! Artik tekrar eslesebilirsin.',
} as const;
