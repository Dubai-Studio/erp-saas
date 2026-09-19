import { withAuth, ok, notFound, badRequest } from '@/lib/api-helpers'
import { InvoiceUpdate } from '@/lib/schemas'
import { computeInvoiceTotals } from '@/lib/calculations'

/**
 * GET /api/invoices/:id
 */
export const GET = withAuth(async ({ supabase, params }) => {
  const id = params.id
  const { data, error } = await supabase
    .from('invoices')
    .select('*, clients(name, email, address, vat_number)')
    .eq('id', id)
    .maybeSingle()
  if (error) return badRequest(error.message)
  if (!data) return notFound('Facture introuvable')
  return ok(data)
})

/**
 * PATCH /api/invoices/:id
 * Recalcule les totaux si les lignes changent.
 */
export const PATCH = withAuth(async ({ supabase, params, body }) => {
  const id = params.id
  const parsed = InvoiceUpdate.parse({ ...body, id })

  const updates: Record<string, unknown> = { ...parsed }
  delete updates.id

  if (Array.isArray(parsed.lines)) {
    const totals = computeInvoiceTotals(parsed.lines)
    updates.subtotal = totals.subtotal
    updates.vat_amount = totals.vat_amount
    updates.total_amount = totals.total
  }

  const { data, error } = await supabase
    .from('invoices')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return badRequest(error.message)
  return ok(data)
}, InvoiceUpdate.omit({ id: true }))

/**
 * DELETE /api/invoices/:id
 */
export const DELETE = withAuth(async ({ supabase, params }) => {
  const id = params.id
  const { error } = await supabase.from('invoices').delete().eq('id', id)
  if (error) return badRequest(error.message)
  return ok({ deleted: true })
})