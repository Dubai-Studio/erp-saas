import { withAuth, ok, created, badRequest } from '@/lib/api-helpers'
import { FleetVehicleCreate } from '@/lib/schemas'

export const GET = withAuth(async ({ req, supabase }) => {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const type   = searchParams.get('type')
  const search = searchParams.get('search')

  let q = supabase.from('fleet_vehicles').select('*').order('created_at', { ascending: false })
  if (status) q = q.eq('status', status)
  if (type)   q = q.eq('type', type)
  if (search) q = q.or(`name.ilike.%${search}%,brand.ilike.%${search}%,plate.ilike.%${search}%`)

  const { data, error } = await q
  if (error) return badRequest(error.message)
  return ok(data ?? [])
})

export const POST = withAuth(async ({ supabase, body }) => {
  const parsed = FleetVehicleCreate.parse(body)
  const { data, error } = await supabase.from('fleet_vehicles').insert(parsed).select().single()
  if (error) return badRequest(error.message)
  return created(data)
}, FleetVehicleCreate)