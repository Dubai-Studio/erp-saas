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
    const search = searchParams.get('search')

    let query = supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false })

    if (status) query = query.eq('status', status)
    if (search) query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`)

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
      .from('clients')
      .insert([{
        name: body.name,
        email: body.email || null,
        phone: body.phone || null,
        address: body.address || null,
        city: body.city || null,
        country: body.country || 'Belgique',
        vat_number: body.vat_number || null,
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
