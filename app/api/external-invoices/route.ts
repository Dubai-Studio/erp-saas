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

    if (!body.supplier_name || String(body.supplier_name).trim() === '') {
      return NextResponse.json({ error: 'supplier_name est requis' }, { status: 400 });
    }

    // Normalise les champs UUID optionnels : '' → null
    const nullIfEmpty = (v: unknown) =>
      v === '' || v == null ? null : String(v).trim() === '' ? null : v;

    const { data, error } = await getSupabase().from('external_invoices').insert([{
      type:          'incoming',
      supplier_name: String(body.supplier_name).trim(),
      supplier_id:   nullIfEmpty(body.supplier_id),
      client_id:     nullIfEmpty(body.client_id),
      project_id:    nullIfEmpty(body.project_id),
      amount_ht:     Number(body.amount_ht)    || 0,
      vat_amount:    Number(body.vat_amount)   || 0,
      total_amount:  Number(body.total_amount) || 0,
      issue_date:    body.issue_date ?? new Date().toISOString().split('T')[0],
      due_date:      nullIfEmpty(body.due_date),
      category:      nullIfEmpty(body.category),
      notes:         nullIfEmpty(body.notes),
      status:        body.status ?? 'pending',
      file_name:     nullIfEmpty(body.file_name),
      file_url:      nullIfEmpty(body.file_url),
    }]).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur' }, { status: 500 });
  }
}
