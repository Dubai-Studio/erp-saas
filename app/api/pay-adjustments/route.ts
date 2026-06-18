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
    const employeeId = searchParams.get('employee_id');
    const month      = searchParams.get('month');
    const projectId  = searchParams.get('project_id');

    let query = getSupabase()
      .from('pay_adjustments')
      .select('*, employees(first_name, last_name, salary)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (employeeId) query = query.eq('employee_id', employeeId);
    if (month)      query = query.eq('month', month);
    if (projectId)  query = query.eq('project_id', projectId);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get('x-user-id');
    if (!userId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const body = await req.json();
    if (!body.employee_id || !body.amount)
      return NextResponse.json({ error: 'employee_id et amount requis' }, { status: 400 });

    const type      = body.type  ?? 'bonus';
    const month     = body.month ?? new Date().toISOString().slice(0, 7);
    const projectId = body.project_id ?? null;

    // Si type salaire, vérifier qu'il n'existe pas déjà pour ce mois
    if (type === 'salaire') {
      const { data: existing } = await getSupabase()
        .from('pay_adjustments')
        .select('id')
        .eq('employee_id', body.employee_id)
        .eq('user_id', userId)
        .eq('type', 'salaire')
        .eq('month', month)
        .single();

      if (existing) {
        return NextResponse.json(
          { error: `Salaire déjà enregistré pour ${month}` },
          { status: 409 }
        );
      }
    }

    const { data, error } = await getSupabase()
      .from('pay_adjustments')
      .insert([{
        user_id:    userId,
        employee_id: body.employee_id,
        type,
        amount:     body.amount,
        reason:     body.reason ?? (type === 'salaire' ? `Salaire ${month}` : null),
        date:       body.date   ?? new Date().toISOString().split('T')[0],
        month,
        project_id: projectId,
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

    // Normalise project_id : chaîne vide devient null
    if ('project_id' in fields && !fields.project_id) fields.project_id = null;

    const { data, error } = await getSupabase()
      .from('pay_adjustments')
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
      .from('pay_adjustments')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur serveur' }, { status: 500 });
  }
}
