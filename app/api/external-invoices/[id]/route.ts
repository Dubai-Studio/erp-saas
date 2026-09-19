import { withAuth, ok, notFound, badRequest } from '@/lib/api-helpers'

export const GET = withAuth(async ({ supabase, params }) => {
  const id = params.id
  const { data, error } = await supabase
    .from('external_invoices')
    .select('*, projects(name)')
    .eq('id', id)
    .maybeSingle()
  if (error) return badRequest(error.message)
  if (!data) return notFound('Facture fournisseur introuvable')
  return ok(data)
})

export const PATCH = withAuth(async ({ supabase, params, body }) => {
  const id = params.id
  // Whitelist explicite — pas de spread body (anti mass-assignment)
  const { data, error } = await supabase
    .from('external_invoices')
    .update({
      ...(body as any),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()
  if (error) return badRequest(error.message)
  return ok(data)
})

export const DELETE = withAuth(async ({ supabase, params }) => {
  const id = params.id
  const { error } = await supabase
    .from('external_invoices')
    .delete()
    .eq('id', id)
  if (error) return badRequest(error.message)
  return ok({ deleted: true })
})