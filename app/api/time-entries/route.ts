import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error(`Config manquante: url=${!!url} key=${!!key}`);
  return createClient(url, key);
}

function calcHours(start: string, end: string, breakMin: number): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const totalMin = (eh * 60 + em) - (sh * 60 + sm) - (breakMin || 0);
  return Math.max(0, Math.round((totalMin / 60) * 100) / 100);
}

function calcAmount(hours: number, rate: number, bonus: number): number {
  if (!rate) return 0;
  return Math.round(hours * rate * (1 + (bonus || 0) / 100) * 100) / 100;
}

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get('x-user-id');
    if (!userId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const supabase = getSupabase();
    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get('employee_id');
    const month = searchParams.get('month');

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

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get('x-user-id');
    if (!userId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const supabase = getSupabase();
    const body = await req.json();

    const {
      employee_id,
      date,
      month,
      start_time,
      end_time,
      break_minutes,
      hours_worked,
      entry_type,
      rate_applied,
      bonus_percent,
      hourly_rate,
      amount,
      status,
      notes,
    } = body;

    if (!employee_id || !date) {
      return NextResponse.json({ error: 'employee_id et date sont requis' }, { status: 400 });
    }

    const breakM  = break_minutes ?? 0;
    const heures  = hours_worked  ?? calcHours(start_time || '', end_time || '', breakM);
    const bonus   = rate_applied  ?? bonus_percent ?? 0;
    const taux    = hourly_rate   ?? 0;
    const montant = amount        ?? calcAmount(heures, taux, bonus);

    const { data, error } = await supabase
      .from('time_entries')
      .insert([{
        user_id:       userId,
        employee_id,
        date,
        month:         month || date.substring(0, 7),
        start_time:    start_time  || null,
        end_time:      end_time    || null,
        break_minutes: breakM,
        hours_worked:  heures,
        entry_type:    entry_type  || 'normal',
        rate_applied:  bonus,
        bonus_percent: bonus,
        hourly_rate:   taux,
        amount:        montant,
        status:        status      || 'draft',
        notes:         notes       || null,
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

    const supabase = getSupabase();
    const body = await req.json();
    const { id, ...fields } = body;

    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });

    // Recalcul si nécessaire
    if (fields.start_time && fields.end_time && fields.hours_worked === undefined) {
      fields.hours_worked = calcHours(fields.start_time, fields.end_time, fields.break_minutes ?? 0);
    }
    if (fields.hours_worked !== undefined && fields.hourly_rate !== undefined && fields.amount === undefined) {
      fields.amount = calcAmount(fields.hours_worked, fields.hourly_rate, fields.rate_applied ?? 0);
    }

    // Supprimer les champs non existants dans la table
    delete fields.heure_debut;
    delete fields.heure_fin;
    delete fields.pause_minutes;
    delete fields.heures_calculees;
    delete fields.bonus_percent;

    const { data, error } = await supabase
      .from('time_entries')
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

    const supabase = getSupabase();
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

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
