import { withAuth, ok, created, badRequest, notFound } from '@/lib/api-helpers'
import { TimeEntryCreate, TimeEntryUpdate } from '@/lib/schemas'
import { calcAmount, calcHoursWorked, monthFromDate } from '@/lib/calculations'

export const GET = withAuth(async ({ req, supabase }) => {
  const { searchParams } = new URL(req.url)
  const employee_id = searchParams.get('employee_id')
  const month       = searchParams.get('month')
  const project_id  = searchParams.get('project_id')

  let q = supabase.from('time_entries').select('*, employees(first_name, last_name), projects(name)').order('date', { ascending: false })
  if (employee_id) q = q.eq('employee_id', employee_id)
  if (project_id)  q = q.eq('project_id', project_id)
  if (month) q = q.gte('date', `${month}-01`).lte('date', `${month}-31`)

  const { data, error } = await q
  if (error) return badRequest(error.message)
  return ok(data ?? [])
})

export const POST = withAuth(async ({ supabase, body }) => {
  const parsed = TimeEntryCreate.parse(body)
  const hours = parsed.hours_worked ?? calcHoursWorked(parsed.start_time ?? null, parsed.end_time ?? null, parsed.break_minutes)
  const amount = parsed.amount ?? calcAmount(hours, parsed.hourly_rate, parsed.rate_applied)

  const { data, error } = await supabase.from('time_entries').insert({
    ...parsed,
    hours_worked: hours,
    amount,
    month: parsed.month || monthFromDate(parsed.date),
  }).select().single()

  if (error) return badRequest(error.message)
  return created(data)
}, TimeEntryCreate)

export const PATCH = withAuth(async ({ supabase, body, req }) => {
  // Whitelist explicite via Zod — anti mass-assignment (drop .passthrough())
  // user_id n'est JAMAIS accepté : il vient du trigger RLS via auth.uid()
  const updates = TimeEntryUpdate.parse(body)
  if (Object.keys(updates).length === 0) return badRequest('Aucun champ à modifier')

  // id est dans la query string (?id=...) — collection route, pas de segment [id]
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return badRequest('id requis (?id=...)')

  if (updates.start_time && updates.end_time && updates.hours_worked === undefined) {
    updates.hours_worked = calcHoursWorked(updates.start_time, updates.end_time, updates.break_minutes ?? 0)
  }
  if (updates.hours_worked != null && updates.hourly_rate !== undefined && updates.amount === undefined) {
    updates.amount = calcAmount(updates.hours_worked, updates.hourly_rate, updates.rate_applied ?? 0)
  }

  const { data, error } = await supabase.from('time_entries').update(updates).eq('id', id).select().single()
  if (error) return badRequest(error.message)
  if (!data) return notFound('Entrée de temps introuvable')
  return ok(data)
}, TimeEntryUpdate)

export const DELETE = withAuth(async ({ req, supabase }) => {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return badRequest('id requis')
  const { error } = await supabase.from('time_entries').delete().eq('id', id)
  if (error) return badRequest(error.message)
  return ok({ deleted: true })
})