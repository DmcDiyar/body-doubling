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
] as const;

// Trust score sınırları
export const TRUST = {
  SOLO_ONLY_THRESHOLD: 50,
  LOW_PRIORITY_THRESHOLD: 70,
  HIGH_PRIORITY_THRESHOLD: 90,
  INITIAL_SCORE: 100,
  MAX_SCORE: 200,
} as const;

// Günlük seans limiti (free tier)
export const FREE_DAILY_LIMIT = 3;

// Matching timeout (ms)
export const MATCHING_TIMEOUT_MS = 30_000;

// Session warm-up süresi (ms)
export const WARMUP_DURATION_MS = 30_000;

// Presence heartbeat interval (ms)
export const HEARTBEAT_INTERVAL_MS = 15_000;

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
} as const;
