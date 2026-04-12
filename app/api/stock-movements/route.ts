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
    const product_id = searchParams.get('product_id');

    let query = getSupabase()
      .from('stock_movements')
      .select('*, stock_products(name)')
      .order('date', { ascending: false });

    if (product_id) query = query.eq('product_id', product_id);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Normalise : ajoute item_name depuis la jointure
    const normalized = (data ?? []).map((m: Record<string, unknown>) => ({
      ...m,
      stock_item_id: m.product_id,
      item_name: (m.stock_products as { name?: string } | null)?.name ?? '',
      unit_price: m.unit_price ?? 0,
    }));

    return NextResponse.json(normalized);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur serveur';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { stock_item_id, type, quantity, reason, date } = body;

    if (!stock_item_id || !type || quantity == null) {
      return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 });
    }

    const { data, error } = await getSupabase()
      .from('stock_movements')
      .insert([{
        product_id:  stock_item_id,
        type,
        quantity:    Number(quantity),
        unit_price:  body.unit_price ?? 0,
        reason:      reason ?? null,
        reference:   body.reference ?? null,
        date:        date ?? new Date().toISOString().split('T')[0],
      }])
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      ...data,
      stock_item_id: data.product_id,
      item_name:     body.item_name ?? '',
    }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur serveur';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
