import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

type Context = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Context) {
  try {
    const { id } = await params;
    const { data, error } = await getSupabase()
      .from('stock_items')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 404 });
    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur serveur';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: Context) {
  try {
    const { id } = await params;
    const body   = await req.json();

    const { data, error } = await getSupabase()
      .from('stock_items')
      .update({
        name:           body.name,
        sku:            body.reference     ?? null,
        category:       body.category,
        unit:           body.unit,
        quantity:       body.quantity,
        min_quantity:   body.min_quantity,
        purchase_price: body.unit_price,
        selling_price:  body.selling_price,
        supplier:       body.supplier      ?? null,
        location:       body.location      ?? null,
        description:    body.notes         ?? null,
        vat_rate:       body.vat_rate      ?? 21,
        supplier_ref:   body.supplier_ref  ?? null,
        last_restock:   body.last_restock  ?? null,
        expiry_date:    body.expiry_date   ?? null,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur serveur';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Context) {
  try {
    const { id } = await params;
    const { error } = await getSupabase()
      .from('stock_items')
      .delete()
      .eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur serveur';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
