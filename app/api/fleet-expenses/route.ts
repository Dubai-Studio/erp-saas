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
    const vehicleId = searchParams.get('vehicle_id');
    let query = getSupabase()
      .from('expenses')
      .select('*')
      .order('created_at', { ascending: false });
    
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
    const { data, error } = await getSupabase()
      .from('expenses')
      .insert([{
        vehicle_id:  body.vehicle_id  ?? null,
        amount:      body.amount,
        category:    body.category    ?? null,
        description: body.description ?? null,
        date:        body.date        ?? new Date().toISOString().split('T')[0],
      }])
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur serveur' }, { status: 500 });
  }
}

