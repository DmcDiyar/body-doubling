import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';

/**
 * Cron: Weekly Cleanup — Her Pazartesi 04:00 UTC
 * - 30+ günlük presence log'larını sil
 * - 7+ günlük eski kuyruk kayıtlarını sil
 * - 90+ günlük trust_events'i arşivle
 */
export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const supabase = createAdminClient();

        // 1. Weekly cleanup
        const { data: cleanupData, error: cleanupError } = await supabase.rpc('cron_weekly_cleanup');

        if (cleanupError) {
            console.error('[CRON] weekly cleanup error:', cleanupError);
            return NextResponse.json({ error: cleanupError.message }, { status: 500 });
        }

        // 2. Rate limit cleanup (bonus — eski rate limit kayıtlarını da temizle)
        const { data: rlData, error: rlError } = await supabase.rpc('cleanup_rate_limits');

        if (rlError) {
            console.error('[CRON] rate limit cleanup error:', rlError);
            // Non-fatal — devam et
        }

        const result = {
            cleanup: cleanupData,
            rate_limits_deleted: rlData ?? 0,
        };

        console.log('[CRON] weekly result:', result);
        return NextResponse.json({ ok: true, result });
    } catch (err) {
        console.error('[CRON] weekly exception:', err);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
