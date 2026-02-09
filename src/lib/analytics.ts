import { createClient } from '@/lib/supabase-client';
import { useAuthStore } from '@/stores/auth-store';
import { getAllAssignments } from '@/lib/experiments';

/**
 * Log an analytics event to the analytics_events table.
 * Auto-injects experiment variant assignments.
 * Fire-and-forget: errors are logged but never thrown.
 */
export async function logEvent(
  eventName: string,
  properties: Record<string, unknown> = {},
  sessionId?: string
): Promise<void> {
  try {
    const user = useAuthStore.getState().user;
    const experiments = getAllAssignments(user?.metadata);
    const enrichedProperties = {
      ...properties,
      ...(Object.keys(experiments).length > 0 ? { experiments } : {}),
    };

    const supabase = createClient();
    await supabase.rpc('log_analytics_event', {
      p_event_name: eventName,
      p_properties: enrichedProperties,
      p_session_id: sessionId ?? null,
    });
  } catch (err) {
    console.error('[analytics]', eventName, err);
  }
}

// Pre-defined event names for type safety
export const EVENTS = {
  MATCH_FOUND: 'match_found',
  MATCH_BROKEN_PARTNER_TIMEOUT: 'match_broken_partner_timeout',
  MATCH_BROKEN_USER_EXIT: 'match_broken_user_exit',
  REJOIN_SUCCESS: 'rejoin_success',
  REJOIN_DENIED: 'rejoin_denied',
  SOLO_MODE_ENTERED: 'solo_mode_entered',
  RITUAL_COMPLETED: 'ritual_completed',
  RITUAL_INCOMPLETE: 'ritual_incomplete',
  COOLDOWN_COMPLETED: 'cooldown_completed',
  COOLDOWN_SKIPPED: 'cooldown_skipped',
  SESSION_COMPLETED: 'session_completed',
  QUEST_DAILY_COMPLETED: 'quest_daily_completed',
  QUEST_WEEKLY_COMPLETED: 'quest_weekly_completed',
  QUEST_HIDDEN_UNLOCKED: 'quest_hidden_unlocked',
} as const;
