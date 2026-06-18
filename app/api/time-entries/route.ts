import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function calcHours(start: string, end: string, breakMin: number): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const totalMin = (eh * 60 + em) - (sh * 60 + sm) - (breakMin || 0);
  return Math.max(0, Math.round((totalMin / 60) * 100) / 100);
}

function calcAmount(hours: number, rate: number, bonus: number): number {
  if (!rate) return 0;
  const multiplier = 1 + (bonus || 0) / 100;
  return Math.round(hours * rate * multiplier * 100) / 100;
}

// GET - liste des pointages
export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  if (!userId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const employeeId = searchParams.get('employee_id');
  const month = searchParams.get('month'); // format YYYY-MM

  let query = supabase
    .from('time_entries')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false });

  if (employeeId) query = query.eq('employee_id', employeeId);
  if (month) {
    const start = `${month}-01`;
    const end = new Date(new Date(start).getFullYear(), new Date(start).getMonth() + 1, 0)
      .toISOString().split('T')[0];
    query = query.gte('date', start).lte('date', end);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

// POST - créer un pointage
export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  if (!userId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const body = await req.json();

  const {
    employee_id,
    date,
    month,
    heure_debut,
    heure_fin,
    pause_minutes,
    heures_calculees,
    entry_type,
    bonus_percent,
    hourly_rate,
    montant,
    statut,
    notes,
  } = body;

  if (!employee_id || !date) {
    return NextResponse.json({ error: 'employee_id et date sont requis' }, { status: 400 });
  }

  // Calcul automatique si heures non fournies
  const heures = heures_calculees ?? calcHours(heure_debut, heure_fin, pause_minutes ?? 0);
  const montantFinal = montant ?? calcAmount(heures, hourly_rate ?? 0, bonus_percent ?? 0);

  const { data, error } = await supabase
    .from('time_entries')
    .insert([{
      user_id: userId,
      employee_id,
      date,
      month: month || date.substring(0, 7),
      heure_debut: heure_debut || null,
      heure_fin: heure_fin || null,
      pause_minutes: pause_minutes ?? 0,
      heures_calculees: heures,
      entry_type: entry_type || 'normal',
      bonus_percent: bonus_percent ?? 0,
      hourly_rate: hourly_rate ?? 0,
      montant: montantFinal,
      statut: statut || 'brouillon',
      notes: notes || null,
    }])
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// PATCH - modifier un pointage
export async function PATCH(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  if (!userId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const body = await req.json();
  const { id, ...fields } = body;

  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });

  // Recalcul si nécessaire
  if (fields.heure_debut && fields.heure_fin && fields.heures_calculees === undefined) {
    fields.heures_calculees = calcHours(fields.heure_debut, fields.heure_fin, fields.pause_minutes ?? 0);
  }
  if (fields.heures_calculees !== undefined && fields.hourly_rate !== undefined && fields.montant === undefined) {
    fields.montant = calcAmount(fields.heures_calculees, fields.hourly_rate, fields.bonus_percent ?? 0);
  }

  const { data, error } = await supabase
    .from('time_entries')
    .update(fields)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE - supprimer un pointage
export async function DELETE(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  if (!userId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });

  const { error } = await supabase
    .from('time_entries')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
