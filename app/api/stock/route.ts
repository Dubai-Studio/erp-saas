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
    const category = searchParams.get('category');
    const status   = searchParams.get('status');

    let query = getSupabase()
      .from('stock_items')
      .select('*')
      .order('created_at', { ascending: false });

    if (category) query = query.eq('category', category);
    if (status)   query = query.eq('status', status);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.name) return NextResponse.json({ error: 'name requis' }, { status: 400 });

    const { data, error } = await getSupabase()
      .from('stock_items')
      .insert([{
        name:          body.name?.trim(),
        sku:           body.sku           ?? null,
        reference:     body.reference     ?? body.supplier_ref ?? null,
        supplier_ref:  body.supplier_ref  ?? null,
        category:      body.category      ?? null,
        unit:          body.unit          ?? 'pièce',
        quantity:      Number(body.quantity)      ?? 0,
        min_quantity:  Number(body.min_quantity)  ?? 0,
        max_quantity:  Number(body.max_quantity)  ?? 0,
        unit_price:    Number(body.unit_price)    ?? 0,
        purchase_price:Number(body.purchase_price ?? body.unit_price) ?? 0,
        selling_price: Number(body.selling_price) ?? 0,
        vat_rate:      Number(body.vat_rate)      ?? 19,
        supplier:      body.supplier      ?? null,
        location:      body.location      ?? null,
        description:   body.description   ?? null,
        notes:         body.notes         ?? null,
        status:        body.status        ?? 'actif',
        last_restock:  body.last_restock  ?? null,
        expiry_date:   body.expiry_date   ?? null,
      }])
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur serveur' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id   = searchParams.get('id');
    const body = await req.json();
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });

    const { data, error } = await getSupabase()
      .from('stock_items')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });

    const { error } = await getSupabase()
      .from('stock_items')
      .delete()
      .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur serveur' }, { status: 500 });
  }
}
