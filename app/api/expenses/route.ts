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
    const projectId  = searchParams.get('project_id');
    const employeeId = searchParams.get('employee_id');
    const month      = searchParams.get('month');
    const category   = searchParams.get('category');

    let query = getSupabase()
      .from('expenses')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false });

    if (projectId)  query = query.eq('project_id', projectId);
    if (employeeId) query = query.eq('employee_id', employeeId);
    if (category)   query = query.eq('category', category);
    if (month) {
      const start = `${month}-01`;
      const end = new Date(new Date(start).getFullYear(), new Date(start).getMonth() + 1, 0)
        .toISOString().split('T')[0];
      query = query.gte('date', start).lte('date', end);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data || []);

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get('x-user-id');
    if (!userId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const body = await req.json();
    const { project_id, employee_id, date, amount, category, description, receipt_url, month } = body;

    if (!date || !amount) {
      return NextResponse.json({ error: 'Date et montant requis' }, { status: 400 });
    }

    const { data, error } = await getSupabase()
      .from('expenses')
      .insert([{
        user_id:     userId,
        project_id:  project_id  || null,
        employee_id: employee_id || null,
        date,
        amount:      Number(amount),
        category:    category    || 'autre',
        description: description || null,
        receipt_url: receipt_url || null,
        month:       month       || date.substring(0, 7),
      }])
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json({ error: msg }, { status: 500 });
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
      .from('expenses')
      .update(fields)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json({ error: msg }, { status: 500 });
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
      .from('expenses')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
