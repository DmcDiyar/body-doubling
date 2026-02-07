// ============================================================
// Sessiz Ortak - Database Types (MVP 1.5)
// Supabase tablolarinin TypeScript karsiliklari
// ============================================================

export type TrustLevel = 'restricted' | 'newbie' | 'trusted' | 'verified' | 'elite' | 'legend';
export type SessionStatus = 'waiting' | 'preparing' | 'active' | 'completed' | 'abandoned';
export type SessionMode = 'duo' | 'solo';
export type ParticipantStatus = 'waiting' | 'joined' | 'active' | 'completed' | 'left_early' | 'no_show';
export type PresenceStatus = 'active' | 'idle' | 'away';
export type QueueStatus = 'waiting' | 'matched' | 'expired' | 'cancelled';
export type MusicPreference = 'lofi' | 'classical' | 'silence';
export type AchievementRarity = 'common' | 'rare' | 'epic' | 'legendary';
export type MatchState = 'preparing' | 'active' | 'broken' | 'completed';

export type TrustEventType =
  | 'session_completed'
  | 'solo_session_completed'
  | 'partner_rated_5_stars'
  | 'partner_rated_4_stars'
  | 'partner_rated_1_star'
  | 'partner_rated_2_stars'
  | 'rating_5_star'
  | 'rating_4_star'
  | 'rating_1_star'
  | 'early_exit_mild'
  | 'early_exit_moderate'
  | 'early_exit_severe'
  | 'ghosting'
  | 'no_show'
  | 'reported_and_verified'
  | 'helpful_report'
  | 'quest_weekly'
  | 'quest_hidden'
  | 'cooldown_skipped'
  | 'match_broken';

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
  trust_level: TrustLevel;
  xp: number;
  level: number;
  is_premium: boolean;
  is_banned: boolean;
  metadata: Record<string, unknown>;
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
  metadata: ParticipantMetadata;
}

export interface ParticipantMetadata {
  ritual?: {
    completed: boolean;
    intent: string;
    started_at: string;
    completed_at: string | null;
  };
  cooldown?: {
    completed: boolean;
    skipped: boolean;
    mood: string | null;
    reflection: string | null;
  };
  pomodoro?: {
    minutes: number;
  };
  [key: string]: unknown;
}

export interface Match {
  id: string;
  session_id: string;
  user_a_id: string;
  user_b_id: string;
  pomodoro_duration: number;
  state: MatchState;
  broken_reason: string | null;
  user_a_ready: boolean;
  user_b_ready: boolean;
  user_a_last_heartbeat: string;
  user_b_last_heartbeat: string;
  created_at: string;
  updated_at: string;
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
  related_user_id: string | null;
  metadata: Record<string, unknown>;
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

export interface AnalyticsEvent {
  id: string;
  user_id: string | null;
  session_id: string | null;
  event_name: string;
  properties: Record<string, unknown>;
  created_at: string;
}

// ---- RPC RETURN TYPES ----

export interface CompleteSessionResult {
  xp_earned: number;
  trust_change: number;
  new_streak: number;
  goal_completed: boolean;
}

export interface HeartbeatResult {
  partner_alive: boolean;
  match_state: MatchState;
  broken_reason?: string;
  error?: string;
}

export interface MarkReadyResult {
  both_ready: boolean;
  match_state: MatchState;
  error?: string;
}

export interface RejoinResult {
  success: boolean;
  reason?: string;
  match_state?: MatchState;
}

export interface QuestProcessResult {
  daily: { completed: boolean; quest_id?: string; reward_xp?: number };
  weekly: { completed: boolean; quest_id?: string; reward_xp?: number; reward_trust?: number };
  hidden_unlocked: string[];
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
