import { withAuth, ok, created, badRequest } from '@/lib/api-helpers'
import { CompanySettingsUpsert } from '@/lib/schemas'

/**
 * GET /api/settings
 * Retourne les company_settings du user connecté.
 */
export const GET = withAuth(async ({ supabase }) => {
  const { data, error } = await supabase
    .from('company_settings')
    .select('*')
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
 */
export const PUT = withAuth(async ({ supabase, body }) => {
  const parsed = CompanySettingsUpsert.parse(body)
  // Récupère l'user_id depuis auth
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return badRequest('Session invalide')

  const { data, error } = await supabase
    .from('company_settings')
    .upsert({ ...parsed, user_id: user.id }, { onConflict: 'user_id' })
    .select()
    .single()
  if (error) return badRequest(error.message)
  return ok(data)
}, CompanySettingsUpsert)