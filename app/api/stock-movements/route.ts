import { withAuth, ok, created, badRequest } from '@/lib/api-helpers'
import { StockMovementCreate } from '@/lib/schemas'

/**
 * Traduit un (type, quantity) en delta de stock.
 * 'in/return' = +qty, 'out/loss' = -qty, 'adjust' = +qty (le trigger SUM recalcule),
 * 'transfert' = 0.
 *
 * Cette fonction DOIT rester alignée avec lib/supabase stock_movement_delta()
 * côté SQL (migration 14). Si tu changes l'un, change l'autre.
 */
function stockMovementDelta(type: string, qty: number): number {
  switch (type) {
    case 'in':
    case 'entrée':
    case 'return':
    case 'retour':
      return qty
    case 'out':
    case 'sortie':
    case 'loss':
    case 'perte':
      return -qty
    case 'adjust':
    case 'ajustement':
      return qty // le SUM final recalculera correctement
    case 'transfert':
      return 0
    default:
      return 0
  }
}

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

/**
 * POST /api/stock-movements
 *
 * Crée un mouvement ET met à jour la quantité de l'item correspondant.
 *
 * Migration 14 installe un trigger SQL (trg_stock_movements_apply) qui fait
 * ce travail automatiquement. Mais en attendant que l'utilisateur ait
 * appliqué la migration, on fait aussi le UPDATE inline ici (defense en
 * profondeur). Une fois le trigger en place, le UPDATE inline devient
 * redondant mais inoffensif (le trigger écrase par la valeur SUM).
 */
export const POST = withAuth(async ({ supabase, body }) => {
  const parsed = StockMovementCreate.parse(body)
  const { stock_item_id, type, quantity, unit_price, reason, reference, date } = parsed

  // 1. INSERT le mouvement
  const { data: movement, error } = await supabase.from('stock_movements').insert({
    stock_item_id,                       // nom réel de la colonne DB
    type:       type as any,             // CHECK accepte EN + FR
    quantity,
    unit_price,
    reason:     reason ?? null,
    reference:  reference ?? null,
    date:       date ?? new Date().toISOString().split('T')[0],
  }).select().single()

  if (error) return badRequest(error.message)

  // 2. UPDATE la quantité de l'item (defense en profondeur avant que le
  //    trigger SQL soit appliqué). Le trigger SUM recalcule de toute façon
  //    la valeur exacte après coup.
  const delta = stockMovementDelta(type as string, quantity)
  if (delta !== 0) {
    // Récupère la quantité actuelle
    const { data: item } = await supabase
      .from('stock_items')
      .select('quantity, min_quantity')
      .eq('id', stock_item_id)
      .maybeSingle()
    if (item) {
      const newQty = Math.max(0, Number(item.quantity || 0) + delta)
      const newStatus = newQty <= 0
        ? 'out_of_stock'
        : newQty <= Number(item.min_quantity || 0)
          ? 'low_stock'
          : 'in_stock'
      await supabase
        .from('stock_items')
        .update({ quantity: newQty, status: newStatus })
        .eq('id', stock_item_id)
    }
  }

  return created(movement)
}, StockMovementCreate)