import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
}
type Ctx = { params: Promise<{ id: string }> };
export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const { data, error } = await getSupabase().from('employees').select('*').eq('id', id).single();
    if (error) return NextResponse.json({ error: error.message }, { status: 404 });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur' }, { status: 500 });
  }
}
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { data, error } = await getSupabase().from('employees').update({
      first_name:    body.first_name    ?? null,
      last_name:     body.last_name     ?? null,
      email:         body.email         ?? null,
      phone:         body.phone         ?? null,
      position:      body.position      ?? null,
      department:    body.department    ?? null,
      hire_date:     body.hire_date     ?? null,
      salary:        body.base_salary   ?? body.salary ?? null,
      status:        body.status        ?? null,
      contract_type: body.contract_type ?? null,
    }).eq('id', id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur' }, { status: 500 });
  }
}
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const { error } = await getSupabase().from('employees').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur' }, { status: 500 });
  }
}
