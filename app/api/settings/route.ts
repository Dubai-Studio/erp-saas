import { withAuth, ok, created, badRequest, serverError } from '@/lib/api-helpers'
import { CompanySettingsUpsert } from '@/lib/schemas'

/**
 * GET /api/settings
 * Retourne les company_settings du user connecté.
 *
 * Robuste aux doublons : on récupère la ligne la plus récente (updated_at
 * DESC, puis id DESC en tie-breaker) et on limite à 1. Plus de "multiple
 * rows returned" même si quelqu'un a re-créé des doublons avant la
 * migration 13.
 */
export const GET = withAuth(async ({ supabase }) => {
  const { data, error } = await supabase
    .from('company_settings')
    .select('*')
    .order('updated_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return badRequest(error.message)
  return ok(data ?? {
    company_name: '',
    country: 'Belgique',
    default_vat: 20,
    default_currency: 'EUR',
  })
})

/**
 * PUT /api/settings
 * Upsert des paramètres société (1 ligne par user).
 *
 * Robuste aux doublons pré-migration-13 : on supprime d'abord toutes les
 * lignes existantes pour ce user_id, puis on INSERT. Marche que la
 * contrainte UNIQUE existe ou non. Après la migration 13, la contrainte
 * UNIQUE garantit qu'il n'y aura plus de doublons, mais on garde ce
 * filet de sécurité pour les déploiements où la migration n'aurait pas
 * encore été appliquée.
 */
export const PUT = withAuth(async ({ supabase, body }) => {
  const parsed = CompanySettingsUpsert.parse(body)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return badRequest('Session invalide')

  // 1. Supprime toutes les lignes existantes pour ce user (defense contre
  //    les doublons créés avant la migration 13)
  const { error: delErr } = await supabase
    .from('company_settings')
    .delete()
    .eq('user_id', user.id)
  if (delErr) {
    // Si RLS bloque (pas le owner) ou autre, on log mais on continue :
    // un échec DELETE ne doit pas bloquer un settings save
    console.warn('[settings PUT] DELETE before INSERT failed (non-bloquant):', delErr.message)
  }

  // 2. INSERT la nouvelle ligne
  const insertPayload = {
    ...parsed,
    user_id: user.id,
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('company_settings')
    .insert(insertPayload)
    .select()
    .single()
  if (error) {
    // Si la contrainte UNIQUE existe (post-migration-13) et qu'il y a déjà
    // une ligne, on tombe sur duplicate key. Fallback : UPSERT.
    if (error.code === '23505' || /duplicate key/i.test(error.message)) {
      const { data: upd, error: upErr } = await supabase
        .from('company_settings')
        .update({ ...parsed, updated_at: insertPayload.updated_at })
        .eq('user_id', user.id)
        .select()
        .single()
      if (upErr) return serverError('Échec upsert settings : ' + upErr.message)
      return ok(upd)
    }
    return badRequest(error.message)
  }
  return ok(data)
}, CompanySettingsUpsert)