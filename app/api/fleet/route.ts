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
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')

    let query = supabase
      .from('fleet_vehicles')
      .select('*')
      .order('created_at', { ascending: false })

    if (status) query = query.eq('status', status)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data, total: data?.length || 0 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase()
    const body = await req.json()

    if (!body.name) {
      return NextResponse.json({ error: 'Le nom est obligatoire' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('fleet_vehicles')
      .insert([{
        name: body.name,
        license_plate: body.license_plate || null,
        brand: body.brand || null,
        model: body.model || null,
        year: body.year || null,
        fuel_type: body.fuel_type || null,
        mileage: body.mileage || 0,
        status: body.status || 'active',
        user_id: body.user_id || '00000000-0000-0000-0000-000000000000'
      }])
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
