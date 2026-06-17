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

    let query = getSupabase()
      .from('projects')
      .select('id, name, description, client_id, status, priority, start_date, end_date, budget, spent, progress, manager, tags, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);

    const { data: projects, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const clientIds = [...new Set((projects ?? []).map((p: any) => p.client_id).filter(Boolean))];
    let clientsMap: Record<string, string> = {};

    if (clientIds.length > 0) {
      const { data: clients } = await getSupabase()
        .from('clients')
        .select('id, name')
        .in('id', clientIds);
      clientsMap = Object.fromEntries((clients ?? []).map((c: any) => [c.id, c.name]));
    }

    const result = (projects ?? []).map((p: any) => ({
      ...p,
      client_name: clientsMap[p.client_id] || '—',
    }));

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.name) return NextResponse.json({ error: 'name requis' }, { status: 400 });

    const { data, error } = await getSupabase()
      .from('projects')
      .insert([{
        name:        body.name,
        description: body.description  ?? null,
        client_id:   body.client_id    ?? null,
        start_date:  body.start_date   ?? null,
        end_date:    body.end_date     ?? null,
        budget:      body.budget       ?? 0,
        spent:       body.spent        ?? 0,
        status:      body.status       ?? 'active',
        priority:    body.priority     ?? 'medium',
        progress:    body.progress     ?? 0,
        manager:     body.manager      ?? null,
        tags:        body.tags         ?? null,
      }])
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur serveur' }, { status: 500 });
  }
}
