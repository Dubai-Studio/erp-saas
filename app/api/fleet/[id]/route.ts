import { withAuth, ok, notFound, badRequest } from '@/lib/api-helpers'
import { FleetVehicleUpdate } from '@/lib/schemas'

export const GET = withAuth(async ({ supabase, params }) => {
  const id = params.id
  const { data, error } = await supabase.from('fleet_vehicles').select('*').eq('id', id).maybeSingle()
  if (error) return badRequest(error.message)
  if (!data) return notFound('Véhicule introuvable')
  return ok(data)
})

export const PATCH = withAuth(async ({ supabase, params, body }) => {
  const id = params.id
  const updates = FleetVehicleUpdate.parse(body)
  if (Object.keys(updates).length === 0) return badRequest('Aucun champ à modifier')

  const { data, error } = await supabase
    .from('fleet_vehicles')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) return badRequest(error.message)
  return ok(data)
}, FleetVehicleUpdate)

export const DELETE = withAuth(async ({ supabase, params }) => {
  const id = params.id
  const { error } = await supabase.from('fleet_vehicles').delete().eq('id', id)
  if (error) return badRequest(error.message)
  return ok({ deleted: true })
})