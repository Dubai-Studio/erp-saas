import { NextRequest } from 'next/server'
import { withAuth, ok, created, badRequest } from '@/lib/api-helpers'
import { ClientCreate, ClientUpdate } from '@/lib/schemas'
import { computeInvoiceTotals } from '@/lib/calculations'

/**
 * GET /api/clients
 * Liste tous les clients du tenant. Query params : status, search, limit, offset.
 */
export const GET = withAuth(async ({ req, supabase }) => {
  const { searchParams } = new URL(req.url)
  const status  = searchParams.get('status')
  const search  = searchParams.get('search')
  const limit   = Math.min(parseInt(searchParams.get('limit') || '100', 10), 500)
  const offset  = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0)

  let q = supabase.from('clients').select('*').order('name', { ascending: true }).range(offset, offset + limit - 1)
  if (status) q = q.eq('status', status)
  if (search) q = q.or(`name.ilike.%${search}%,email.ilike.%${search}%,vat_number.ilike.%${search}%`)

  const { data, error } = await q
  if (error) return badRequest(error.message)
  return ok(data ?? [])
})

/**
 * POST /api/clients
 * Crée un client. RLS injecte user_id = auth.uid() automatiquement.
 */
export const POST = withAuth(async ({ supabase, body }) => {
  // Zod a déjà validé la structure
  const parsed = ClientCreate.parse(body)
  const { data, error } = await supabase.from('clients').insert(parsed).select().single()
  if (error) return badRequest(error.message)
  return created(data)
}, ClientCreate)