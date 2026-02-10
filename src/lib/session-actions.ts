import { createClient } from '@/lib/supabase-client';
import type { User, UserLimit } from '@/types/database';

// ── Types ────────────────────────────────────────────
interface CompletionResult {
  xp_earned: number;
  trust_change: number;
  new_streak: number;
  rehabilitation: boolean;
}

// ── Create Solo Session ──────────────────────────────
// Creates session + participant, sets both to 'active' immediately
export async function createSoloSession(
  userId: string,
  duration: number
): Promise<string | null> {
  const supabase = createClient();

  // First clean up any orphan sessions from this user
  // (sessions stuck in waiting/active that belong to us)
  await cleanupOrphanSessions(userId);

  const { data: session } = await supabase
    .from('sessions')
    .insert({
      duration,
      mode: 'solo',
      theme: 'rainy_cafe',
      status: 'active',         // ← directly active (solo = no waiting)
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (!session) return null;

  await supabase.from('session_participants').insert({
    session_id: session.id,
    user_id: userId,
    status: 'active',           // ← participant also active
    joined_at: new Date().toISOString(),
  });

  return session.id;
}

// ── Complete Solo Session (RPC) ──────────────────────
// Calls the DB function that handles streak, XP, trust, user_limits
export async function completeSoloSession(
  sessionId: string,
  userId: string,
  goalCompleted: boolean = false
): Promise<CompletionResult | null> {
  const supabase = createClient();

  const { data, error } = await supabase.rpc('complete_solo_session', {
    p_session_id: sessionId,
    p_user_id: userId,
    p_goal_completed: goalCompleted,
  });

  if (error) {
    console.error('complete_solo_session error:', error.message);
    // Fallback: at minimum mark session as completed
    await supabase
      .from('sessions')
      .update({ status: 'completed', ended_at: new Date().toISOString() })
      .eq('id', sessionId);
    return null;
  }

  return data as CompletionResult;
}

// ── Abandon Session ──────────────────────────────────
// Marks session + participant as abandoned
export async function abandonSession(
  sessionId: string,
  userId?: string
): Promise<void> {
  const supabase = createClient();

  await supabase
    .from('sessions')
    .update({ status: 'abandoned', ended_at: new Date().toISOString() })
    .eq('id', sessionId)
    .in('status', ['waiting', 'preparing', 'active']);

  if (userId) {
    await supabase
      .from('session_participants')
      .update({ status: 'left_early', left_at: new Date().toISOString() })
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .in('status', ['waiting', 'active']);
  }
}

// ── Cleanup Orphan Sessions ──────────────────────────
// Finds sessions belonging to user that are stuck in waiting/active
// and marks them as abandoned. Called before creating new session.
export async function cleanupOrphanSessions(userId: string): Promise<void> {
  const supabase = createClient();

  // Find solo sessions where this user is a participant and session is stuck
  const { data: orphans } = await supabase
    .from('session_participants')
    .select('session_id, sessions!inner(id, mode, status)')
    .eq('user_id', userId)
    .eq('sessions.mode', 'solo')
    .in('sessions.status', ['waiting', 'active']);

  if (!orphans || orphans.length === 0) return;

  for (const orphan of orphans) {
    const sessionId = orphan.session_id;
    await supabase
      .from('sessions')
      .update({ status: 'abandoned', ended_at: new Date().toISOString() })
      .eq('id', sessionId);
    await supabase
      .from('session_participants')
      .update({ status: 'left_early', left_at: new Date().toISOString() })
      .eq('session_id', sessionId)
      .eq('user_id', userId);
  }
}

// ── Refresh User Profile ─────────────────────────────
// Fetches latest user data from DB (after completion, trust/streak updated)
export async function refreshUserProfile(): Promise<User | null> {
  const supabase = createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return null;

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .single();

  return profile as User | null;
}

// ── Refresh Daily Usage ──────────────────────────────
export async function refreshDailyUsage(userId: string): Promise<number> {
  const supabase = createClient();
  const today = new Date().toISOString().split('T')[0];

  const { data: limit } = await supabase
    .from('user_limits')
    .select('sessions_used')
    .eq('user_id', userId)
    .eq('date', today)
    .maybeSingle();

  return (limit as UserLimit | null)?.sessions_used ?? 0;
}

// ── Beacon Abandon (beforeunload) ────────────────────
// Uses sendBeacon for reliable fire-and-forget on page close.
// Falls back to fetch keepalive.
export function beaconAbandonSession(sessionId: string): void {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return;

  const url = `${supabaseUrl}/rest/v1/sessions?id=eq.${sessionId}&status=in.(waiting,active)`;
  const body = JSON.stringify({ status: 'abandoned', ended_at: new Date().toISOString() });

  const headers = {
    'Content-Type': 'application/json',
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
    'Prefer': 'return=minimal',
  };

  // fetch keepalive — works in beforeunload
  try {
    fetch(url, {
      method: 'PATCH',
      headers,
      body,
      keepalive: true,
    });
  } catch {
    // Best effort — nothing more we can do
  }
}
