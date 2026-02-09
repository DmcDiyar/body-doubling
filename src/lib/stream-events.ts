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
  | 'user_message';

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
};

// TTL in seconds for each event type
export const EVENT_TTL: Record<StreamEventType, number> = {
  session_started: 60,
  session_completed: 90,
  session_milestone: 90,
  city_activity_change: 120,
  city_milestone: 180,
  user_message: 300,
};

// Event icon mapping
export const EVENT_ICON: Record<StreamEventType, string> = {
  session_started: '\u{1F7E2}',
  session_completed: '\u{2705}',
  session_milestone: '\u{1F525}',
  city_activity_change: '\u{1F306}',
  city_milestone: '\u{1F3C6}',
  user_message: '\u{1F4AC}',
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

// City coordinates on SVG viewBox (800x400) — approximate Turkey positions
export const CITY_COORDS: Record<string, { x: number; y: number }> = {
  istanbul: { x: 185, y: 115 },
  ankara: { x: 330, y: 155 },
  izmir: { x: 155, y: 210 },
  bursa: { x: 210, y: 140 },
  antalya: { x: 265, y: 275 },
  adana: { x: 400, y: 260 },
  konya: { x: 330, y: 235 },
  gaziantep: { x: 470, y: 250 },
  diyarbakir: { x: 545, y: 195 },
  eskisehir: { x: 270, y: 155 },
  trabzon: { x: 545, y: 100 },
  kayseri: { x: 400, y: 195 },
  other_tr: { x: 400, y: 310 },
  abroad: { x: 80, y: 50 },
};
