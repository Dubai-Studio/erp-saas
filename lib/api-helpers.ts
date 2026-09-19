/**
 * Helpers HTTP standardisés pour toutes les routes API.
 */
import { NextRequest, NextResponse } from 'next/server'
import { ZodError, type ZodSchema } from 'zod'
import { getAuth } from './supabase-server'
import type { User } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface ApiError {
  error: string
  details?: unknown
  code?: string
}

export function ok <T> (data: T, init?: ResponseInit) {
  return NextResponse.json({ data }, { status: 200, ...init })
}

export function created <T> (data: T) {
  return NextResponse.json({ data }, { status: 201 })
}

export function noContent () {
  return new NextResponse(null, { status: 204 })
}

export function badRequest (error: string, details?: unknown) {
  return NextResponse.json({ error, details }, { status: 400 })
}

export function unauthorized (error = 'Non autorisé') {
  return NextResponse.json({ error }, { status: 401 })
}

export function forbidden (error = 'Accès refusé') {
  return NextResponse.json({ error }, { status: 403 })
}

export function notFound (error = 'Ressource introuvable') {
  return NextResponse.json({ error }, { status: 404 })
}

export function conflict (error: string) {
  return NextResponse.json({ error }, { status: 409 })
}

export function serverError (error: unknown) {
  const msg = error instanceof Error ? error.message : 'Erreur serveur'
  console.error('[API]', msg, error)
  return NextResponse.json({ error: msg }, { status: 500 })
}

export interface AuthContext <TBody = unknown> {
  req: NextRequest
  user: User
  supabase: SupabaseClient
  body: TBody
  params: Record<string, string>
}

/**
 * Wrapper pour route API authentifiée.
 * Accepte la signature Next.js `(req, ctx)` et passe `params` au handler.
 *
 * Usage :
 *   export const GET = withAuth(async ({ supabase, params }) => {
 *     const id = params.id
 *     ...
 *   })
 *
 *   export const POST = withAuth(async ({ supabase, body }) => {
 *     ...
 *   }, MyZodSchema)
 */
export function withAuth <TBody = unknown> (
  handler: (ctx: AuthContext<TBody>) => Promise<Response>,
  schema?: ZodSchema<TBody>,
) {
  return async (req: NextRequest, ctx?: { params: Promise<Record<string, string>> }) => {
    const auth = await getAuth(req)
    if (!auth.ok) return auth.response

    let params: Record<string, string> = {}
    if (ctx?.params) {
      try {
        params = await ctx.params
      } catch {
        params = {}
      }
    }

    let body: TBody = undefined as any
    if (schema && req.method !== 'GET' && req.method !== 'HEAD') {
      try {
        const raw = await req.json().catch(() => ({}))
        body = schema.parse(raw)
      } catch (e) {
        if (e instanceof ZodError) {
          return badRequest('Validation échouée', e.flatten())
        }
        return badRequest('JSON invalide')
      }
    }

    try {
      return await handler({
        req,
        user: auth.user,
        supabase: auth.supabase,
        body,
        params,
      })
    } catch (e) {
      return serverError(e)
    }
  }
}

export function withPublic <TBody = unknown> (
  handler: (ctx: { req: NextRequest; body: TBody }) => Promise<Response>,
  schema?: ZodSchema<TBody>,
) {
  return async (req: NextRequest) => {
    let body: TBody = undefined as any
    if (schema && req.method !== 'GET' && req.method !== 'HEAD') {
      try {
        const raw = await req.json().catch(() => ({}))
        body = schema.parse(raw)
      } catch (e) {
        if (e instanceof ZodError) return badRequest('Validation échouée', (e as ZodError).flatten())
        return badRequest('JSON invalide')
      }
    }
    try {
      return await handler({ req, body })
    } catch (e) {
      return serverError(e)
    }
  }
}