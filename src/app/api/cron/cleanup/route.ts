import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';

/**
 * Cron: Orphan Session Cleanup — Her 5 dakikada bir
 * - 3+ saat aktif/waiting kalan session'ları abandon et
 * - Orphan participant'ları temizle
 * - Expired kuyruk kayıtlarını expire et
 * - Stale match'leri broken yap
 */
export async function GET(request: Request) {
    // Cron secret doğrulama
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const supabase = createAdminClient();

        const { data, error } = await supabase.rpc('cron_cleanup_orphan_sessions');

        if (error) {
            console.error('[CRON] cleanup error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        console.log('[CRON] cleanup result:', data);
        return NextResponse.json({ ok: true, result: data });
    } catch (err) {
        console.error('[CRON] cleanup exception:', err);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
