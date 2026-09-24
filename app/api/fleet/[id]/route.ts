import { withAuth, ok, notFound, badRequest } from '@/lib/api-helpers'
import { FleetVehicleUpdate } from '@/lib/schemas'
import { isValidUuid } from '@/lib/calculations'

/**
 * GET /api/fleet/[id] - détail d'un véhicule
 */
export const GET = withAuth(async ({ supabase, params }) => {
  const id = params.id
  if (!isValidUuid(id)) return badRequest('id invalide (UUID attendu)')
  const { data, error } = await supabase.from('fleet_vehicles').select('*').eq('id', id).maybeSingle()
  if (error) return badRequest(error.message)
  if (!data) return notFound('Véhicule introuvable')
  return ok(data)
})

/**
 * PATCH /api/fleet/[id] - mise à jour d'un véhicule
 * Vérifie l'existence avant update (sinon data=null silencieux).
 */
export const PATCH = withAuth(async ({ supabase, params, body }) => {
  const id = params.id
  if (!isValidUuid(id)) return badRequest('id invalide (UUID attendu)')

  const updates = FleetVehicleUpdate.parse(body)
  if (Object.keys(updates).length === 0) return badRequest('Aucun champ à modifier')

  const { data: existing, error: existErr } = await supabase
    .from('fleet_vehicles')
    .select('id')
    .eq('id', id)
    .maybeSingle()
  if (existErr) return badRequest(existErr.message)
  if (!existing) return notFound('Véhicule introuvable')

  const { data, error } = await supabase
    .from('fleet_vehicles')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) return badRequest(error.message)
  return ok(data)
}, FleetVehicleUpdate)

/**
 * DELETE /api/fleet/[id] - suppression d'un véhicule
 * Vérifie l'existence avant delete (cohérence avec les autres modules).
 */
export const DELETE = withAuth(async ({ supabase, params }) => {
  const id = params.id
  if (!isValidUuid(id)) return badRequest('id invalide (UUID attendu)')

  const { data: existing, error: existErr } = await supabase
    .from('fleet_vehicles')
    .select('id')
    .eq('id', id)
    .maybeSingle()
  if (existErr) return badRequest(existErr.message)
  if (!existing) return notFound('Véhicule introuvable')

  const { error } = await supabase
    .from('fleet_vehicles')
    .delete()
    .eq('id', id)
  if (error) return badRequest(error.message)
  return ok({ deleted: true, id })
})