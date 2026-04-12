import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = sb()
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', params.id)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = sb()
  const body = await req.json()

  const update: Record<string, unknown> = {
    ...body,
    updated_at: new Date().toISOString(),
  }

  if (update.lines && typeof update.lines !== 'string') {
    update.lines = JSON.stringify(update.lines)
  }

  const { data, error } = await supabase
    .from('invoices')
    .update(update)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = sb()
  const { error } = await supabase
    .from('invoices')
    .delete()
    .eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
