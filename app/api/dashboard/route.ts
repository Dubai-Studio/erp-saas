import { NextRequest } from 'next/server'
import { withAuth, ok, badRequest } from '@/lib/api-helpers'
import { computeInvoiceTotals, currentMonth, daysBetween, groupSum, pctChange, round2, stockStatus, stockValueAtPurchase, stockValueAtSale, sumBy, topN } from '@/lib/calculations'

/**
 * GET /api/dashboard
 * Calcule les KPI du tenant connecté uniquement.
 * Retourne la forme DashboardKPIs du fichier lib/types.ts.
 */
export const GET = withAuth(async ({ req, supabase }) => {
  const { searchParams } = new URL(req.url)
  const period = searchParams.get('period') || '12m' // 3m, 6m, 12m, ytd

  const periodMonths = period === '3m' ? 3 : period === '6m' ? 6 : period === 'ytd' ? new Date().getMonth() + 1 : 12

  const now = new Date()
  const startPeriod = new Date(now.getFullYear(), now.getMonth() - periodMonths + 1, 1).toISOString().split('T')[0]
  const startPrev   = new Date(now.getFullYear(), now.getMonth() - periodMonths * 2 + 1, 1).toISOString().split('T')[0]

  const [
    invoicesR, externalInvoicesR, clientsR, projectsR,
    employeesR, stockR, fleetExpR, payAdjR, fleetR, expensesR,
  ] = await Promise.all([
    supabase.from('invoices').select('id, status, total_amount, issue_date, due_date, paid_at, created_at, client_id'),
    supabase.from('external_invoices').select('id, status, total_amount, amount_ht, category, issue_date, created_at'),
    supabase.from('clients').select('id, name, status, created_at'),
    supabase.from('projects').select('id, status, budget, spent'),
    supabase.from('employees').select('id, status, salary, hire_date, contract_type'),
    supabase.from('stock_items').select('id, quantity, min_quantity, unit_price, purchase_price, selling_price'),
    supabase.from('fleet_expenses').select('id, amount, date, type, vehicle_id'),
    supabase.from('pay_adjustments').select('id, employee_id, amount, type, date, month'),
    supabase.from('fleet_vehicles').select('id, status, brand, model, mileage, insurance_expiry, control_expiry'),
    supabase.from('expenses').select('id, amount, category, date, month'),
  ])

  const invoices         = (invoicesR.data ?? []) as any[]
  const externalInvoices = (externalInvoicesR.data ?? []) as any[]
  const clients          = (clientsR.data ?? []) as any[]
  const projects         = (projectsR.data ?? []) as any[]
  const employees        = (employeesR.data ?? []) as any[]
  const stock            = (stockR.data ?? []) as any[]
  const fleetExp         = (fleetExpR.data ?? []) as any[]
  const payAdj           = (payAdjR.data ?? []) as any[]
  const fleet            = (fleetR.data ?? []) as any[]
  const expenses         = (expensesR.data ?? []) as any[]

  // ── Revenus ──────────────────────────────────────────────────────────────
  const nowMonth = currentMonth()
  const paid    = invoices.filter((i: any) => i.status === 'paid')
  const pending = invoices.filter((i: any) => ['sent', 'pending'].includes(i.status))
  const overdue = invoices.filter((i: any) => i.status === 'overdue')

  const totalRevenue       = sumBy(paid, (i: any) => Number(i.total_amount))
  const pendingRevenue     = sumBy(pending, (i: any) => Number(i.total_amount))
  const overdueRevenue     = sumBy(overdue, (i: any) => Number(i.total_amount))
  const revenueThisMonth   = sumBy(paid.filter((i: any) => (i.issue_date || i.created_at || '').slice(0, 7) === nowMonth), (i: any) => Number(i.total_amount))
  const revenuePrevPeriod  = sumBy(paid.filter((i: any) => (i.issue_date || '') >= startPrev && (i.issue_date || '') < startPeriod), (i: any) => Number(i.total_amount))
  const revenueGrowthPct   = pctChange(totalRevenue, revenuePrevPeriod)

  // Délai moyen de paiement (jours entre issue_date et paid_at)
  const paymentDelays = paid.filter((i: any) => i.issue_date && i.paid_at).map((i: any) => daysBetween(i.paid_at, i.issue_date))
  const avgPaymentDays = paymentDelays.length ? Math.round(paymentDelays.reduce((a: number, b: number) => a + b, 0) / paymentDelays.length) : 0

  // ── Dépenses ─────────────────────────────────────────────────────────────
  const totalExtInvoices = sumBy(externalInvoices, (e: any) => Number(e.total_amount))
  const totalFleetExp    = sumBy(fleetExp, (e: any) => Number(e.amount))
  const totalExpenses    = sumBy(expenses, (e: any) => Number(e.amount))
  const totalPayroll     = sumBy(payAdj, (a: any) => Number(a.amount))

  const totalDepenses = totalExtInvoices + totalFleetExp + totalPayroll + totalExpenses
  const expensesByCategory = groupSum(externalInvoices, (e: any) => e.category || 'Autre', (e: any) => Number(e.total_amount))
  // Fusion avec les autres sources
  for (const e of expenses) {
    const k = e.category || 'Autre'
    expensesByCategory[k] = round2((expensesByCategory[k] || 0) + Number(e.amount || 0))
  }
  for (const e of fleetExp) {
    const k = e.type || 'autre'
    expensesByCategory[`flotte:${k}`] = round2((expensesByCategory[`flotte:${k}`] || 0) + Number(e.amount || 0))
  }
  const expensesThisMonth = sumBy([
    ...externalInvoices.filter((e: any) => (e.issue_date || '').slice(0, 7) === nowMonth),
    ...fleetExp.filter((e: any) => (e.date || '').slice(0, 7) === nowMonth),
    ...expenses.filter((e: any) => (e.month || e.date || '').slice(0, 7) === nowMonth),
    ...payAdj.filter((a: any) => (a.month || a.date || '').slice(0, 7) === nowMonth),
  ], (x: any) => Number(x.total_amount ?? x.amount ?? 0))

  const expensesPrev = sumBy([
    ...externalInvoices.filter((e: any) => (e.issue_date || '') >= startPrev && (e.issue_date || '') < startPeriod),
    ...fleetExp.filter((e: any) => (e.date || '') >= startPrev && (e.date || '') < startPeriod),
    ...expenses.filter((e: any) => (e.month || e.date || '') >= startPrev && (e.month || e.date || '') < startPeriod),
  ], (x: any) => Number(x.total_amount ?? x.amount ?? 0))
  const expensesGrowthPct = pctChange(expensesThisMonth, expensesPrev)

  // ── Marge nette ──────────────────────────────────────────────────────────
  const netMargin  = round2(totalRevenue - totalDepenses)
  const marginPct  = totalRevenue > 0 ? round2((netMargin / totalRevenue) * 100) : 0

  // ── Cashflow + Runway ────────────────────────────────────────────────────────
  // cashOnHand  = total des factures payées - total des dépenses payées (toutes périodes)
  // monthlyBurn = moyenne des dépenses des 3 derniers mois
  // runway      = cashOnHand / monthlyBurn, en mois
  const cashIn  = totalRevenue
  const cashOut = totalDepenses
  const cashOnHand = totalRevenue - totalDepenses

  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().slice(0, 10)
  const last3Months = sumBy([
    ...externalInvoices.filter((e: any) => (e.issue_date || '') >= threeMonthsAgo),
    ...fleetExp.filter((e: any) => (e.date || '') >= threeMonthsAgo),
    ...expenses.filter((e: any) => (e.month || e.date || '') >= threeMonthsAgo),
    ...payAdj.filter((a: any) => (a.month || a.date || '') >= threeMonthsAgo),
  ], (x: any) => Number(x.total_amount ?? x.amount ?? 0))
  const monthlyBurn = last3Months / 3

  // Runway en mois : cashOnHand / monthlyBurn.
  // - Si pas de cash positif → 0 mois
  // - Si pas de dépenses (burn=0) → 999+ (illimité)
  let cashRunway: number
  if (cashOnHand <= 0)        cashRunway = 0
  else if (monthlyBurn <= 0)  cashRunway = 999
  else                        cashRunway = round2(cashOnHand / monthlyBurn)

  // ── Clients ────────────────────────────────────────────────────────────────────────────────
  const activeClients = clients.filter((c: any) => c.status === 'active').length
  const newClientsThisMonth = clients.filter((c: any) => (c.created_at || '').slice(0, 7) === nowMonth).length
  const lostClients = clients.filter((c: any) => c.status === 'inactive' || c.status === 'archived').length
  const churnRate = clients.length > 0 ? round2((lostClients / clients.length) * 100) : 0

  // ── Top clients ─────────────────────────────────────────────────────────────────────────────
  const revenueByClient: Record<string, { name: string; revenue: number; count: number }> = {}
  for (const inv of paid) {
    if (!inv.client_id) continue
    if (!revenueByClient[inv.client_id]) {
      const c = clients.find((c: any) => c.id === inv.client_id)
      revenueByClient[inv.client_id] = { name: c?.name || 'Inconnu', revenue: 0, count: 0 }
    }
    revenueByClient[inv.client_id].revenue += Number(inv.total_amount || 0)
    revenueByClient[inv.client_id].count += 1
  }
  const topClients = topN(Object.values(revenueByClient), 5, (c: any) => c.revenue)
    .map((c: any, idx: number) => ({ id: Object.keys(revenueByClient)[idx], ...c }))

  // ── Top expenses ────────────────────────────────────────────────────────────────────────────
  const topExpenses = Object.entries(expensesByCategory)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6)

  // ── Stock ────────────────────────────────────────────────────────────────────────────────────
  const lowStock = stock.filter((s: any) => stockStatus(s) === 'low_stock').length
  const outOfStock = stock.filter((s: any) => stockStatus(s) === 'out_of_stock').length
  const totalStockValue = stockValueAtPurchase(stock)
  const totalStockSell  = stockValueAtSale(stock)

  // ── Flotte ───────────────────────────────────────────────────────────────────────────────────
  const activeFleet = fleet.filter((v: any) => v.status === 'actif').length
  const totalKm = sumBy(fleet, (v: any) => Number(v.mileage || 0))
  const costPerKm = totalKm > 0 ? round2(totalFleetExp / totalKm) : 0
  const maintenanceDue = fleet.filter((v: any) => {
    if (!v.control_expiry) return false
    const days = daysBetween(v.control_expiry, new Date().toISOString().slice(0, 10))
    return days <= 30
  }).length
  const insuranceDue = fleet.filter((v: any) => {
    if (!v.insurance_expiry) return false
    const days = daysBetween(v.insurance_expiry, new Date().toISOString().slice(0, 10))
    return days <= 30
  }).length

  // ── Masse salariale ──────────────────────────────────────────────────────────────────────────
  const activeEmployees = employees.filter((e: any) => e.status === 'active')
  const monthlyPayroll = sumBy(activeEmployees, (e: any) => Number(e.salary || 0))

  // ── Projets ──────────────────────────────────────────────────────────────────────────────────
  const activeProjects = projects.filter((p: any) => p.status === 'active').length
  const totalBudget = sumBy(projects, (p: any) => Number(p.budget))
  const totalSpent  = sumBy(projects, (p: any) => Number(p.spent))
  const projectsMargin = totalBudget > 0 ? round2(((totalBudget - totalSpent) / totalBudget) * 100) : 0

  // ── Charts ───────────────────────────────────────────────────────────────────────────────────
  const monthlyData: Record<string, { revenus: number; depenses: number }> = {}
  for (let i = periodMonths - 1; i >= 0; i--) {
    const d   = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = d.toISOString().slice(0, 7)
    monthlyData[key] = { revenus: 0, depenses: 0 }
  }

  for (const i of paid) {
    const k = (i.issue_date || i.created_at || '').slice(0, 7)
    if (monthlyData[k]) monthlyData[k].revenus += Number(i.total_amount || 0)
  }
  for (const e of externalInvoices) {
    const k = (e.issue_date || e.created_at || '').slice(0, 7)
    if (monthlyData[k]) monthlyData[k].depenses += Number(e.total_amount || 0)
  }
  for (const e of expenses) {
    const k = (e.month || e.date || '').slice(0, 7)
    if (monthlyData[k]) monthlyData[k].depenses += Number(e.amount || 0)
  }
  for (const e of fleetExp) {
    const k = (e.date || '').slice(0, 7)
    if (monthlyData[k]) monthlyData[k].depenses += Number(e.amount || 0)
  }
  for (const a of payAdj) {
    const k = (a.month || a.date || '').slice(0, 7)
    if (monthlyData[k]) monthlyData[k].depenses += Number(a.amount || 0)
  }

  const MONTHS_FR = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']
  const chartRevenueVsExpenses = Object.entries(monthlyData).map(([k, v]) => {
    const d = new Date(k + '-01')
    return {
      month:   MONTHS_FR[d.getMonth()],
      year:    d.getFullYear(),
      key:     k,
      revenus: Math.round(v.revenus),
      depenses: Math.round(v.depenses),
      marge:   Math.round(v.revenus - v.depenses),
    }
  })

  const chartCashflow = Object.entries(monthlyData).map(([k, v]) => ({
    month:   MONTHS_FR[parseInt(k.split('-')[1]) - 1],
    key:     k,
    inflow:  Math.round(v.revenus),
    outflow: Math.round(v.depenses),
    net:     Math.round(v.revenus - v.depenses),
  }))

  // Acquisition clients par mois
  const acquisition: Record<string, { new: number; lost: number }> = {}
  for (let i = periodMonths - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    acquisition[d.toISOString().slice(0, 7)] = { new: 0, lost: 0 }
  }
  for (const c of clients) {
    const k = (c.created_at || '').slice(0, 7)
    if (acquisition[k]) {
      if (c.status === 'active' || c.status === 'prospect') acquisition[k].new++
      else acquisition[k].lost++
    }
  }
  const chartClientsAcquisition = Object.entries(acquisition).map(([k, v]) => ({
    month: MONTHS_FR[parseInt(k.split('-')[1]) - 1],
    key: k,
    new: v.new,
    lost: v.lost,
  }))

  // Aging des factures en attente
  const today = new Date().toISOString().slice(0, 10)
  const aging = { '0-30j': { amount: 0, count: 0 }, '31-60j': { amount: 0, count: 0 }, '61-90j': { amount: 0, count: 0 }, '90j+': { amount: 0, count: 0 } }
  for (const i of [...pending, ...overdue]) {
    if (!i.due_date) continue
    const days = daysBetween(today, i.due_date)
    const amt = Number(i.total_amount || 0)
    if (days > 0)         aging['0-30j'].amount += amt, aging['0-30j'].count++
    else if (days > -30)  aging['31-60j'].amount += amt, aging['31-60j'].count++
    else if (days > -60)  aging['61-90j'].amount += amt, aging['61-90j'].count++
    else                  aging['90j+'].amount += amt, aging['90j+'].count++
  }
  const chartInvoiceAging = Object.entries(aging).map(([bucket, v]) => ({
    bucket, amount: Math.round(v.amount), count: v.count,
  }))

  // ── Alertes ──────────────────────────────────────────────────────────────────────────────────
  const alerts: any[] = []
  if (outOfStock > 0) alerts.push({ severity: 'critical', title: `${outOfStock} article(s) en rupture`, detail: 'Réapprovisionner rapidement', href: '/dashboard/stock?status=out_of_stock' })
  if (lowStock > 0)   alerts.push({ severity: 'warning',  title: `${lowStock} article(s) en stock faible`, href: '/dashboard/stock?status=low_stock' })
  if (overdueRevenue > 0) alerts.push({ severity: 'critical', title: `${overdueRevenue.toFixed(0)} € en retard de paiement`, detail: `${overdue.length} facture(s) en retard`, href: '/dashboard/invoices?status=overdue' })
  if (insuranceDue > 0) alerts.push({ severity: 'warning', title: `${insuranceDue} assurance(s) à renouveler`, href: '/dashboard/fleet' })
  if (maintenanceDue > 0) alerts.push({ severity: 'info', title: `${maintenanceDue} contrôle(s) technique(s) < 30j`, href: '/dashboard/fleet' })

  return ok({
    revenue:  { total: totalRevenue, pending: pendingRevenue, overdue: overdueRevenue, thisMonth: revenueThisMonth, growthPct: revenueGrowthPct },
    expenses: { total: totalDepenses, byCategory: expensesByCategory, thisMonth: expensesThisMonth, growthPct: expensesGrowthPct },
    margin:   { net: netMargin, marginPct },
    clients:  { total: clients.length, active: activeClients, new_this_month: newClientsThisMonth, churn_rate_pct: churnRate },
    invoices: { total: invoices.length, paid: paid.length, pending: pending.length, overdue: overdue.length, avg_payment_days: avgPaymentDays },
    projects: { total: projects.length, active: activeProjects, budget_total: totalBudget, spent_total: totalSpent, margin_pct: projectsMargin },
    employees:{ total: employees.length, active: activeEmployees.length, payroll_month: monthlyPayroll, payroll_annual: round2(monthlyPayroll * 12) },
    fleet:    { total: fleet.length, active: activeFleet, total_km: totalKm, cost_per_km: costPerKm, maintenance_due: maintenanceDue, insurance_due: insuranceDue },
    stock:    { total: stock.length, low_stock: lowStock, out_of_stock: outOfStock, total_value: totalStockValue, total_sell_value: totalStockSell, rotation_days: 0 },
    cashflow: { inflow: cashIn, outflow: cashOut, net: netMargin, runway_months: cashRunway },
    top_clients:  topClients,
    top_expenses: topExpenses,
    alerts,
    chart_revenue_vs_expenses: chartRevenueVsExpenses,
    chart_cashflow:             chartCashflow,
    chart_top_categories:       topExpenses,
    chart_clients_acquisition:  chartClientsAcquisition,
    chart_invoice_aging:        chartInvoiceAging,
  })
})