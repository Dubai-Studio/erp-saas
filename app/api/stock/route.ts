import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

// Convertit "" ou undefined en null pour les dates
function toDate(v: unknown): string | null {
  if (!v || String(v).trim() === '') return null;
  return String(v);
}

// Convertit en number proprement
function toNum(v: unknown, def = 0): number {
  const n = parseFloat(String(v));
  return isNaN(n) ? def : n;
}

// Normalise le statut — accepte tous les formats du front
function toStatus(v: unknown): string {
  const map: Record<string, string> = {
    in_stock:            'in_stock',
    low_stock:           'low_stock',
    out_of_stock:        'out_of_stock',
    actif:               'in_stock',
    active:              'in_stock',
    inactif:             'inactif',
    inactive:            'inactif',
    rupture:             'out_of_stock',
    archived:            'archivé',
    archivé:             'archivé',
    'en stock':          'in_stock',
    'stock faible':      'low_stock',
    'rupture de stock':  'out_of_stock',
  };
  return map[String(v)] ?? 'in_stock';
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
    if (!body.name?.trim()) return NextResponse.json({ error: 'name requis' }, { status: 400 });

    const { data, error } = await getSupabase()
      .from('stock_items')
      .insert([{
        name:           body.name.trim(),
        sku:            body.sku            || null,
        reference:      body.reference      || null,
        supplier_ref:   body.supplier_ref   || null,
        category:       body.category       || null,
        unit:           body.unit           || 'pièce',
        quantity:       toNum(body.quantity),
        min_quantity:   toNum(body.min_quantity),
        max_quantity:   toNum(body.max_quantity),
        unit_price:     toNum(body.unit_price),
        purchase_price: toNum(body.purchase_price ?? body.unit_price),
        selling_price:  toNum(body.selling_price),
        vat_rate:       toNum(body.vat_rate, 19),
        supplier:       body.supplier       || null,
        location:       body.location       || null,
        description:    body.description    || null,
        notes:          body.notes          || null,
        status:         toStatus(body.status),
        last_restock:   toDate(body.last_restock),
        expiry_date:    toDate(body.expiry_date),
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

    const update: Record<string, unknown> = {
      ...body,
      updated_at: new Date().toISOString(),
    };

    // Nettoyer les dates et statut
    if ('last_restock' in update) update.last_restock = toDate(update.last_restock);
    if ('expiry_date'  in update) update.expiry_date  = toDate(update.expiry_date);
    if ('status'       in update) update.status       = toStatus(update.status);

    const { data, error } = await getSupabase()
      .from('stock_items')
      .update(update)
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur serveur' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id   = searchParams.get('id');
    const body = await req.json();
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });

    const { data, error } = await getSupabase()
      .from('stock_items')
      .update({
        ...body,
        status:      toStatus(body.status),
        last_restock: toDate(body.last_restock),
        expiry_date:  toDate(body.expiry_date),
        updated_at:   new Date().toISOString(),
      })
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
