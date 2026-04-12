import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

// ── GET /api/employees/[id] ───────────────────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }  // ✅ Promise
) {
  try {
    const { id } = await params;  // ✅ await
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('id', id)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── PATCH /api/employees/[id] ─────────────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }  // ✅ Promise
) {
  try {
    const { id } = await params;  // ✅ await
    const supabase = getSupabase();
    const body = await req.json();

    if (!id) return NextResponse.json({ error: 'ID manquant' }, { status: 400 });

    const { data, error } = await supabase
      .from('employees')
      .update({
        first_name:        body.first_name,
        last_name:         body.last_name,
        email:             body.email             || null,
        phone:             body.phone             || null,
        position:          body.position          || null,
        department:        body.department        || null,
        hire_date:         body.hire_date         || null,
        salary:            body.salary            || null,
        status:            body.status            || 'active',
        contract_type:     body.contract_type     || 'CDI',
        iban:              body.iban              || null,
        national_id:       body.national_id       || null,
        address:           body.address           || null,
        emergency_contact: body.emergency_contact || null,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── DELETE /api/employees/[id] ────────────────────────────────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }  // ✅ Promise
) {
  try {
    const { id } = await params;  // ✅ await
    const supabase = getSupabase();

    if (!id) return NextResponse.json({ error: 'ID manquant' }, { status: 400 });

    const { error } = await supabase
      .from('employees')
      .delete()
      .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
