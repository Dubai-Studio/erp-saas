/**
 * Helpers serveur unifiés.
 *
 * - getAuth(req)         : authentifie via cookies JWT Supabase (recommandé)
 * - getServerUser()      : user courant pour Server Components (await cookies())
 * - getAdminSupabase()   : client SERVICE KEY — UNIQUEMENT pour jobs/webhooks
 */
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'

export type AuthSuccess = {
  ok: true
  user: User
  supabase: SupabaseClient<any, any, any>
}
export type AuthFailure = { ok: false; response: NextResponse }
export type AuthResult = AuthSuccess | AuthFailure

export async function getAuth (req: NextRequest): Promise<AuthResult> {
  let response = NextResponse.next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get (name: string) { return req.cookies.get(name)?.value },
        set (name: string, value: string, options: CookieOptions) {
          req.cookies.set({ name, value, ...options })
          response = NextResponse.next({ request: { headers: req.headers } })
          response.cookies.set({ name, value, ...options })
        },
        remove (name: string, options: CookieOptions) {
          req.cookies.set({ name, value: '', ...options })
          response = NextResponse.next({ request: { headers: req.headers } })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    },
  )

  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Non autorisé' }, { status: 401 }),
    }
  }
  return { ok: true, user, supabase }
}

/**
 * Pour Server Components (lecture seule des cookies).
 * Note: depuis Next.js 15, cookies() est async.
 */
export async function getServerUser (): Promise<User | null> {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get (name: string) { return cookieStore.get(name)?.value },
        set () { /* noop côté lecture */ },
        remove () { /* noop */ },
      },
    },
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

/**
 * Client SERVICE KEY. JAMAIS utilisé pour répondre à une requête user authentifié.
 * Réservé aux opérations admin (webhooks, jobs CRON, migrations).
 */
export function getAdminSupabase (): SupabaseClient<any, any, any> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Config Supabase manquante côté serveur')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}