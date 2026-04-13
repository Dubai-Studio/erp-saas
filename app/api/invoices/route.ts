import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const client_id = searchParams.get('client_id');
    let query = getSupabase().from('invoices').select('*').order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);
    if (client_id) query = query.eq('client_id', client_id);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur serveur';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { data, error } = await getSupabase()
      .from('invoices')
      .insert([{
        invoice_number: body.invoice_number,
        client_id: body.client_id ?? null,
        client_name: body.client_name ?? '',
        issue_date: body.issue_date ?? new Date().toISOString().split('T')[0],
        due_date: body.due_date ?? null,
        status: body.status ?? 'draft',
        subtotal: body.subtotal ?? 0,
        tax_rate: body.tax_rate ?? 19,
        tax_amount: body.tax_amount ?? 0,
        total: body.total ?? 0,
        notes: body.notes ?? null,
        items: body.items ?? [],
      }])
      .select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur serveur';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
