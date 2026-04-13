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
    const employeeId = searchParams.get('employee_id');
    const month = searchParams.get('month');
    let query = getSupabase()
      .from('pay_adjustments')
      .select('*, employees(first_name, last_name)')
      .order('created_at', { ascending: false });
    if (employeeId) query = query.eq('employee_id', employeeId);
    if (month) query = query.eq('month', month);
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
    if (!body.employee_id || !body.amount || !body.reason)
      return NextResponse.json({ error: 'employee_id, amount et reason requis' }, { status: 400 });
    const { data, error } = await getSupabase()
      .from('pay_adjustments')
      .insert([{
        employee_id: body.employee_id,
        type:        body.type   ?? 'bonus',
        amount:      body.amount,
        reason:      body.reason,
        date:        body.date  ?? new Date().toISOString().split('T')[0],
        month:       body.month ?? null,
      }])
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });
    const { error } = await getSupabase().from('pay_adjustments').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur serveur' }, { status: 500 });
  }
}
