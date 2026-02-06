// ============================================================
// Sessiz Ortak - Database Types
// Supabase tablolarının TypeScript karşılıkları
// ============================================================

export type TrustLevel = 'newbie' | 'verified' | 'trusted' | 'elite';
export type SessionStatus = 'waiting' | 'active' | 'completed' | 'abandoned';
export type SessionMode = 'duo' | 'solo';
export type ParticipantStatus = 'waiting' | 'active' | 'completed' | 'left_early' | 'no_show';
export type PresenceStatus = 'active' | 'idle' | 'away';
export type QueueStatus = 'waiting' | 'matched' | 'expired' | 'cancelled';
export type MusicPreference = 'lofi' | 'classical' | 'silence';
export type AchievementRarity = 'common' | 'rare' | 'epic' | 'legendary';

export type TrustEventType =
  | 'session_completed'
  | 'rating_5_star'
  | 'rating_4_star'
  | 'rating_1_star'
  | 'early_exit_mild'
  | 'early_exit_moderate'
  | 'early_exit_severe'
  | 'no_show';

// ---- TABLE TYPES ----

export interface User {
  id: string;
  email: string;
  name: string;
  avatar_id: number;
  preferred_times: string[];
  music_preference: MusicPreference;
  language: string;
  total_sessions: number;
  completed_sessions: number;
  total_minutes: number;
  current_streak: number;
  longest_streak: number;
  last_session_date: string | null;
  trust_score: number;
  xp: number;
  level: number;
  is_premium: boolean;
  is_banned: boolean;
  created_at: string;
  last_active_at: string;
}

export interface Session {
  id: string;
  duration: number;
  mode: SessionMode;
  theme: string;
  status: SessionStatus;
  scheduled_start: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

export interface SessionParticipant {
  id: string;
  session_id: string;
  user_id: string;
  joined_at: string | null;
  left_at: string | null;
  status: ParticipantStatus;
  session_goal: string;
  goal_completed: boolean;
  rating: number | null;
  trust_score_change: number;
  xp_earned: number;
}

export interface MatchingQueueEntry {
  id: string;
  user_id: string;
  duration: number;
  theme: string;
  priority: number;
  status: QueueStatus;
  created_at: string;
  expires_at: string;
}

export interface UserPresenceLog {
  id: string;
  user_id: string;
  session_id: string;
  status: PresenceStatus;
  created_at: string;
}

export interface TrustEvent {
  id: string;
  user_id: string;
  session_id: string | null;
  event_type: TrustEventType;
  score_change: number;
  score_before: number;
  score_after: number;
  description: string;
  created_at: string;
}

export interface Achievement {
  id: number;
  code: string;
  name: string;
  description: string;
  icon: string;
  requirement: { type: string; value: number };
  rarity: AchievementRarity;
}

export interface UserAchievement {
  user_id: string;
  achievement_id: number;
  unlocked_at: string;
}

export interface UserLimit {
  id: string;
  user_id: string;
  date: string;
  sessions_used: number;
  max_sessions: number;
}

// ---- RPC RETURN TYPES ----

export interface CompleteSessionResult {
  xp_earned: number;
  trust_change: number;
  new_streak: number;
  goal_completed: boolean;
}

// ---- REALTIME PRESENCE ----

export interface RealtimePresence {
  user_id: string;
  avatar_id: number;
  name: string;
  status: PresenceStatus;
  session_goal: string;
  last_heartbeat: number;
}
