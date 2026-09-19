import { withAuth, ok, created, badRequest } from '@/lib/api-helpers'
import { StockMovementCreate } from '@/lib/schemas'

export const GET = withAuth(async ({ req, supabase }) => {
  const { searchParams } = new URL(req.url)
  const product_id = searchParams.get('product_id')  // query param inchangé pour le front
  const type       = searchParams.get('type')

  let q = supabase
    .from('stock_movements_view')   // vue qui expose stock_item_id AS product_id
    .select('*, stock_items(name)')
    .order('date', { ascending: false })
  if (product_id) q = q.eq('product_id', product_id)
  if (type)       q = q.eq('type', type)

  const { data, error } = await q
  if (error) return badRequest(error.message)

  const normalized = (data ?? []).map((m: any) => ({
    ...m,
    item_name: m.stock_items?.name ?? '',
  }))
  return ok(normalized)
})

export const POST = withAuth(async ({ supabase, body }) => {
  const parsed = StockMovementCreate.parse(body)
  const { stock_item_id, type, quantity, unit_price, reason, reference, date } = parsed

  const { data, error } = await supabase.from('stock_movements').insert({
    stock_item_id,                       // nom réel de la colonne DB
    type:       type as any,             // CHECK accepte EN + FR
    quantity,
    unit_price,
    reason:     reason ?? null,
    reference:  reference ?? null,
    date:       date ?? new Date().toISOString().split('T')[0],
  }).select().single()

  if (error) return badRequest(error.message)
  return created(data)
}, StockMovementCreate)