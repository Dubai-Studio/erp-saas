import { withAuth, ok, created, badRequest } from '@/lib/api-helpers'
import { ProjectCreate } from '@/lib/schemas'

export const GET = withAuth(async ({ req, supabase }) => {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const client_id = searchParams.get('client_id')
  const search = searchParams.get('search')

  let q = supabase.from('projects').select('*, clients(name)').order('created_at', { ascending: false })
  if (status)    q = q.eq('status', status)
  if (client_id) q = q.eq('client_id', client_id)
  if (search)    q = q.ilike('name', `%${search}%`)

  const { data: projects, error } = await q
  if (error) return badRequest(error.message)

  // Calcule le total des factures par projet (cross-module)
  const ids = (projects ?? []).map((p: any) => p.id)
  let totals: Record<string, number> = {}
  if (ids.length > 0) {
    const { data: invs } = await supabase
      .from('invoices')
      .select('project_id, total_amount')
      .in('project_id', ids)
      .eq('status', 'paid')
    for (const inv of invs ?? []) {
      if (!inv.project_id) continue
      totals[inv.project_id] = (totals[inv.project_id] || 0) + Number(inv.total_amount || 0)
    }
  }

  const result = (projects ?? []).map((p: any) => ({
    ...p,
    revenue_total: totals[p.id] || 0,
    margin_pct: p.budget > 0 ? Math.round(((totals[p.id] || 0) - p.spent) / p.budget * 100) : 0,
  }))
  return ok(result)
})

export const POST = withAuth(async ({ supabase, body }) => {
  const parsed = ProjectCreate.parse(body)
  const { data, error } = await supabase.from('projects').insert(parsed).select().single()
  if (error) return badRequest(error.message)
  return created(data)
}, ProjectCreate)