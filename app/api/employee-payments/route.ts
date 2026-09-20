import { withAuth, ok, created, badRequest } from '@/lib/api-helpers'
import { EmployeePaymentCreate, EmployeePaymentUpdate } from '@/lib/schemas'

export const GET = withAuth(async ({ req, supabase }) => {
  const { searchParams } = new URL(req.url)
  const employee_id = searchParams.get('employee_id')
  const month       = searchParams.get('month')

  let q = supabase
    .from('employee_payments')
    .select('*, employees(first_name, last_name)')
    .order('created_at', { ascending: false })
  if (employee_id) q = q.eq('employee_id', employee_id)
  if (month)       q = q.eq('month', month)

  const { data, error } = await q
  if (error) return badRequest(error.message)
  return ok(data ?? [])
})

export const POST = withAuth(async ({ supabase, body }) => {
  const parsed = EmployeePaymentCreate.parse(body)
  const { data, error } = await supabase.from('employee_payments').insert(parsed).select().single()
  if (error) return badRequest(error.message)
  return created(data)
}, EmployeePaymentCreate)

export const PATCH = withAuth(async ({ supabase, body, req }) => {
  // Whitelist explicite via Zod — anti mass-assignment
  // user_id n'est JAMAIS accepté : il vient du trigger RLS via auth.uid()
  const updates = EmployeePaymentUpdate.parse(body)
  if (Object.keys(updates).length === 0) return badRequest('Aucun champ à modifier')

  // id est dans la query string (?id=...) — collection route, pas de segment [id]
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return badRequest('id requis (?id=...)')

  const { data, error } = await supabase.from('employee_payments').update(updates).eq('id', id).select().single()
  if (error) return badRequest(error.message)
  return ok(data)
}, EmployeePaymentUpdate)

export const DELETE = withAuth(async ({ req, supabase }) => {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return badRequest('id requis')
  const { error } = await supabase.from('employee_payments').delete().eq('id', id)
  if (error) return badRequest(error.message)
  return ok({ deleted: true })
})