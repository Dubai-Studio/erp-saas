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
    const supabase = getSupabase();
    const { searchParams } = new URL(req.url);
    const employee_id = searchParams.get('employee_id');
    const month       = searchParams.get('month');

    let query = supabase
      .from('pay_adjustments')
      .select('*')
      .order('created_at', { ascending: false });

    if (employee_id) query = query.eq('employee_id', employee_id);
    if (month)       query = query.eq('month', month);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // ✅ Tableau direct
    return NextResponse.json(data ?? []);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const body = await req.json();

    if (!body.employee_id || !body.amount || !body.reason) {
      return NextResponse.json({ error: 'employee_id, amount et reason obligatoires' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('pay_adjustments')
      .insert([{
        employee_id: body.employee_id,
        type:        body.type   || 'bonus',
        amount:      body.amount,
        reason:      body.reason,
        month:       body.month  || null,
      }])
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'ID manquant' }, { status: 400 });

    const { error } = await supabase
      .from('pay_adjustments')
      .delete()
      .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
