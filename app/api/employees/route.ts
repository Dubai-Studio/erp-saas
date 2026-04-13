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
    const department = searchParams.get('department');
    let query = getSupabase()
      .from('employees')
      .select('*')
      .order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);
    if (department) query = query.eq('department', department);
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
    if (!body.first_name || !body.last_name)
      return NextResponse.json({ error: 'first_name et last_name requis' }, { status: 400 });
    const { data, error } = await getSupabase()
      .from('employees')
      .insert([{
        first_name:    body.first_name,
        last_name:     body.last_name,
        email:         body.email         ?? null,
        phone:         body.phone         ?? null,
        position:      body.position      ?? null,
        department:    body.department    ?? null,
        hire_date:     body.hire_date     ?? null,
        salary:        body.salary        ?? body.base_salary ?? 0,
        status:        body.status        ?? 'active',
        contract_type: body.contract_type ?? 'CDI',
      }])
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur serveur' }, { status: 500 });
  }
}
