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
  const { data, error } = await supabase.from('external_invoices').insert({
    ...parsed,
    // Migration 05 a élargi le CHECK : 'incoming','supplier_invoice','facture_fournisseur','expense'
    type: 'incoming',
    issue_date: parsed.issue_date || new Date().toISOString().split('T')[0],
    // user_id explicite (en plus du trigger trg_set_user_id) — défense en profondeur
    // pour fermer toute race condition ou si le trigger n'a pas été appliqué.
    // Le trigger est "IF NULL THEN set" donc ne touche pas la nôtre.
    user_id: user.id,
  }).select().single()

  if (error) return badRequest(error.message)
  return created(data)
}, ExternalInvoiceCreate)

// NOTE IMPORTANTE (sécurité) :
// PATCH et DELETE sont exportés UNIQUEMENT depuis [id]/route.ts avec le schéma
// ExternalInvoiceUpdate (whitelist explicite, sans user_id, sans id).
// Toute requête PATCH/DELETE sur /api/external-invoices (collection) renvoie
// désormais 405 — c'est le comportement correct REST et cela ferme la faille
// de mass-assignment qui existait quand ces verbes étaient gérés ici par
// `body as any`. Ne pas les rajouter !
