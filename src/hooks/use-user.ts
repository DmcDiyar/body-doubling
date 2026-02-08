'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase-client';
import { useAuthStore } from '@/stores/auth-store';
import type { User } from '@/types/database';

export function useUser() {
  const { user, isLoading, setUser, setLoading } = useAuthStore();

  useEffect(() => {
    const supabase = createClient();

    async function fetchUser() {
      setLoading(true);
      const { data: { user: authUser } } = await supabase.auth.getUser();

      if (!authUser) {
        setUser(null);
        return;
      }

      const { data } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle();

      if (data) {
        setUser(data as User);
      } else {
        // Trigger çalismadiysa fallback olustur
        const { data: newUser } = await supabase
          .from('users')
          .upsert({
            id: authUser.id,
            email: authUser.email ?? '',
            name: authUser.email?.split('@')[0] ?? 'Kullanici',
            avatar_id: 1,
          })
          .select('*')
          .single();
        setUser(newUser as User | null);
      }
    }

    fetchUser();

    // Auth state degisimlerini dinle
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event) => {
        if (event === 'SIGNED_IN') {
          await fetchUser();
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [setUser, setLoading]);

  return { user, isLoading };
}

