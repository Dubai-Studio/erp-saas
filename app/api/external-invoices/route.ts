import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
}
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    let query = getSupabase().from('external_invoices').select('*').order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur' }, { status: 500 });
  }
}
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { data, error } = await getSupabase().from('external_invoices').insert([{
      type:          body.type          ?? 'facture',
      supplier_name: body.supplier_name ?? '',
      supplier_id:   body.supplier_id   ?? null,
      client_id:     body.client_id     ?? null,
      project_id:    body.project_id    ?? null,
      amount_ht:     body.amount_ht     ?? body.subtotal ?? 0,
      vat_amount:    body.vat_amount    ?? body.tax_amount ?? 0,
      total_amount:  body.total_amount  ?? body.total ?? 0,
      issue_date:    body.issue_date    ?? new Date().toISOString().split('T')[0],
      due_date:      body.due_date      ?? null,
      category:      body.category      ?? null,
      notes:         body.notes         ?? null,
      status:        body.status        ?? 'pending',
      file_name:     body.file_name     ?? null,
      file_url:      body.file_url      ?? null,
    }]).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur' }, { status: 500 });
  }
}
