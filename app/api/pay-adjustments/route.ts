import { withAuth, ok, created, badRequest, conflict } from '@/lib/api-helpers'
import { PayAdjustmentCreate } from '@/lib/schemas'
import { currentMonth } from '@/lib/calculations'

export const GET = withAuth(async ({ req, supabase }) => {
  const { searchParams } = new URL(req.url)
  const employee_id = searchParams.get('employee_id')
  const month       = searchParams.get('month')
  const project_id  = searchParams.get('project_id')

  let q = supabase
    .from('pay_adjustments')
    .select('*, employees(first_name, last_name, salary)')
    .order('created_at', { ascending: false })
  if (employee_id) q = q.eq('employee_id', employee_id)
  if (month)       q = q.eq('month', month)
  if (project_id)  q = q.eq('project_id', project_id)

  const { data, error } = await q
  if (error) return badRequest(error.message)
  return ok(data ?? [])
})

export const POST = withAuth(async ({ supabase, body }) => {
  const parsed = PayAdjustmentCreate.parse(body)
  const month = parsed.month || currentMonth()

  // Garde unicité : un seul salaire par employé/mois
  if (parsed.type === 'salaire') {
    const { data: existing } = await supabase
      .from('pay_adjustments')
      .select('id')
      .eq('employee_id', parsed.employee_id)
      .eq('type', 'salaire')
      .eq('month', month)
      .maybeSingle()
    if (existing) return conflict(`Salaire déjà enregistré pour ${month}`)
  }

  const { data, error } = await supabase.from('pay_adjustments').insert({
    ...parsed,
    month,
    reason: parsed.reason ?? (parsed.type === 'salaire' ? `Salaire ${month}` : null),
    date: parsed.date ?? new Date().toISOString().split('T')[0],
  }).select().single()

  if (error) return badRequest(error.message)
  return created(data)
}, PayAdjustmentCreate)

export const PATCH = withAuth(async ({ supabase, body }) => {
  const { id, ...fields } = body as any
  if (!id) return badRequest('id requis')
  if ('project_id' in fields && !fields.project_id) fields.project_id = null
  const { data, error } = await supabase.from('pay_adjustments').update(fields).eq('id', id).select().single()
  if (error) return badRequest(error.message)
  return ok(data)
})

export const DELETE = withAuth(async ({ req, supabase }) => {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return badRequest('id requis')
  const { error } = await supabase.from('pay_adjustments').delete().eq('id', id)
  if (error) return badRequest(error.message)
  return ok({ deleted: true })
})