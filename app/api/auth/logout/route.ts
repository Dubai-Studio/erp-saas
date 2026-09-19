import { NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Détruit la session côté serveur et vide les cookies.
 *
 * Auth : ce endpoint est protégé par le middleware SSR (il redirige
 * vers /login si pas de session). On ne met pas withAuth ici parce que
 * signOut() est légitime même après expiration du JWT.
 */
export async function POST () {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get (name: string) { return cookieStore.get(name)?.value },
        set (name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options })
        },
        remove (name: string, options: CookieOptions) {
          cookieStore.set({ name, value: '', ...options })
        },
      },
    },
  )

  await supabase.auth.signOut()
  return NextResponse.json({ ok: true })
}