import { NextRequest } from 'next/server'
import { withAuth, ok, created, badRequest } from '@/lib/api-helpers'
import { InvoiceCreate } from '@/lib/schemas'
import { computeInvoiceTotals, nextInvoiceNumber } from '@/lib/calculations'

/**
 * GET /api/invoices
 * Liste paginée des factures du tenant.
 */
export const GET = withAuth(async ({ req, supabase }) => {
  const { searchParams } = new URL(req.url)
  const status    = searchParams.get('status')
  const client_id = searchParams.get('client_id')
  const project_id = searchParams.get('project_id')
  const from      = searchParams.get('from')
  const to        = searchParams.get('to')
  const limit     = Math.min(parseInt(searchParams.get('limit') || '100', 10), 500)
  const offset    = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0)

  let q = supabase
    .from('invoices')
    .select('*, clients(name)')
    .order('issue_date', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status)     q = q.eq('status', status)
  if (client_id)  q = q.eq('client_id', client_id)
  if (project_id) q = q.eq('project_id', project_id)
  if (from)       q = q.gte('issue_date', from)
  if (to)         q = q.lte('issue_date', to)

  const { data, error } = await q
  if (error) return badRequest(error.message)
  return ok(data ?? [])
})

/**
 * POST /api/invoices
 * Crée une facture. user_id injecté par RLS trigger.
 * Numéro FAC-YYYY-NNNNNN généré côté serveur.
 */
export const POST = withAuth(async ({ supabase, body }) => {
  const parsed = InvoiceCreate.parse(body)
  const totals = computeInvoiceTotals(parsed.lines)

  // Génère un nouveau numéro unique basé sur le dernier
  const { data: last } = await supabase
    .from('invoices')
    .select('invoice_number')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const invoice_number = nextInvoiceNumber(last?.invoice_number)

  const { data, error } = await supabase.from('invoices').insert({
    ...parsed,
    invoice_number,
    subtotal:     totals.subtotal,
    vat_amount:   totals.vat_amount,
    total_amount: totals.total,
  }).select().single()

  if (error) return badRequest(error.message)
  return created(data)
}, InvoiceCreate)