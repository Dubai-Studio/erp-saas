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
    const status     = searchParams.get('status');
    const department = searchParams.get('department');

    let query = supabase
      .from('employees')
      .select('*')
      .order('created_at', { ascending: false });

    if (status)     query = query.eq('status', status);
    if (department) query = query.eq('department', department);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // ✅ Retourne un tableau direct — compatible avec toArray() du frontend
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

    if (!body.first_name || !body.last_name) {
      return NextResponse.json({ error: 'Prénom et nom obligatoires' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('employees')
      .insert([{
        first_name:        body.first_name,
        last_name:         body.last_name,
        email:             body.email             || null,
        phone:             body.phone             || null,
        position:          body.position          || null,
        department:        body.department        || null,
        hire_date:         body.hire_date         || null,
        salary:            body.salary            || null,
        status:            body.status            || 'active',
        contract_type:     body.contract_type     || 'CDI',   // ✅ ajouté
        iban:              body.iban              || null,    // ✅ ajouté
        national_id:       body.national_id       || null,    // ✅ ajouté
        address:           body.address           || null,    // ✅ ajouté
        emergency_contact: body.emergency_contact || null,    // ✅ ajouté
      }])
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 }); // ✅ retourne l'objet direct
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
