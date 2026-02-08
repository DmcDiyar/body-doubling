// ============================================================
// Sessiz Ortak - Sabitler
// ============================================================

// Avatarlar (MVP: 4 ücretsiz)
export const AVATARS = [
  { id: 1, name: 'Kedi', emoji: 'ðŸ±' },
  { id: 2, name: 'Ayi', emoji: 'ðŸ»' },
  { id: 3, name: 'Tavsan', emoji: 'ðŸ°' },
  { id: 4, name: 'Tilki', emoji: 'ðŸ¦Š' },
] as const;

// Temalar
export const THEMES = [
  { id: 'rainy_cafe', name: 'Yagmurlu Kafe', emoji: 'ðŸŒ§ï¸', free: true },
  { id: 'library', name: 'Kütüphane', emoji: 'ðŸ“š', free: true },
  { id: 'forest_cabin', name: 'Orman Kulübesi', emoji: 'ðŸŒ²', free: true },
] as const;

// Pomodoro süreleri (dakika)
export const DURATIONS = [
  { value: 15, label: '15 dk', description: 'Hizli görev' },
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
    priority: -1, color: '#ef4444', emoji: 'ðŸ”´',
    canMatch: false
  },
  NEWBIE: {
    min: 50, max: 69,
    label: 'Newbie', labelTR: 'Yeni',
    priority: 0, color: '#f97316', emoji: 'ðŸŸ ',
    canMatch: true
  },
  TRUSTED: {
    min: 70, max: 89,
    label: 'Trusted', labelTR: 'Güvenilir',
    priority: 1, color: '#eab308', emoji: 'ðŸŸ¡',
    canMatch: true
  },
  VERIFIED: {
    min: 90, max: 119,
    label: 'Verified', labelTR: 'Dogrulanmis',
    priority: 2, color: '#22c55e', emoji: 'ðŸŸ¢',
    canMatch: true
  },
  ELITE: {
    min: 120, max: 149,
    label: 'Elite', labelTR: 'Seçkin',
    priority: 3, color: '#3b82f6', emoji: 'ðŸ”µ',
    canMatch: true
  },
  LEGEND: {
    min: 150, max: 200,
    label: 'Legend', labelTR: 'Efsane',
    priority: 4, color: '#a855f7', emoji: 'â­',
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
  "Odaklanmak için yalniz degilsin.",
  "Sessiz bir ortak seni bekliyor.",
  "Birisi seninle birlikte çalisacak.",
  // Küçük Adimlar
  "Küçük adimlar, büyük degisimler.",
  "Sadece baslamak yeterli.",
  "Her seans bir adimdir.",
  "Ilerliyorsun, devam et.",
  // Kendine Zaman
  "Bugün kendine zaman ayiriyorsun.",
  "Sen bugün burada olmayi seçtin.",
  "Kendine yatirim yapiyorsun.",
  "Bu an senin için.",
  // Hazirlik
  "Bir nefes al, hazirsin.",
  "Odaklanmaya hazirlan.",
  "Simdi senin zamanin.",
  "Baslamak için hazirsin.",
] as const;

// Random mesaj seç
export function getRandomMessage(): string {
  return MOTIVATIONAL_MESSAGES[Math.floor(Math.random() * MOTIVATIONAL_MESSAGES.length)];
}

// ============================================================
// FUN FACTS - Matching wait screen'de egitici bilgiler
// ============================================================
export const FUN_FACTS = [
  "Pomodoro teknigi Italyan 'domates' kelimesinden gelir.",
  "Ortalama insan odaklanma süresi 25 dakikadir.",
  "Çalisma arkadasi bulma 'body doubling' teknigi olarak biliniyor.",
  "Insanlar yalnizken degil, birlikte varken zirveye ulasir.",
  "Sessizlik içinde kolektif enerji güçlüdür.",
  "Odaklanma bir yetenek degil, bir ortamdir.",
  "Küçük adimlar, büyük degisimler yaratir.",
  "Birlikte olmak, tek basina olmaktan güçlüdür.",
] as const;

// Random fun fact seç
export function getRandomFunFact(): string {
  return FUN_FACTS[Math.floor(Math.random() * FUN_FACTS.length)];
}

// Microcopy â€” Yargisiz, baskisiz, sessiz, minimal
export const COPY = {
  // Auth
  AUTH_TITLE: 'Sessiz Ortak',
  AUTH_SUBTITLE: 'Sen çalis, biz yanindayiz.',
  AUTH_CTA: 'Google ile Devam Et',

  // Onboarding
  ONBOARDING_WELCOME: 'Hos geldin!',
  ONBOARDING_AVATAR: 'Avatarini seç',
  ONBOARDING_GOAL: 'Bugün ne üzerinde çalisacaksin?',
  ONBOARDING_START: 'Hazirim',

  // Dashboard
  DASHBOARD_CTA: 'Hemen Basla',
  DASHBOARD_STREAK: 'Günlük Seri',
  DASHBOARD_TRUST: 'Güven',
  DASHBOARD_SESSIONS: 'Toplam Seans',

  // Matching
  MATCHING_SEARCHING: 'Sessiz ortagin araniyor...',
  MATCHING_FOUND: 'Eslesme bulundu!',
  MATCHING_TIMEOUT: 'Su an uygun ortak bulunamadi.',
  MATCHING_SOLO: 'Tek basina devam et',
  MATCHING_RETRY: 'Tekrar dene',

  // Session
  SESSION_PARTNER_ACTIVE: 'çalisiyor',
  SESSION_PARTNER_IDLE: 'düsünüyor',
  SESSION_PARTNER_AWAY: 'uzakta',
  SESSION_EXIT: 'Sessizce Bitir',

  // Session End
  SESSION_COMPLETE: 'Harika is!',
  SESSION_RATE: 'Seansi degerlendir',
  SESSION_AGAIN: 'Tekrar Esles',
  SESSION_DONE: 'Bugünlük Yeter',

  // Trust warning (ceza dili yok)
  TRUST_WARNING: 'Erken ayrilirsan eslesmelerin yavaslayabilir.',

  // Rehabilitation
  REHAB_TITLE: 'Trust Score Düsük',
  REHAB_MESSAGE: 'Topluluk güvenligi için kisa bir ara. Solo modda 3 seans tamamla, tekrar esles.',
  REHAB_COMPLETE: 'Hos geldin! ðŸŽ‰ Artik tekrar eslesebilirsin.',
} as const;


