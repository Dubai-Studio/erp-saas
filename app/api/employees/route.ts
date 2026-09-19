import { withAuth, ok, created, badRequest } from '@/lib/api-helpers'
import { EmployeeCreate } from '@/lib/schemas'

/**
 * GET /api/employees
 */
export const GET = withAuth(async ({ req, supabase }) => {
  const { searchParams } = new URL(req.url)
  const status     = searchParams.get('status')
  const department = searchParams.get('department')
  const search     = searchParams.get('search')

  let q = supabase.from('employees').select('*').order('last_name', { ascending: true })
  if (status)     q = q.eq('status', status)
  if (department) q = q.eq('department', department)
  if (search)     q = q.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`)

  const { data, error } = await q
  if (error) return badRequest(error.message)
  return ok(data ?? [])
})

/**
 * POST /api/employees
 */
export const POST = withAuth(async ({ supabase, body }) => {
  const parsed = EmployeeCreate.parse(body)
  const { data, error } = await supabase.from('employees').insert(parsed).select().single()
  if (error) return badRequest(error.message)
  return created(data)
}, EmployeeCreate)