import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    )
    const { data, error } = await supabase.from('clients').select('*').limit(5)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, clients_count: data?.length || 0 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}