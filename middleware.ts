import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * SSR auth guard.
 *
 * - Rafraîchit la session Supabase à chaque requête (cookies SSR).
 * - Protège toutes les routes sous /dashboard/* : redirige vers /login si pas
 *   de session valide.
 * - Redirige les utilisateurs connectés qui vont sur /login ou /register
 *   vers /dashboard.
 *
 * Les routes publiques (/, /login, /register, /reset-password, /api/webhooks/*)
 * passent sans auth.
 */
export async function middleware (request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get (name: string) { return request.cookies.get(name)?.value },
        set (name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value, ...options })
        },
        remove (name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    },
  )

  // Rafraîchit la session si nécessaire
  const { data: { user } } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const isPublic =
    path === '/' ||
    path.startsWith('/login') ||
    path.startsWith('/register') ||
    path.startsWith('/reset-password') ||
    path.startsWith('/auth/') ||
    path.startsWith('/api/webhooks/')

  if (!isPublic && !user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', path)
    return NextResponse.redirect(loginUrl)
  }

  // Connecté mais sur une page d'auth → dashboard
  if (user && (path.startsWith('/login') || path.startsWith('/register'))) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match tout sauf :
     * - _next/static, _next/image, favicon.ico
     * - fichiers publics (svg, png, jpg, jpeg, gif, webp)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}