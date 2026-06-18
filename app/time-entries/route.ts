import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

function toDate(v: unknown): string | null {
  if (!v || String(v).trim() === '') return null;
  return String(v);
}

function toNum(v: unknown, def = 0): number {
  const n = parseFloat(String(v));
  return isNaN(n) ? def : n;
}

function toEntryType(v: unknown): string {
  const allowed = ['normal', 'overtime', 'weekend', 'holiday', 'night'];
  const val = String(v ?? 'normal');
  return allowed.includes(val) ? val : 'normal';
}

function toStatus(v: unknown): string {
  const allowed = ['draft', 'validated', 'paid'];
  const val = String(v ?? 'draft');
  return allowed.includes(val) ? val : 'draft';
}

function calcHours(start: string, end: string, breakMin: number): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const startMin = sh * 60 + sm;
  const endMin   = eh * 60 + em;
  const total    = endMin - startMin - (breakMin || 0);
  return Math.max(0, Math.round((total / 60) * 100) / 100);
}

function calcAmount(hours: number, hourlyRate: number, ratePercent: number): number {
  const multiplier = 1 + (ratePercent / 100);
  return Math.round(hours * hourlyRate * multiplier * 100) / 100;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get('employee_id');
    const month      = searchParams.get('month');
    const status     = searchParams.get('status');

    let query = getSupabase()
      .from('time_entries')
      .select('*, employees(first_name, last_name, hourly_rate, worker_type)')
      .order('date', { ascending: false });

    if (employeeId) query = query.eq('employee_id', employeeId);
    if (month)      query = query.eq('month', month);
    if (status)     query = query.eq('status', status);

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
    if (!body.employee_id) return NextResponse.json({ error: 'employee_id requis' }, { status: 400 });
    if (!body.date)        return NextResponse.json({ error: 'date requise' },        { status: 400 });

    const breakMin   = toNum(body.break_minutes, 0);
    const hoursWorked = body.hours_worked
      ? toNum(body.hours_worked)
      : calcHours(body.start_time, body.end_time, breakMin);

    const rateApplied = toNum(body.rate_applied, 0);
    const hourlyRate  = toNum(body.hourly_rate, 0);
    const amount      = body.amount
      ? toNum(body.amount)
      : calcAmount(hoursWorked, hourlyRate, rateApplied);

    const date  = toDate(body.date)!;
    const month = body.month ?? date.slice(0, 7);

    const { data, error } = await getSupabase()
      .from('time_entries')
      .insert([{
        employee_id:   body.employee_id,
        date,
        month,
        start_time:    body.start_time    ?? null,
        end_time:      body.end_time      ?? null,
        break_minutes: breakMin,
        hours_worked:  hoursWorked,
        entry_type:    toEntryType(body.entry_type),
        rate_applied:  rateApplied,
        amount,
        status:        toStatus(body.status),
        notes:         body.notes?.trim() || null,
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
    const { searchParams } = new URL(req.url);
    const id   = searchParams.get('id');
    const body = await req.json();
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if ('date'          in body) update.date          = toDate(body.date);
    if ('start_time'    in body) update.start_time    = body.start_time ?? null;
    if ('end_time'      in body) update.end_time      = body.end_time   ?? null;
    if ('break_minutes' in body) update.break_minutes = toNum(body.break_minutes, 0);
    if ('entry_type'    in body) update.entry_type    = toEntryType(body.entry_type);
    if ('rate_applied'  in body) update.rate_applied  = toNum(body.rate_applied, 0);
    if ('status'        in body) update.status        = toStatus(body.status);
    if ('notes'         in body) update.notes         = body.notes?.trim() || null;

    // Recalculer heures et montant si nécessaire
    if ('start_time' in body || 'end_time' in body || 'break_minutes' in body) {
      const breakMin    = toNum(body.break_minutes ?? 0);
      update.hours_worked = calcHours(
        String(body.start_time ?? ''),
        String(body.end_time   ?? ''),
        breakMin
      );
    }
    if ('hours_worked' in body) update.hours_worked = toNum(body.hours_worked);
    if ('amount'       in body) update.amount       = toNum(body.amount);

    // Recalculer montant si heures ou taux changent
    if (('hours_worked' in update || 'rate_applied' in update) && 'hourly_rate' in body) {
      update.amount = calcAmount(
        toNum(update.hours_worked as number),
        toNum(body.hourly_rate),
        toNum(update.rate_applied as number)
      );
    }

    if ('month' in body) update.month = body.month;

    const { data, error } = await getSupabase()
      .from('time_entries')
      .update(update)
      .eq('id', id)
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
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });

    const { error } = await getSupabase()
      .from('time_entries')
      .delete()
      .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur serveur' }, { status: 500 });
  }
}
