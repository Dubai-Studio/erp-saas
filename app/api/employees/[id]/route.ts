import { withAuth, ok, notFound, badRequest } from '@/lib/api-helpers'
import { EmployeeUpdate } from '@/lib/schemas'

export const GET = withAuth(async ({ supabase, params }) => {
  const id = params.id
  const { data, error } = await supabase.from('employees').select('*').eq('id', id).maybeSingle()
  if (error) return badRequest(error.message)
  if (!data) return notFound('Employé introuvable')
  return ok(data)
})

export const PATCH = withAuth(async ({ supabase, params, body }) => {
  const id = params.id
  const updates = EmployeeUpdate.parse(body)
  if (Object.keys(updates).length === 0) return badRequest('Aucun champ à modifier')

  const { data, error } = await supabase
    .from('employees')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) return badRequest(error.message)
  return ok(data)
}, EmployeeUpdate)

export const DELETE = withAuth(async ({ supabase, params }) => {
  const id = params.id
  const { error } = await supabase.from('employees').delete().eq('id', id)
  if (error) return badRequest(error.message)
  return ok({ deleted: true })
})