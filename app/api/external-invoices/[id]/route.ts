import { withAuth, ok, notFound, badRequest } from '@/lib/api-helpers'
import { ExternalInvoiceUpdate } from '@/lib/schemas'

export const GET = withAuth(async ({ supabase, params }) => {
  const id = params.id
  // Pas d'embed `projects(name)` : PostgREST ne détecte pas la FK
  // external_invoices.project_id → projects.id dans son schema cache (le user n'a
  // pas nécessairement exécuté la migration 11). On retourne la ligne brute et
  // la page résout `project_name` via la liste `projects` qu'elle a déjà chargée.
  const { data, error } = await supabase
    .from('external_invoices')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) return badRequest(error.message)
  if (!data) return notFound('Facture fournisseur introuvable')
  return ok(data)
})

export const PATCH = withAuth(async ({ supabase, params, body }) => {
  const id = params.id
  // Whitelist explicite via Zod — anti mass-assignment
  // user_id n'est JAMAIS accepté : il vient du trigger RLS via auth.uid()
  const updates = ExternalInvoiceUpdate.parse(body)
  if (Object.keys(updates).length === 0) return badRequest('Aucun champ à modifier')

  const { data, error } = await supabase
    .from('external_invoices')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()
  if (error) return badRequest(error.message)
  return ok(data)
}, ExternalInvoiceUpdate)

export const DELETE = withAuth(async ({ supabase, params }) => {
  const id = params.id
  const { error } = await supabase
    .from('external_invoices')
    .delete()
    .eq('id', id)
  if (error) return badRequest(error.message)
  return ok({ deleted: true })
})