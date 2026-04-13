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
    let query = getSupabase().from('fleet_vehicles').select('*').order('created_at', { ascending: false });
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
    if (!body.brand || !body.model) {
      return NextResponse.json({ error: 'brand et model sont requis' }, { status: 400 });
    }
    const { data, error } = await getSupabase()
      .from('fleet_vehicles')
      .insert([{
        brand: body.brand, model: body.model,
        year: body.year ?? new Date().getFullYear(),
        plate: body.plate ?? '',
        type: body.type ?? 'Voiture',
        status: body.status ?? 'available',
        mileage: body.mileage ?? 0,
        fuel_type: body.fuel_type ?? 'Essence',
        last_service: body.last_maintenance ?? null,
        next_service: body.next_maintenance ?? null,
        insurance_expiry: body.insurance_expiry ?? null,
        technical_visit_expiry: body.technical_visit_expiry ?? null,
        driver: body.driver_name ?? null,
        driver_phone: body.driver_phone ?? null,
        notes: body.notes ?? null,
        purchase_price: body.purchase_price ?? null,
        daily_cost: body.monthly_cost ?? null,
      }])
      .select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur serveur';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
