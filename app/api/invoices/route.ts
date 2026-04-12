import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function GET(req: NextRequest) {
  const supabase = sb()
  const { searchParams } = new URL(req.url)
  const status     = searchParams.get('status')
  const client_id  = searchParams.get('client_id')
  const project_id = searchParams.get('project_id')

  let query = supabase
    .from('invoices')
    .select('*')
    .order('created_at', { ascending: false })

  if (status)     query = query.eq('status', status)
  if (client_id)  query = query.eq('client_id', client_id)
  if (project_id) query = query.eq('project_id', project_id)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data || [] })
}

export async function POST(req: NextRequest) {
  const supabase = sb()
  const body = await req.json()

  const insert: Record<string, unknown> = {
    ...body,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  // Sérialiser les lignes en JSON si nécessaire
  if (insert.lines && typeof insert.lines !== 'string') {
    insert.lines = JSON.stringify(insert.lines)
  }

  const { data, error } = await supabase
    .from('invoices')
    .insert(insert)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
