import { withAuth, ok, notFound, badRequest } from '@/lib/api-helpers'
import { ClientUpdate } from '@/lib/schemas'

/**
 * GET /api/clients/:id
 */
export const GET = withAuth(async ({ supabase, params }) => {
  const id = params.id
  const { data, error } = await supabase.from('clients').select('*').eq('id', id).maybeSingle()
  if (error) return badRequest(error.message)
  if (!data) return notFound('Client introuvable')
  return ok(data)
})

/**
 * PATCH /api/clients/:id
 * N'accepte que les champs autorisés, pas de spread body.
 */
export const PATCH = withAuth(async ({ supabase, params, body }) => {
  const id = params.id
  const updates = ClientUpdate.parse(body)
  if (Object.keys(updates).length === 0) return badRequest('Aucun champ à modifier')

  const { data, error } = await supabase.from('clients').update(updates).eq('id', id).select().single()
  if (error) return badRequest(error.message)
  return ok(data)
}, ClientUpdate)

/**
 * DELETE /api/clients/:id
 */
export const DELETE = withAuth(async ({ supabase, params }) => {
  const id = params.id
  const { error } = await supabase.from('clients').delete().eq('id', id)
  if (error) return badRequest(error.message)
  return ok({ deleted: true })
})