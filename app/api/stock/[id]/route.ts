import { withAuth, ok, notFound, badRequest } from '@/lib/api-helpers'
import { StockItemUpdate } from '@/lib/schemas'
import { isValidUuid } from '@/lib/calculations'

export const GET = withAuth(async ({ supabase, params }) => {
  const id = params.id
  if (!isValidUuid(id)) return badRequest('id invalide (UUID attendu)')
  const { data, error } = await supabase.from('stock_items').select('*').eq('id', id).maybeSingle()
  if (error) return badRequest(error.message)
  if (!data) return notFound('Article introuvable')
  return ok(data)
})

/**
 * PATCH /api/stock/[id]
 * Met à jour un article. Vérifie l'existence avant (sinon on recevait data
 * = null silencieusement). Renvoie 404 si l'article n'existe pas ou si RLS
 * bloque l'accès.
 */
export const PATCH = withAuth(async ({ supabase, params, body }) => {
  const id = params.id
  if (!isValidUuid(id)) return badRequest('id invalide (UUID attendu)')

  const updates = StockItemUpdate.parse(body)
  if (Object.keys(updates).length === 0) return badRequest('Aucun champ à modifier')

  // 1. Vérifie que l'article existe (et que RLS nous laisse y accéder)
  const { data: existing, error: existErr } = await supabase
    .from('stock_items')
    .select('id')
    .eq('id', id)
    .maybeSingle()
  if (existErr) return badRequest(existErr.message)
  if (!existing) return notFound('Article introuvable')

  // 2. UPDATE réel
  const { data, error } = await supabase
    .from('stock_items')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) return badRequest(error.message)
  return ok(data)
}, StockItemUpdate)

/**
 * DELETE /api/stock/[id]
 * Supprime un article. Vérifie l'existence avant de supprimer — sinon on
 * ne sait pas si la requête a réussi (RLS peut bloquer silencieusement).
 */
export const DELETE = withAuth(async ({ supabase, params }) => {
  const id = params.id
  if (!isValidUuid(id)) return badRequest('id invalide (UUID attendu)')

  // 1. Vérifie l'existence
  const { data: existing, error: existErr } = await supabase
    .from('stock_items')
    .select('id')
    .eq('id', id)
    .maybeSingle()
  if (existErr) return badRequest(existErr.message)
  if (!existing) return notFound('Article introuvable')

  // 2. DELETE réel
  const { error } = await supabase
    .from('stock_items')
    .delete()
    .eq('id', id)
  if (error) return badRequest(error.message)
  return ok({ deleted: true, id })
})