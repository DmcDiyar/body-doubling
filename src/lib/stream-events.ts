// ============================================================
// Stream Events — Event-driven city wars system
// Events are the single source of truth for all UI updates
// ============================================================

export type StreamEventType =
  | 'session_started'
  | 'session_completed'
  | 'session_milestone'
  | 'city_activity_change'
  | 'city_milestone'
  | 'user_message'
  | 'global_focus_hour'
  | 'country_challenge'
  | 'canvas_reveal'
  | 'system_announcement';

export interface StreamEvent {
  id: string;
  type: StreamEventType;
  city_id: string;
  city_name: string;
  city_emoji: string;
  user_name?: string;
  message: string;
  priority: number;
  ttl: number; // seconds
  created_at: string;
}

export interface CityActivity {
  city_id: string;
  active_users: number;
  today_minutes: number;
  mood: string;
}

export interface StreamData {
  cities: CityActivity[];
  total_active: number;
  total_minutes_today: number;
  events: StreamEvent[];
}

// Priority levels for chat message queue
export const EVENT_PRIORITY: Record<StreamEventType, number> = {
  session_started: 2,
  session_completed: 3,
  session_milestone: 3,
  city_activity_change: 4,
  city_milestone: 5,
  user_message: 2,
  global_focus_hour: 5,
  country_challenge: 4,
  canvas_reveal: 3,
  system_announcement: 5,
};

// TTL in seconds for each event type
export const EVENT_TTL: Record<StreamEventType, number> = {
  session_started: 60,
  session_completed: 90,
  session_milestone: 90,
  city_activity_change: 120,
  city_milestone: 180,
  user_message: 300,
  global_focus_hour: 1800,
  country_challenge: 3600,
  canvas_reveal: 600,
  system_announcement: 3600,
};

// Event icon mapping
export const EVENT_ICON: Record<StreamEventType, string> = {
  session_started: '\u{1F7E2}',
  session_completed: '\u{2705}',
  session_milestone: '\u{1F525}',
  city_activity_change: '\u{1F306}',
  city_milestone: '\u{1F3C6}',
  user_message: '\u{1F4AC}',
  global_focus_hour: '\u{1F30D}',
  country_challenge: '\u{2694}',
  canvas_reveal: '\u{1F3A8}',
  system_announcement: '\u{1F4E2}',
};

/**
 * Check if event has expired based on TTL
 */
export function isEventExpired(event: StreamEvent): boolean {
  const age = (Date.now() - new Date(event.created_at).getTime()) / 1000;
  return age > event.ttl;
}

/**
 * Priority queue: keep max N messages, replace lowest priority
 */
export function applyPriorityQueue(
  current: StreamEvent[],
  incoming: StreamEvent,
  maxMessages: number,
): StreamEvent[] {
  // Filter expired
  const alive = current.filter((e) => !isEventExpired(e));

  if (alive.length < maxMessages) {
    return [...alive, incoming];
  }

  // Find lowest priority message
  const lowestIdx = alive.reduce(
    (minIdx, e, idx) => (e.priority < alive[minIdx].priority ? idx : minIdx),
    0,
  );

  if (incoming.priority > alive[lowestIdx].priority) {
    const updated = [...alive];
    updated[lowestIdx] = incoming;
    return updated;
  }

  return alive;
}

/**
 * Time-based scene selection
 */
export type SceneTime = 'morning' | 'afternoon' | 'evening' | 'night';

export function getCurrentSceneTime(): SceneTime {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'night';
}

export const SCENE_CONFIG: Record<SceneTime, {
  video: string;
  gradient: string[];
  mood: string;
}> = {
  morning: {
    video: '/videos/ambient-1.mp4',
    gradient: ['#ffecd2', '#fcb69f'],
    mood: 'energetic',
  },
  afternoon: {
    video: '/videos/ambient-1.mp4',
    gradient: ['#4facfe', '#00f2fe'],
    mood: 'focused',
  },
  evening: {
    video: '/videos/ambient-2.mp4',
    gradient: ['#667eea', '#764ba2'],
    mood: 'calm',
  },
  night: {
    video: '/videos/ambient-2.mp4',
    gradient: ['#2c3e50', '#4ca1af'],
    mood: 'peaceful',
  },
};

// City geo coordinates [lng, lat] — for Mapbox
export const CITY_GEO: Record<string, { lng: number; lat: number; zoom: number }> = {
  istanbul:   { lng: 28.9784, lat: 41.0082, zoom: 10 },
  ankara:     { lng: 32.8597, lat: 39.9334, zoom: 10 },
  izmir:      { lng: 27.1428, lat: 38.4237, zoom: 10 },
  bursa:      { lng: 29.0610, lat: 40.1885, zoom: 10 },
  antalya:    { lng: 30.7133, lat: 36.8969, zoom: 10 },
  adana:      { lng: 35.3308, lat: 37.0000, zoom: 10 },
  konya:      { lng: 32.4846, lat: 37.8746, zoom: 10 },
  gaziantep:  { lng: 37.3781, lat: 37.0662, zoom: 10 },
  diyarbakir: { lng: 40.2189, lat: 37.9144, zoom: 10 },
  eskisehir:  { lng: 30.5206, lat: 39.7767, zoom: 10 },
  trabzon:    { lng: 39.7168, lat: 41.0027, zoom: 10 },
  kayseri:    { lng: 35.4894, lat: 38.7312, zoom: 10 },
  other_tr:   { lng: 35.0, lat: 39.0, zoom: 6 },
  abroad:     { lng: 10.0, lat: 50.0, zoom: 3 },
};

// Turkey center for default view
export const TURKEY_CENTER = { lng: 35.2433, lat: 38.9637, zoom: 5.8 };

// ── Canvas constants ──
export const CANVAS_SIZE = 64;
export const CANVAS_PIXEL_COUNT = CANVAS_SIZE * CANVAS_SIZE; // 4096

export const COLOR_PALETTE = [
  '#FFFFFF', // 0: white
  '#1A1A2E', // 1: dark navy (bg)
  '#FFCB77', // 2: amber (brand)
  '#FF6B6B', // 3: red
  '#4ECDC4', // 4: teal
  '#A78BFA', // 5: purple
  '#34D399', // 6: green
  '#60A5FA', // 7: blue
] as const;

// ── Global Event types ──
export interface GlobalEvent {
  id: string;
  event_type: 'focus_hour' | 'country_challenge' | 'canvas_reveal' | 'system_announcement';
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  status: 'scheduled' | 'active' | 'completed' | 'cancelled';
  scope: 'global' | 'country' | 'city';
  target_id: string | null;
  config: Record<string, unknown>;
  participant_count: number;
  total_minutes: number;
}
