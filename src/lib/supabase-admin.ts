import { createClient } from '@supabase/supabase-js';

/**
 * Supabase Admin Client — SADECE server-side kullanım (API routes, cron jobs)
 * Service Role key ile RLS bypass eder.
 * ⚠️ Bu client'ı ASLA client-side'da kullanma!
 */
export function createAdminClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!supabaseServiceKey) {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
    }

    return createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
}
