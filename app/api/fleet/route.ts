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

function toStatus(v: unknown): string {
  const map: Record<string, string> = {
    actif:           'actif',
    active:          'actif',
    available:       'actif',
    inactif:         'inactif',
    inactive:        'inactif',
    'en réparation': 'en réparation',
    repair:          'en réparation',
    vendu:           'vendu',
    sold:            'vendu',
    'hors service':  'hors service',
    disabled:        'hors service',
  };
  return map[String(v)] ?? 'actif';
}

function toType(v: unknown): string {
  const map: Record<string, string> = {
    voiture:      'voiture',
    Voiture:      'voiture',
    car:          'voiture',
    camion:       'camion',
    truck:        'camion',
    camionnette:  'camionnette',
    van:          'camionnette',
    moto:         'moto',
    motorcycle:   'moto',
    utilitaire:   'utilitaire',
    autre:        'autre',
    other:        'autre',
  };
  return map[String(v)] ?? 'voiture';
}

function toFuel(v: unknown): string {
  const map: Record<string, string> = {
    diesel:     'diesel',
    Diesel:     'diesel',
    essence:    'essence',
    Essence:    'essence',
    gasoline:   'essence',
    hybride:    'hybride',
    hybrid:     'hybride',
    electrique: 'electrique',
    electric:   'electrique',
    gpl:        'gpl',
    autre:      'autre',
    other:      'autre',
  };
  return map[String(v)] ?? 'diesel';
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');

    let query = getSupabase()
      .from('fleet_vehicles')
      .select('*')
      .order('created_at', { ascending: false });

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
    if (!body.brand && !body.name) {
      return NextResponse.json({ error: 'brand ou name requis' }, { status: 400 });
    }

    const brand = body.brand?.trim() || '';
    const model = body.model?.trim() || '';

    const { data, error } = await getSupabase()
      .from('fleet_vehicles')
      .insert([{
        name:             body.name?.trim()     || `${brand} ${model}`.trim(),
        brand:            brand                 || null,
        model:            model                 || null,
        year:             body.year             ? parseInt(String(body.year)) : new Date().getFullYear(),
        plate:            body.plate?.trim()    || null,
        vin:              body.vin?.trim()      || null,
        type:             toType(body.type),
        fuel_type:        toFuel(body.fuel_type),
        color:            body.color?.trim()    || null,
        mileage:          toNum(body.mileage),
        mileage_last_update: toDate(body.mileage_last_update),
        purchase_date:    toDate(body.purchase_date),
        purchase_price:   toNum(body.purchase_price),
        insurance_company: body.insurance_company?.trim() || null,
        insurance_ref:    body.insurance_ref?.trim()      || null,
        insurance_expiry: toDate(body.insurance_expiry ?? body.insurance_expiry_date),
        control_expiry:   toDate(body.control_expiry ?? body.technical_visit_expiry),
        driver:           body.driver?.trim() ?? body.driver_name?.trim() ?? null,
        department:       body.department?.trim() || null,
        status:           toStatus(body.status),
        notes:            body.notes?.trim()    || null,
      }])
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id   = searchParams.get('id');
    const body = await req.json();
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });

    const update: Record<string, unknown> = { ...body, updated_at: new Date().toISOString() };

    if ('status'           in update) update.status           = toStatus(update.status);
    if ('type'             in update) update.type             = toType(update.type);
    if ('fuel_type'        in update) update.fuel_type        = toFuel(update.fuel_type);
    if ('insurance_expiry' in update) update.insurance_expiry = toDate(update.insurance_expiry);
    if ('control_expiry'   in update) update.control_expiry   = toDate(update.control_expiry);
    if ('purchase_date'    in update) update.purchase_date    = toDate(update.purchase_date);
    if ('mileage_last_update' in update) update.mileage_last_update = toDate(update.mileage_last_update);

    // Supprimer les colonnes inexistantes
    delete update.license_plate;
    delete update.driver_name;
    delete update.driver_phone;
    delete update.last_maintenance;
    delete update.next_maintenance;
    delete update.technical_visit_expiry;
    delete update.daily_cost;
    delete update.monthly_cost;

    const { data, error } = await getSupabase()
      .from('fleet_vehicles')
      .update(update)
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });

    const { error } = await getSupabase()
      .from('fleet_vehicles')
      .delete()
      .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur' }, { status: 500 });
  }
}
