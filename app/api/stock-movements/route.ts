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
    const productId = searchParams.get('product_id');
    let query = getSupabase()
      .from('stock_movements')
      .select('*, stock_items(name)')
      .order('created_at', { ascending: false });
    if (productId) query = query.eq('product_id', productId);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const normalized = (data ?? []).map((m: any) => ({
      ...m,
      item_name: m.stock_items?.name ?? '',
    }));
    return NextResponse.json(normalized);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.product_id || !body.type || !body.quantity)
      return NextResponse.json({ error: 'product_id, type et quantity requis' }, { status: 400 });
    const { data, error } = await getSupabase()
      .from('stock_movements')
      .insert([{
        product_id: body.product_id,
        type:       body.type,
        quantity:   body.quantity,
        unit_price: body.unit_price ?? 0,
        reason:     body.reason     ?? null,
        reference:  body.reference  ?? null,
        date:       body.date       ?? new Date().toISOString().split('T')[0],
      }])
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur serveur' }, { status: 500 });
  }
}
