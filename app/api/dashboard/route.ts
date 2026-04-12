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

    const [clients, invoices, projects, employees, stock, expenses] = await Promise.all([
      supabase.from('clients').select('*'),
      supabase.from('invoices').select('*'),
      supabase.from('projects').select('*'),
      supabase.from('employees').select('*'),
      supabase.from('stock_items').select('*'),
      supabase.from('expenses').select('*')
    ])

    const totalRevenue = invoices.data
      ?.filter(i => i.status === 'paid')
      .reduce((sum, i) => sum + (parseFloat(i.total_amount) || 0), 0) || 0

    const pendingRevenue = invoices.data
      ?.filter(i => i.status === 'sent' || i.status === 'overdue')
      .reduce((sum, i) => sum + (parseFloat(i.total_amount) || 0), 0) || 0

    const totalExpenses = expenses.data
      ?.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0) || 0

    const lowStock = stock.data
      ?.filter(s => s.quantity <= s.min_quantity).length || 0

    return NextResponse.json({
      clients: {
        total: clients.data?.length || 0,
        active: clients.data?.filter(c => c.status === 'active').length || 0
      },
      invoices: {
        total: invoices.data?.length || 0,
        paid: invoices.data?.filter(i => i.status === 'paid').length || 0,
        pending: invoices.data?.filter(i => i.status === 'sent').length || 0,
        overdue: invoices.data?.filter(i => i.status === 'overdue').length || 0
      },
      revenue: {
        total: totalRevenue,
        pending: pendingRevenue
      },
      projects: {
        total: projects.data?.length || 0,
        active: projects.data?.filter(p => p.status === 'active').length || 0
      },
      employees: {
        total: employees.data?.length || 0,
        active: employees.data?.filter(e => e.status === 'active').length || 0
      },
      stock: {
        total: stock.data?.length || 0,
        low_stock: lowStock
      },
      expenses: {
        total: totalExpenses
      }
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
