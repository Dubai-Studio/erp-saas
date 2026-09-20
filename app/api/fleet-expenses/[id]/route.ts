import { withAuth, ok, notFound, badRequest } from '@/lib/api-helpers'
import { FleetExpenseUpdate } from '@/lib/schemas'

export const GET = withAuth(async ({ supabase, params }) => {
  const id = params.id
  const { data, error } = await supabase
    .from('fleet_expenses')
    .select('*, fleet_vehicles(name, brand, model, plate)')
    .eq('id', id)
    .maybeSingle()
  if (error) return badRequest(error.message)
  if (!data) return notFound('Dépense flotte introuvable')
  return ok(data)
})

export const PATCH = withAuth(async ({ supabase, params, body }) => {
  const id = params.id
  // Whitelist explicite via Zod — anti mass-assignment
  // user_id n'est JAMAIS accepté : il vient du trigger RLS via auth.uid()
  const updates = FleetExpenseUpdate.parse(body)
  if (Object.keys(updates).length === 0) return badRequest('Aucun champ à modifier')

  const { data, error } = await supabase
    .from('fleet_expenses')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()
  if (error) return badRequest(error.message)
  return ok(data)
}, FleetExpenseUpdate)

export const DELETE = withAuth(async ({ supabase, params }) => {
  const id = params.id
  const { error } = await supabase
    .from('fleet_expenses')
    .delete()
    .eq('id', id)
  if (error) return badRequest(error.message)
  return ok({ deleted: true })
})