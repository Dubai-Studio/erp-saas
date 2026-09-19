import { withAuth, ok, created, badRequest } from '@/lib/api-helpers'
import { StockItemCreate } from '@/lib/schemas'

export const GET = withAuth(async ({ req, supabase }) => {
  const { searchParams } = new URL(req.url)
  const status   = searchParams.get('status')
  const category = searchParams.get('category')
  const search   = searchParams.get('search')
  const lowOnly  = searchParams.get('low_only') === 'true'

  let q = supabase.from('stock_items').select('*').order('name', { ascending: true })
  if (status)   q = q.eq('status', status)
  if (category) q = q.eq('category', category)
  if (search)   q = q.or(`name.ilike.%${search}%,sku.ilike.%${search}%,reference.ilike.%${search}%`)
  if (lowOnly)  q = q.lte('quantity', 0) // fallback ; géré en post-fetch

  const { data, error } = await q
  if (error) return badRequest(error.message)
  return ok(data ?? [])
})

export const POST = withAuth(async ({ supabase, body }) => {
  const parsed = StockItemCreate.parse(body)
  const { data, error } = await supabase.from('stock_items').insert(parsed).select().single()
  if (error) return badRequest(error.message)
  return created(data)
}, StockItemCreate)