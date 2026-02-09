import { createClient } from '@/lib/supabase-client';

export async function createSoloSession(
  userId: string,
  duration: number
): Promise<string | null> {
  const supabase = createClient();

  const { data: session } = await supabase
    .from('sessions')
    .insert({
      duration,
      mode: 'solo',
      theme: 'rainy_cafe',
      status: 'waiting',
    })
    .select('id')
    .single();

  if (!session) return null;

  await supabase.from('session_participants').insert({
    session_id: session.id,
    user_id: userId,
    status: 'waiting',
  });

  return session.id;
}
