// app/api/dashboard/route.ts
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
      clients, invoices, externalInvoices, projects,
      employees, stock, fleetExpenses, payAdj, fleetVehicles,
    ] = await Promise.all([
      supabase.from('clients').select('id, status'),
      supabase.from('invoices').select('id, status, total_amount, issue_date, created_at'),
      supabase.from('external_invoices').select('id, status, amount_ht, total_amount, category, issue_date, created_at'),
      supabase.from('projects').select('id, status, budget, spent'),
      supabase.from('employees').select('id, status, salary'),
      supabase.from('stock_items').select('id, quantity, min_quantity, unit_price, purchase_price, selling_price'),
      supabase.from('fleet_expenses').select('id, amount, date, type, vehicle_id'),
      supabase.from('pay_adjustments').select('id, employee_id, amount, type, date, month'),
      supabase.from('fleet_vehicles').select('id, status, brand, model'),
    ])

    // ── Revenus ──
    const allInvoices   = invoices.data ?? []
    const paidInvoices  = allInvoices.filter(i => i.status === 'paid')
    const totalRevenue  = paidInvoices.reduce((s, i) => s + (parseFloat(i.total_amount) || 0), 0)
    const pendingRev    = allInvoices.filter(i => ['sent','pending','overdue'].includes(i.status))
                           .reduce((s, i) => s + (parseFloat(i.total_amount) || 0), 0)

    // ── Fournisseurs ──
    const allExtInv          = externalInvoices.data ?? []
    const extPaid            = allExtInv.filter(e => e.status === 'paid')
    const totalExtPaid       = extPaid.reduce((s, e) => s + (parseFloat(e.total_amount) || 0), 0)
    const totalExtPending    = allExtInv.filter(e => e.status === 'pending')
                                .reduce((s, e) => s + (parseFloat(e.total_amount) || 0), 0)
    const totalExtAll        = allExtInv.reduce((s, e) => s + (parseFloat(e.total_amount) || 0), 0)
    const extByCategory: Record<string, number> = {}
    allExtInv.forEach(e => {
      const cat = e.category || 'Autre'
      extByCategory[cat] = (extByCategory[cat] || 0) + (parseFloat(e.total_amount) || 0)
    })

    // ── Flotte ──
    const allFleetExp        = fleetExpenses.data ?? []
    const totalFleet         = allFleetExp.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0)
    const fleetByType: Record<string, number> = {}
    allFleetExp.forEach(e => {
      const t = e.type || 'autre'
      fleetByType[t] = (fleetByType[t] || 0) + (parseFloat(e.amount) || 0)
    })

    // ── RH ──
    const allEmps       = employees.data ?? []
    const activeEmps    = allEmps.filter(e => e.status === 'actif' || e.status === 'active')
    const masseSalariale = activeEmps.reduce((s, e) => s + (parseFloat(e.salary) || 0), 0)
    const allAdj        = payAdj.data ?? []
    const nowMonth      = new Date().toISOString().slice(0, 7)

    // Séparer salaires et autres ajustements
    const salairesVerses    = allAdj.filter(a => a.type === 'salaire')
    const autresAdj         = allAdj.filter(a => a.type !== 'salaire')
    const totalSalaires     = salairesVerses.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0)
    const totalAutresAdj    = autresAdj.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0)
    const totalRH           = totalSalaires + totalAutresAdj

    const adjThisMonth      = allAdj
      .filter(a => (a.month || a.date || '').startsWith(nowMonth))
      .reduce((s, a) => s + (parseFloat(a.amount) || 0), 0)

    // ── Stock ──
    const allStock      = stock.data ?? []
    const lowStock      = allStock.filter(s => (s.quantity || 0) <= (s.min_quantity || 0) && s.min_quantity > 0).length
    const outOfStock    = allStock.filter(s => (s.quantity || 0) <= 0).length
    const totalStockVal = allStock.reduce((s, i) => {
      const price = parseFloat(i.purchase_price) || parseFloat(i.unit_price) || 0
      return s + (parseFloat(i.quantity) || 0) * price
    }, 0)
    const totalStockSell = allStock.reduce((s, i) => {
      return s + (parseFloat(i.quantity) || 0) * (parseFloat(i.selling_price) || 0)
    }, 0)

    // ── Total dépenses ──
    const totalDepenses = totalExtAll + totalFleet + totalRH

    // ── Résultat net ──
    const resultatNet = totalRevenue - totalDepenses

    // ── Données mensuelles (12 mois) ──
    const now = new Date()
    type MonthEntry = {
      revenus: number
      fournisseurs: number
      flotte: number
      salaires: number
      ajustements: number
      depenses: number
    }
    const monthlyData: Record<string, MonthEntry> = {}
    for (let i = 11; i >= 0; i--) {
      const d   = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = d.toISOString().slice(0, 7)
      monthlyData[key] = { revenus: 0, fournisseurs: 0, flotte: 0, salaires: 0, ajustements: 0, depenses: 0 }
    }

    // Revenus
    allInvoices.filter(i => i.status === 'paid').forEach(i => {
      const key = (i.issue_date || i.created_at || '').slice(0, 7)
      if (monthlyData[key]) monthlyData[key].revenus += parseFloat(i.total_amount) || 0
    })

    // Fournisseurs
    allExtInv.forEach(e => {
      const key = (e.issue_date || e.created_at || '').slice(0, 7)
      if (monthlyData[key]) {
        monthlyData[key].fournisseurs += parseFloat(e.total_amount) || 0
        monthlyData[key].depenses     += parseFloat(e.total_amount) || 0
      }
    })

    // Flotte
    allFleetExp.forEach(e => {
      const key = (e.date || '').slice(0, 7)
      if (monthlyData[key]) {
        monthlyData[key].flotte   += parseFloat(e.amount) || 0
        monthlyData[key].depenses += parseFloat(e.amount) || 0
      }
    })

    // Salaires versés (type === 'salaire')
    salairesVerses.forEach(a => {
      const key = (a.month || a.date || '').slice(0, 7)
      if (monthlyData[key]) {
        monthlyData[key].salaires += parseFloat(a.amount) || 0
        monthlyData[key].depenses += parseFloat(a.amount) || 0
      }
    })

    // Autres ajustements (primes, avances…)
    autresAdj.forEach(a => {
      const key = (a.month || a.date || '').slice(0, 7)
      if (monthlyData[key]) {
        monthlyData[key].ajustements += parseFloat(a.amount) || 0
        monthlyData[key].depenses    += parseFloat(a.amount) || 0
      }
    })

    const MONTHS_FR = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']
    const chartData = Object.entries(monthlyData).map(([k, v]) => {
      const d = new Date(k + '-01')
      return {
        month:        MONTHS_FR[d.getMonth()],
        year:         d.getFullYear(),
        key:          k,
        revenus:      Math.round(v.revenus),
        fournisseurs: Math.round(v.fournisseurs),
        flotte:       Math.round(v.flotte),
        salaires:     Math.round(v.salaires),
        ajustements:  Math.round(v.ajustements),
        depenses:     Math.round(v.depenses),
        resultat:     Math.round(v.revenus - v.depenses),
      }
    })

    return NextResponse.json({
      clients:   { total: allEmps.length, active: clients.data?.filter(c => c.status === 'active').length || 0, total_clients: clients.data?.length || 0 },
      invoices:  { total: allInvoices.length, paid: paidInvoices.length, pending: allInvoices.filter(i => i.status === 'sent' || i.status === 'pending').length, overdue: allInvoices.filter(i => i.status === 'overdue').length },
      revenue:   { total: Math.round(totalRevenue), pending: Math.round(pendingRev) },
      depenses: {
        fournisseurs_total:   Math.round(totalExtAll),
        fournisseurs_paid:    Math.round(totalExtPaid),
        fournisseurs_pending: Math.round(totalExtPending),
        flotte:               Math.round(totalFleet),
        flotte_by_type:       Object.fromEntries(Object.entries(fleetByType).map(([k, v]) => [k, Math.round(v)])),
        rh_salaires:          Math.round(totalSalaires),
        rh_ajustements:       Math.round(totalAutresAdj),
        rh_total:             Math.round(totalRH),
        total:                Math.round(totalDepenses),
        by_category:          Object.fromEntries(Object.entries(extByCategory).map(([k, v]) => [k, Math.round(v)])),
      },
      projects:  { total: projects.data?.length || 0, active: projects.data?.filter(p => p.status === 'active').length || 0, budget_total: projects.data?.reduce((s, p) => s + (parseFloat(p.budget) || 0), 0) || 0 },
      employees: { total: allEmps.length, active: activeEmps.length },
      fleet:     { total: fleetVehicles.data?.length || 0, active: fleetVehicles.data?.filter(v => v.status === 'actif').length || 0 },
      stock:     { total: allStock.length, low_stock: lowStock, out_of_stock: outOfStock, total_value: Math.round(totalStockVal), total_sell_value: Math.round(totalStockSell) },
      rh: {
        masse_salariale:   Math.round(masseSalariale),
        masse_annuelle:    Math.round(masseSalariale * 12),
        salaires_verses:   Math.round(totalSalaires),
        adj_this_month:    Math.round(adjThisMonth),
        total_ajustements: Math.round(totalAutresAdj),
        total_personnel:   Math.round(totalRH),
        nb_employes:       activeEmps.length,
      },
      resultat_net:      Math.round(resultatNet),
      chart_data:        chartData,
      external_invoices: { total: allExtInv.length, paid: extPaid.length },
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erreur serveur'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
