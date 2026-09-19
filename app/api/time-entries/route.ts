import { withAuth, ok, created, badRequest } from '@/lib/api-helpers'
import { TimeEntryCreate } from '@/lib/schemas'
import { calcAmount, calcHoursWorked, monthFromDate } from '@/lib/calculations'
import { z } from 'zod'

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

export const PATCH = withAuth(async ({ supabase, body }) => {
  const parsed = z.object({ id: z.string().uuid() }).passthrough().parse(body) as any
  const { id, ...fields } = parsed
  if (fields.start_time && fields.end_time && fields.hours_worked === undefined) {
    fields.hours_worked = calcHoursWorked(fields.start_time, fields.end_time, fields.break_minutes ?? 0)
  }
  if (fields.hours_worked !== undefined && fields.hourly_rate !== undefined && fields.amount === undefined) {
    fields.amount = calcAmount(fields.hours_worked, fields.hourly_rate, fields.rate_applied ?? 0)
  }
  const { data, error } = await supabase.from('time_entries').update(fields).eq('id', id).select().single()
  if (error) return badRequest(error.message)
  return ok(data)
})

export const DELETE = withAuth(async ({ req, supabase }) => {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return badRequest('id requis')
  const { error } = await supabase.from('time_entries').delete().eq('id', id)
  if (error) return badRequest(error.message)
  return ok({ deleted: true })
})