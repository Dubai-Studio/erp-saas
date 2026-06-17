import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

function toDate(v: unknown): string | null {
  if (!v || String(v).trim() === '') return null;
  return String(v);
}

function toNum(v: unknown, def = 0): number {
  const n = parseFloat(String(v));
  return isNaN(n) ? def : n;
}

function toExpenseType(v: unknown): string {
  const allowed = [
    'carburant', 'assurance', 'entretien', 'réparation',
    'contrôle technique', 'pneus', 'lavage', 'amende',
    'parking', 'péage', 'location', 'autre',
  ];
  const map: Record<string, string> = {
    fuel:          'carburant',
    gas:           'carburant',
    insurance:     'assurance',
    maintenance:   'entretien',
    repair:        'réparation',
    inspection:    'contrôle technique',
    tires:         'pneus',
    wash:          'lavage',
    fine:          'amende',
    toll:          'péage',
    rent:          'location',
    other:         'autre',
  };
  const val = String(v ?? '');
  if (allowed.includes(val)) return val;
  return map[val] ?? 'autre';
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const vehicleId = searchParams.get('vehicle_id');
    const month     = searchParams.get('month');
    const type      = searchParams.get('type');

    let query = getSupabase()
      .from('fleet_expenses')
      .select('*, fleet_vehicles(name, brand, model, plate)')
      .order('date', { ascending: false });

    if (vehicleId) query = query.eq('vehicle_id', vehicleId);
    if (month)     query = query.eq('month', month);
    if (type)      query = query.eq('type', type);

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
    if (!body.amount) return NextResponse.json({ error: 'amount requis' }, { status: 400 });
    if (!body.vehicle_id) return NextResponse.json({ error: 'vehicle_id requis' }, { status: 400 });

    const date  = toDate(body.date) ?? new Date().toISOString().split('T')[0];
    const month = body.month ?? date.slice(0, 7);

    const { data, error } = await getSupabase()
      .from('fleet_expenses')
      .insert([{
        vehicle_id:  body.vehicle_id,
        type:        toExpenseType(body.type ?? body.category),
        amount:      toNum(body.amount),
        date,
        month,
        mileage:     body.mileage     ? parseInt(String(body.mileage)) : null,
        description: body.description?.trim() || null,
        supplier:    body.supplier?.trim()    || null,
        invoice_ref: body.invoice_ref?.trim() || null,
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

    if ('type'   in update) update.type   = toExpenseType(update.type);
    if ('date'   in update) update.date   = toDate(update.date);
    if ('amount' in update) update.amount = toNum(update.amount);

    // Supprimer les colonnes inexistantes
    delete update.category;

    const { data, error } = await getSupabase()
      .from('fleet_expenses')
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

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });

    const { error } = await getSupabase()
      .from('fleet_expenses')
      .delete()
      .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur serveur' }, { status: 500 });
  }
}
