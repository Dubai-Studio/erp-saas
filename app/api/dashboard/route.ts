import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )
}

export async function GET(_req: NextRequest) {
  try {
    const supabase = getSupabase()

    const [
      clients,
      invoices,
      externalInvoices,
      projects,
      employees,
      stock,
      fleetExpenses,
      payAdj,
    ] = await Promise.all([
      supabase.from('clients').select('id, status'),
      supabase.from('invoices').select('id, status, total_amount, issue_date, created_at'),
      supabase.from('external_invoices').select('id, status, amount_ht, vat_amount, total_amount, category, issue_date, created_at'),
      supabase.from('projects').select('id, status, budget, spent'),
      supabase.from('employees').select('id, status, salary'),
      supabase.from('stock_items').select('id, quantity, min_quantity, unit_price, total_value'),
      supabase.from('fleet_expenses').select('id, amount, date, category'),
      supabase.from('pay_adjustments').select('id, employee_id, amount, type, date, month'),
    ])

    // ── Revenus (factures émises payées) ──
    const allInvoices = invoices.data ?? []
    const paidInvoices = allInvoices.filter(i => i.status === 'paid')
    const totalRevenue = paidInvoices.reduce((s, i) => s + (parseFloat(i.total_amount) || 0), 0)
    const pendingRevenue = allInvoices
      .filter(i => i.status === 'sent' || i.status === 'overdue')
      .reduce((s, i) => s + (parseFloat(i.total_amount) || 0), 0)

    // ── Dépenses fournisseurs (factures reçues) ──
    const allExtInv = externalInvoices.data ?? []
    const extPaid    = allExtInv.filter(e => e.status === 'paid')
    const totalExtPaid    = extPaid.reduce((s, e) => s + (parseFloat(e.total_amount) || 0), 0)
    const totalExtPending = allExtInv.filter(e => e.status === 'pending').reduce((s, e) => s + (parseFloat(e.total_amount) || 0), 0)
    const totalExtAll     = allExtInv.reduce((s, e) => s + (parseFloat(e.total_amount) || 0), 0)

    // Dépenses par catégorie (factures fournisseurs)
    const extByCategory: Record<string, number> = {}
    allExtInv.forEach(e => {
      const cat = e.category || 'Autre'
      extByCategory[cat] = (extByCategory[cat] || 0) + (parseFloat(e.total_amount) || 0)
    })

    // ── Dépenses flotte ──
    const allFleetExp = fleetExpenses.data ?? []
    const totalFleetExpenses = allFleetExp.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0)

    // ── Masse salariale ──
    const activeEmps = (employees.data ?? []).filter(e => e.status === 'active')
    const masseSalariale = activeEmps.reduce((s, e) => s + (parseFloat(e.salary) || 0), 0)

    // Ajustements de paie
    const allAdj = payAdj.data ?? []
    const nowMonth = new Date().toISOString().slice(0, 7)
    const adjThisMonth = allAdj
      .filter(a => (a.month || '').startsWith(nowMonth) || (a.date || '').startsWith(nowMonth))
      .reduce((s, a) => s + (parseFloat(a.amount) || 0), 0)
    const totalAdjustments = allAdj.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0)

    // ── Totaux dépenses globales ──
    const totalDepenses = totalExtAll + totalFleetExpenses + masseSalariale

    // ── Résultat net ──
    const resultatNet = totalRevenue - totalDepenses

    // ── Stock ──
    const allStock = stock.data ?? []
    const lowStock = allStock.filter(s => s.quantity <= s.min_quantity).length
    const totalStockValue = allStock.reduce((s, i) => s + (parseFloat(i.total_value) || (parseFloat(i.unit_price || '0') * i.quantity) || 0), 0)

    // ── Données mensuelles (12 derniers mois) ──
    const now = new Date()
    const monthlyData: Record<string, { revenus: number; depenses: number }> = {}
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = d.toISOString().slice(0, 7)
      monthlyData[key] = { revenus: 0, depenses: 0 }
    }

    // Revenus mensuels
    allInvoices.filter(i => i.status === 'paid').forEach(i => {
      const key = (i.issue_date || i.created_at || '').slice(0, 7)
      if (monthlyData[key]) monthlyData[key].revenus += parseFloat(i.total_amount) || 0
    })

    // Dépenses mensuelles (fournisseurs + flotte)
    allExtInv.forEach(e => {
      const key = (e.issue_date || e.created_at || '').slice(0, 7)
      if (monthlyData[key]) monthlyData[key].depenses += parseFloat(e.total_amount) || 0
    })
    allFleetExp.forEach(e => {
      const key = (e.date || '').slice(0, 7)
      if (monthlyData[key]) monthlyData[key].depenses += parseFloat(e.amount) || 0
    })

    const MONTHS_FR = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']
    const chartData = Object.entries(monthlyData).map(([k, v]) => {
      const d = new Date(k + '-01')
      return {
        month:    MONTHS_FR[d.getMonth()],
        year:     d.getFullYear(),
        revenus:  Math.round(v.revenus),
        depenses: Math.round(v.depenses),
        resultat: Math.round(v.revenus - v.depenses),
      }
    })

    return NextResponse.json({
      // Données agrégées
      clients: {
        total:  clients.data?.length || 0,
        active: clients.data?.filter(c => c.status === 'active').length || 0,
      },
      invoices: {
        total:   allInvoices.length,
        paid:    paidInvoices.length,
        pending: allInvoices.filter(i => i.status === 'sent').length,
        overdue: allInvoices.filter(i => i.status === 'overdue').length,
      },
      revenue: {
        total:   Math.round(totalRevenue),
        pending: Math.round(pendingRevenue),
      },
      depenses: {
        fournisseurs_total:   Math.round(totalExtAll),
        fournisseurs_paid:    Math.round(totalExtPaid),
        fournisseurs_pending: Math.round(totalExtPending),
        flotte:               Math.round(totalFleetExpenses),
        total:                Math.round(totalDepenses),
        by_category:          Object.fromEntries(
          Object.entries(extByCategory).map(([k, v]) => [k, Math.round(v)])
        ),
      },
      projects: {
        total:  projects.data?.length || 0,
        active: projects.data?.filter(p => p.status === 'active').length || 0,
      },
      employees: {
        total:  employees.data?.length || 0,
        active: activeEmps.length,
      },
      stock: {
        total:       allStock.length,
        low_stock:   lowStock,
        total_value: Math.round(totalStockValue),
      },
      rh: {
        masse_salariale:   Math.round(masseSalariale),
        masse_annuelle:    Math.round(masseSalariale * 12),
        adj_this_month:    Math.round(adjThisMonth),
        total_adjustments: Math.round(totalAdjustments),
        total_personnel:   Math.round(masseSalariale + adjThisMonth),
      },
      resultat_net:      Math.round(resultatNet),
      chart_data:        chartData,
      external_invoices: {
        total: allExtInv.length,
        paid:  extPaid.length,
      },
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erreur serveur'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
