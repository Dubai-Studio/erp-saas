import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error(`Config manquante: url=${!!url} key=${!!key}`);
  return createClient(url, key);
}

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get('x-user-id');
    if (!userId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');

    let query = getSupabase()
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);

    const { data: projects, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const clientIds = [...new Set((projects ?? []).map((p: Record<string, unknown>) => p.client_id).filter(Boolean))];
    let clientsMap: Record<string, string> = {};

    if (clientIds.length > 0) {
      const { data: clients } = await getSupabase()
        .from('clients')
        .select('id, name')
        .in('id', clientIds);
      clientsMap = Object.fromEntries((clients ?? []).map((c: Record<string, unknown>) => [c.id as string, c.name as string]));
    }

    const result = (projects ?? []).map((p: Record<string, unknown>) => ({
      ...p,
      client_name: clientsMap[p.client_id as string] || p.client_name || '—',
    }));

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get('x-user-id');
    if (!userId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const body = await req.json();
    if (!body.name) return NextResponse.json({ error: 'name requis' }, { status: 400 });

    const { data, error } = await getSupabase()
      .from('projects')
      .insert([{
        user_id:     userId,
        name:        body.name,
        description: body.description ?? null,
        client_id:   body.client_id   ?? null,
        client_name: body.client_name ?? null,
        color:       body.color       ?? '#f59e0b',
        start_date:  body.start_date  ?? null,
        end_date:    body.end_date    ?? null,
        budget:      body.budget      ?? 0,
        spent:       body.spent       ?? 0,
        status:      body.status      ?? 'actif',
        priority:    body.priority    ?? 'normale',
        progress:    body.progress    ?? 0,
        manager:     body.manager     ?? null,
        tags:        body.tags        ?? null,
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
    const userId = req.headers.get('x-user-id');
    if (!userId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const body = await req.json();
    const { id, ...fields } = body;
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });

    const { data, error } = await getSupabase()
      .from('projects')
      .update(fields)
      .eq('id', id)
      .eq('user_id', userId)
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
    const userId = req.headers.get('x-user-id');
    if (!userId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });

    const { error } = await getSupabase()
      .from('projects')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur serveur' }, { status: 500 });
  }
}
