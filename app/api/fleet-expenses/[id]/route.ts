import { withAuth, ok, notFound, badRequest } from '@/lib/api-helpers'

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
  const { data, error } = await supabase
    .from('fleet_expenses')
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
    .from('fleet_expenses')
    .delete()
    .eq('id', id)
  if (error) return badRequest(error.message)
  return ok({ deleted: true })
})