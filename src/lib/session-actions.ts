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
export async function createSoloSession(
  userId: string,
  duration: number
): Promise<string | null> {
  const supabase = createClient();

  // Clean up orphans first
  await cleanupOrphanSessions(userId);

  const { data: session } = await supabase
    .from('sessions')
    .insert({
      duration,
      mode: 'solo',
      theme: 'rainy_cafe',
      status: 'active',
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (!session) return null;

  await supabase.from('session_participants').insert({
    session_id: session.id,
    user_id: userId,
    status: 'active',
    joined_at: new Date().toISOString(),
  });

  return session.id;
}

// ── Complete Solo Session (RPC) ──────────────────────
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
    await supabase
      .from('sessions')
      .update({ status: 'completed', ended_at: new Date().toISOString() })
      .eq('id', sessionId);
    return null;
  }

  return data as CompletionResult;
}

// ── Abandon Session ──────────────────────────────────
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

// ── Cleanup Orphan Sessions (batch) ──────────────────
// Fixed: single batch UPDATE instead of N+1 loop
export async function cleanupOrphanSessions(userId: string): Promise<void> {
  const supabase = createClient();

  const { data: orphans } = await supabase
    .from('session_participants')
    .select('session_id, sessions!inner(id, mode, status)')
    .eq('user_id', userId)
    .eq('sessions.mode', 'solo')
    .in('sessions.status', ['waiting', 'active']);

  if (!orphans || orphans.length === 0) return;

  const sessionIds = orphans.map(o => o.session_id);

  // Batch update — 2 queries instead of 2*N
  await supabase
    .from('sessions')
    .update({ status: 'abandoned', ended_at: new Date().toISOString() })
    .in('id', sessionIds);

  await supabase
    .from('session_participants')
    .update({ status: 'left_early', left_at: new Date().toISOString() })
    .eq('user_id', userId)
    .in('session_id', sessionIds);
}

// ── Refresh User Profile ─────────────────────────────
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
// Fixed: now also updates session_participants via RPC-style PATCH
export function beaconAbandonSession(sessionId: string): void {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return;

  let accessToken = supabaseKey;
  try {
    const storageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed?.access_token) accessToken = parsed.access_token;
    }
  } catch {
    // Fall back to anon key
  }

  const headers = {
    'Content-Type': 'application/json',
    'apikey': supabaseKey,
    'Authorization': `Bearer ${accessToken}`,
    'Prefer': 'return=minimal',
  };

  const now = new Date().toISOString();

  // 1. Update session status
  try {
    fetch(`${supabaseUrl}/rest/v1/sessions?id=eq.${sessionId}&status=in.(waiting,active)`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status: 'abandoned', ended_at: now }),
      keepalive: true,
    });
  } catch { /* best effort */ }

  // 2. Update participant status (FIX: previously missing)
  try {
    fetch(`${supabaseUrl}/rest/v1/session_participants?session_id=eq.${sessionId}&status=in.(waiting,active)`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status: 'left_early', left_at: now }),
      keepalive: true,
    });
  } catch { /* best effort */ }
}
