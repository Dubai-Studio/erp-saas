import { withAuth, ok, created, badRequest } from '@/lib/api-helpers'
import { ExpenseCreate } from '@/lib/schemas'
import { monthFromDate } from '@/lib/calculations'

export const GET = withAuth(async ({ req, supabase }) => {
  const { searchParams } = new URL(req.url)
  const project_id  = searchParams.get('project_id')
  const employee_id = searchParams.get('employee_id')
  const category    = searchParams.get('category')
  const month       = searchParams.get('month')
  const from        = searchParams.get('from')
  const to          = searchParams.get('to')

  let q = supabase.from('expenses').select('*, projects(name)').order('date', { ascending: false })
  if (project_id)  q = q.eq('project_id', project_id)
  if (employee_id) q = q.eq('employee_id', employee_id)
  if (category)    q = q.eq('category', category)
  if (month) {
    q = q.gte('date', `${month}-01`).lte('date', `${month}-31`)
  } else {
    if (from) q = q.gte('date', from)
    if (to)   q = q.lte('date', to)
  }

  const { data, error } = await q
  if (error) return badRequest(error.message)
  return ok(data ?? [])
})

export const POST = withAuth(async ({ supabase, body }) => {
  const parsed = ExpenseCreate.parse(body)
  const { data, error } = await supabase.from('expenses').insert({
    ...parsed,
    month: parsed.month || (parsed.date ? monthFromDate(parsed.date) : null),
  }).select().single()
  if (error) return badRequest(error.message)
  return created(data)
}, ExpenseCreate)