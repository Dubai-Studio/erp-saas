import { withAuth, ok, created, badRequest } from '@/lib/api-helpers'
import { FleetExpenseCreate } from '@/lib/schemas'
import { monthFromDate } from '@/lib/calculations'

export const GET = withAuth(async ({ req, supabase }) => {
  const { searchParams } = new URL(req.url)
  const vehicle_id = searchParams.get('vehicle_id')
  const month      = searchParams.get('month')
  const type       = searchParams.get('type')

  let q = supabase
    .from('fleet_expenses')
    .select('*, fleet_vehicles(name, brand, model, plate)')
    .order('date', { ascending: false })
  if (vehicle_id) q = q.eq('vehicle_id', vehicle_id)
  if (month)      q = q.eq('month', month)
  if (type)       q = q.eq('type', type)

  const { data, error } = await q
  if (error) return badRequest(error.message)
  return ok(data ?? [])
})

export const POST = withAuth(async ({ supabase, body }) => {
  const parsed = FleetExpenseCreate.parse(body)
  const date  = parsed.date || new Date().toISOString().split('T')[0]
  const month = parsed.month || monthFromDate(date)

  const { data, error } = await supabase.from('fleet_expenses').insert({
    ...parsed,
    date,
    month,
  }).select().single()

  if (error) return badRequest(error.message)
  return created(data)
}, FleetExpenseCreate)

export const DELETE = withAuth(async ({ req, supabase }) => {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return badRequest('id requis')
  const { error } = await supabase.from('fleet_expenses').delete().eq('id', id)
  if (error) return badRequest(error.message)
  return ok({ deleted: true })
})