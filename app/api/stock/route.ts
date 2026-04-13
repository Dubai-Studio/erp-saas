import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
}
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');
    const status   = searchParams.get('status');
    let query = getSupabase().from('stock_items').select('*').order('created_at', { ascending: false });
    if (category) query = query.eq('category', category);
    if (status)   query = query.eq('status', status);
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
    if (!body.name) return NextResponse.json({ error: 'name requis' }, { status: 400 });
    const { data, error } = await getSupabase().from('stock_items').insert([{
      name:          body.name,
      sku:           body.reference    ?? body.sku    ?? null,
      reference:     body.reference    ?? null,
      category:      body.category     ?? 'Autre',
      unit:          body.unit         ?? 'pcs',
      quantity:      body.quantity     ?? 0,
      min_quantity:  body.min_quantity ?? 0,
      unit_price:    body.unit_price   ?? 0,
      selling_price: body.selling_price ?? 0,
      supplier:      body.supplier     ?? null,
      supplier_ref:  body.supplier_ref ?? null,
      location:      body.location     ?? null,
      description:   body.notes        ?? body.description ?? null,
      status:        body.status       ?? 'active',
      vat_rate:      body.vat_rate     ?? 21,
      last_restock:  body.last_restock ?? null,
      expiry_date:   body.expiry_date  ?? null,
    }]).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur' }, { status: 500 });
  }
}
