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
    let query = getSupabase().from('external_invoices').select('*').order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);
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
      .from('external_invoices')
      .insert([{
        invoice_number: body.invoice_number ?? '',
        supplier_name: body.supplier_name ?? '',
        supplier_email: body.supplier_email ?? null,
        issue_date: body.issue_date ?? new Date().toISOString().split('T')[0],
        due_date: body.due_date ?? null,
        status: body.status ?? 'pending',
        subtotal: body.subtotal ?? 0,
        tax_rate: body.tax_rate ?? 19,
        tax_amount: body.tax_amount ?? 0,
        total: body.total ?? 0,
        category: body.category ?? null,
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
