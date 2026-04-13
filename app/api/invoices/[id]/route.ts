import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
}
type Ctx = { params: Promise<{ id: string }> };
export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const { data, error } = await getSupabase().from('invoices').select('*').eq('id', id).single();
    if (error) return NextResponse.json({ error: error.message }, { status: 404 });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur' }, { status: 500 });
  }
}
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { data, error } = await getSupabase().from('invoices').update({
      status:        body.status        ?? null,
      due_date:      body.due_date      ?? null,
      payment_terms: body.payment_terms ?? null,
      lines:         body.lines         ?? null,
      subtotal:      body.subtotal      ?? null,
      vat_amount:    body.vat_amount    ?? null,
      total_amount:  body.total_amount  ?? null,
      notes:         body.notes         ?? null,
    }).eq('id', id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur' }, { status: 500 });
  }
}
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const { error } = await getSupabase().from('invoices').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur' }, { status: 500 });
  }
}
