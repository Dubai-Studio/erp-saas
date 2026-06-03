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
    const { searchParams } = new URL(req.url)
    const vehicleId = searchParams.get('vehicle_id')
    let query = getSupabase()
      .from('fleet_expenses')
      .select('*')
      .order('date', { ascending: false })
    if (vehicleId) query = query.eq('vehicle_id', vehicleId)
    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur serveur' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (!body.vehicle_id)  return NextResponse.json({ error: 'vehicle_id requis' },  { status: 400 })
    if (!body.amount || Number(body.amount) <= 0)
      return NextResponse.json({ error: 'amount requis et doit être > 0' }, { status: 400 })

    const { data, error } = await getSupabase()
      .from('fleet_expenses')
      .insert([{
        vehicle_id:   body.vehicle_id,
        vehicle_name: body.vehicle_name  ?? null,
        plate:        body.plate         ?? null,
        type:         body.type          ?? 'fuel',
        amount:       Number(body.amount),
        vat_rate:     Number(body.vat_rate)  ?? 21,
        description:  body.description  ?? null,
        date:         body.date          ?? new Date().toISOString().split('T')[0],
        km:           body.km            ? Number(body.km)  : null,
        invoice_ref:  body.invoice_ref   ?? null,
      }])
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur serveur' }, { status: 500 })
  }
}
