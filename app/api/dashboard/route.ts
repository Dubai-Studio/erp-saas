import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabase()

    const [clients, invoices, projects, employees, stock, expenses, payAdj] = await Promise.all([
      supabase.from('clients').select('id, status'),
      supabase.from('invoices').select('status, total_amount'),
      supabase.from('projects').select('id, status'),
      supabase.from('employees').select('id, status, salary'),
      supabase.from('stock_items').select('id, quantity, min_quantity'),
      supabase.from('expenses').select('amount'),
      supabase.from('pay_adjustments').select('amount, type, date, month'),
    ])

    const totalRevenue = invoices.data
      ?.filter(i => i.status === 'paid')
      .reduce((s, i) => s + (parseFloat(i.total_amount) || 0), 0) || 0

    const pendingRevenue = invoices.data
      ?.filter(i => i.status === 'sent' || i.status === 'overdue')
      .reduce((s, i) => s + (parseFloat(i.total_amount) || 0), 0) || 0

    const totalExpenses = expenses.data
      ?.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0) || 0

    const lowStock = stock.data
      ?.filter(s => s.quantity <= s.min_quantity).length || 0

    // ── RH ──
    const activeEmps = employees.data?.filter(e => e.status === 'active') ?? []
    const masseSalariale = activeEmps.reduce((s, e) => s + (parseFloat(e.salary) || 0), 0)

    // Total versé au personnel : salaires + ajustements positifs (bonus, corrections +)
    const totalAdjustments = payAdj.data?.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0) || 0

    // Mois en cours
    const nowMonth = new Date().toISOString().slice(0, 7) // "2026-04"
    const adjThisMonth = payAdj.data
      ?.filter(a => (a.month || '').startsWith(nowMonth) || (a.date || '').startsWith(nowMonth))
      .reduce((s, a) => s + (parseFloat(a.amount) || 0), 0) || 0

    // Net financier = revenus encaissés - masse salariale mensuelle - dépenses flotte
    const netFinancier = totalRevenue - masseSalariale - totalExpenses

    return NextResponse.json({
      clients: {
        total:  clients.data?.length || 0,
        active: clients.data?.filter(c => c.status === 'active').length || 0,
      },
      invoices: {
        total:   invoices.data?.length || 0,
        paid:    invoices.data?.filter(i => i.status === 'paid').length || 0,
        pending: invoices.data?.filter(i => i.status === 'sent').length || 0,
        overdue: invoices.data?.filter(i => i.status === 'overdue').length || 0,
      },
      revenue: {
        total:   totalRevenue,
        pending: pendingRevenue,
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
        total:     stock.data?.length || 0,
        low_stock: lowStock,
      },
      expenses: {
        total: totalExpenses,
      },
      rh: {
        masse_salariale:    masseSalariale,
        masse_annuelle:     masseSalariale * 12,
        total_adjustments:  totalAdjustments,
        adj_this_month:     adjThisMonth,
        total_personnel:    masseSalariale + adjThisMonth,
        net_financier:      netFinancier,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
