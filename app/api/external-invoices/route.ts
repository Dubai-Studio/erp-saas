import { withAuth, ok, created, badRequest } from '@/lib/api-helpers'
import { ExternalInvoiceCreate } from '@/lib/schemas'

export const GET = withAuth(async ({ req, supabase }) => {
  const { searchParams } = new URL(req.url)
  const status    = searchParams.get('status')
  const project_id = searchParams.get('project_id')
  const month     = searchParams.get('month')

  let q = supabase
    .from('external_invoices')
    .select('*, projects(name)')
    .order('created_at', { ascending: false })
  if (status)     q = q.eq('status', status)
  if (project_id) q = q.eq('project_id', project_id)
  if (month)      q = q.gte('issue_date', `${month}-01`).lte('issue_date', `${month}-31`)

  const { data, error } = await q
  if (error) return badRequest(error.message)
  return ok(data ?? [])
})

export const POST = withAuth(async ({ supabase, body, user }) => {
  const parsed = ExternalInvoiceCreate.parse(body)

  // Migration 09 : on utilise une fonction RPC SECURITY DEFINER qui bypasse
  // RLS de manière ciblée. Le user_id est forcé côté serveur à auth.uid(),
  // donc aucun risque de mass-assignment. Cette voie marche immédiatement
  // après exécution de la migration, sans dépendre du "Reload schema cache"
  // (qui peut être oublié par l'utilisateur).
  const { data, error } = await supabase.rpc('insert_external_invoice', {
    p_supplier_name: parsed.supplier_name,
    p_supplier_id:   parsed.supplier_id   ?? null,
    p_client_id:     parsed.client_id     ?? null,
    p_project_id:    parsed.project_id    ?? null,
    p_amount_ht:     parsed.amount_ht,
    p_vat_amount:    parsed.vat_amount,
    p_total_amount:  parsed.total_amount,
    p_issue_date:    parsed.issue_date    || new Date().toISOString().split('T')[0],
    p_due_date:      parsed.due_date      ?? null,
    p_category:      parsed.category      ?? 'Prestation',
    p_notes:         parsed.notes         ?? null,
    p_status:        parsed.status        ?? 'pending',
    p_file_name:     parsed.file_name     ?? null,
    p_file_url:      parsed.file_url      ?? null,
    p_type:          'incoming',
  }).single()

  if (error) {
    // Fallback : si la RPC n'est pas encore créée (migration 09 pas exécutée),
    // on tente l'INSERT direct avec user_id explicite.
    if (error.code === 'PGRST202' || /function .* does not exist/i.test(error.message)) {
      const { data: fallback, error: fbErr } = await supabase.from('external_invoices').insert({
        ...parsed,
        type: 'incoming',
        issue_date: parsed.issue_date || new Date().toISOString().split('T')[0],
        user_id: user.id,
      }).select().single()
      if (fbErr) return badRequest(fbErr.message)
      return created(fallback)
    }
    return badRequest(error.message)
  }
  return created(data)
}, ExternalInvoiceCreate)

// NOTE IMPORTANTE (sécurité) :
// PATCH et DELETE sont exportés UNIQUEMENT depuis [id]/route.ts avec le schéma
// ExternalInvoiceUpdate (whitelist explicite, sans user_id, sans id).
// Toute requête PATCH/DELETE sur /api/external-invoices (collection) renvoie
// désormais 405 — c'est le comportement correct REST et cela ferme la faille
// de mass-assignment qui existait quand ces verbes étaient gérés ici par
// `body as any`. Ne pas les rajouter !
