import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/onboarding';

  if (code) {
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Kullanıcının onboarding'i tamamlayıp tamamlamadığını kontrol et
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('users')
          .select('name, avatar_id')
          .eq('id', user.id)
          .single();

        // Profil varsa ve isim boş değilse → dashboard'a git
        if (profile && profile.name && profile.name !== '') {
          // avatar_id hâlâ default (1) ve isim email'den oluşturulmuşsa → onboarding
          const emailPrefix = user.email?.split('@')[0] || '';
          if (profile.name === emailPrefix) {
            return NextResponse.redirect(`${origin}/onboarding`);
          }
          return NextResponse.redirect(`${origin}/dashboard`);
        }
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Auth hatası → auth sayfasına geri dön
  return NextResponse.redirect(`${origin}/auth?error=callback_failed`);
}
