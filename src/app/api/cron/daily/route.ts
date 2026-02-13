import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';

/**
 * Cron: Daily Maintenance — Her gün 03:00 UTC
 * - Kırılan streak'leri sıfırla
 * - Streak risk bildirimleri gönder
 * - 30+ günlük eski bildirimleri temizle
 */
export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const supabase = createAdminClient();

        const { data, error } = await supabase.rpc('cron_daily_maintenance');

        if (error) {
            console.error('[CRON] daily maintenance error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        console.log('[CRON] daily maintenance result:', data);
        return NextResponse.json({ ok: true, result: data });
    } catch (err) {
        console.error('[CRON] daily maintenance exception:', err);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
