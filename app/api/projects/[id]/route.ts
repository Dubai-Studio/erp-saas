import { withAuth, ok, notFound, badRequest } from '@/lib/api-helpers'
import { ProjectCreate } from '@/lib/schemas'
import { z } from 'zod'

const ProjectUpdate = ProjectCreate.partial()

export const GET = withAuth(async ({ supabase, params }) => {
  const id = params.id
  const { data, error } = await supabase
    .from('projects')
    .select('*, clients(name)')
    .eq('id', id)
    .maybeSingle()
  if (error) return badRequest(error.message)
  if (!data) return notFound('Projet introuvable')

  // Cross-module : CA du projet
  const { data: invs } = await supabase
    .from('invoices')
    .select('total_amount, status')
    .eq('project_id', id)
  const paidRevenue = (invs ?? []).filter((i: any) => i.status === 'paid').reduce((s: number, i: any) => s + Number(i.total_amount || 0), 0)
  const pendingRevenue = (invs ?? []).filter((i: any) => ['sent', 'pending', 'overdue'].includes(i.status || '')).reduce((s: number, i: any) => s + Number(i.total_amount || 0), 0)

  // Cross-module : temps passé
  const { data: time } = await supabase
    .from('time_entries')
    .select('hours_worked, hourly_rate, amount')
    .eq('project_id', id)
  const totalHours = (time ?? []).reduce((s: number, t: any) => s + Number(t.hours_worked || 0), 0)
  const totalCost  = (time ?? []).reduce((s: number, t: any) => s + Number(t.amount || 0), 0)

  return ok({
    ...data,
    paid_revenue: Math.round(paidRevenue),
    pending_revenue: Math.round(pendingRevenue),
    total_hours: totalHours,
    total_labor_cost: Math.round(totalCost),
    margin_pct: data.budget > 0 ? Math.round(((paidRevenue - (data.spent || 0)) / data.budget) * 100) : 0,
  })
})

export const PATCH = withAuth(async ({ supabase, params, body }) => {
  const id = params.id
  const updates = ProjectUpdate.parse(body)
  if (Object.keys(updates).length === 0) return badRequest('Aucun champ à modifier')

  const { data, error } = await supabase
    .from('projects')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) return badRequest(error.message)
  return ok(data)
}, ProjectUpdate)

export const DELETE = withAuth(async ({ supabase, params }) => {
  const id = params.id
  const { error } = await supabase.from('projects').delete().eq('id', id)
  if (error) return badRequest(error.message)
  return ok({ deleted: true })
})