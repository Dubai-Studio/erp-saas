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
  const { data, error } = await supabase
    .from('external_invoices')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data || [] })
}

export async function POST(req: NextRequest) {
  const supabase = sb()
  const body = await req.json()
  const { data, error } = await supabase
    .from('external_invoices')
    .insert({ ...body, created_at: new Date().toISOString() })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
