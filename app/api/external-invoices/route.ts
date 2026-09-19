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

export const POST = withAuth(async ({ supabase, body }) => {
  const parsed = ExternalInvoiceCreate.parse(body)
  const { data, error } = await supabase.from('external_invoices').insert({
    ...parsed,
    type: 'incoming',
    issue_date: parsed.issue_date || new Date().toISOString().split('T')[0],
  }).select().single()

  if (error) return badRequest(error.message)
  return created(data)
}, ExternalInvoiceCreate)

export const PATCH = withAuth(async ({ supabase, body }) => {
  const { id, ...fields } = body as any
  if (!id) return badRequest('id requis')
  const { data, error } = await supabase.from('external_invoices').update(fields).eq('id', id).select().single()
  if (error) return badRequest(error.message)
  return ok(data)
})

export const DELETE = withAuth(async ({ req, supabase }) => {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return badRequest('id requis')
  const { error } = await supabase.from('external_invoices').delete().eq('id', id)
  if (error) return badRequest(error.message)
  return ok({ deleted: true })
})