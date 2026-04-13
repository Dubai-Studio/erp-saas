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
    let query = getSupabase().from('projects').select('*, clients(name)').order('created_at', { ascending: false });
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
    if (!body.name) return NextResponse.json({ error: 'name requis' }, { status: 400 });
    const { data, error } = await getSupabase()
      .from('projects')
      .insert([{
        name: body.name, description: body.description ?? null,
        client_id: body.client_id ?? null, client_name: body.client_name ?? null,
        status: body.status ?? 'active', priority: body.priority ?? 'medium',
        start_date: body.start_date ?? null, end_date: body.end_date ?? null,
        budget: body.budget ?? 0, spent: body.spent ?? 0,
        progress: body.progress ?? 0, manager: body.manager ?? null,
        notes: body.notes ?? null,
      }])
      .select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur serveur';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
