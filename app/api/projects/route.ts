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
      .from('projects')
      .select('*, clients(name)')
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
      .from('projects')
      .insert([{
        name: body.name,
        description: body.description || null,
        client_id: body.client_id || null,
        start_date: body.start_date || null,
        end_date: body.end_date || null,
        budget: body.budget || null,
        status: body.status || 'active',
        progress: body.progress || 0,
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
