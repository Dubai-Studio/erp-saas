import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
function sb() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!); }

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const employee_id = searchParams.get("employee_id");
  const month       = searchParams.get("month");
  let q = sb().from("employee_payments").select("*, employees(first_name, last_name)").order("created_at", { ascending: false });
  if (employee_id) q = q.eq("employee_id", employee_id);
  if (month)       q = q.eq("month", month);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { employee_id, month, year, type, amount, status, payment_date, payment_method, note } = body;
  if (!employee_id || !month || !amount) return NextResponse.json({ error: "Champs requis manquants" }, { status: 400 });
  const { data, error } = await sb().from("employee_payments").insert({
    employee_id, month, year: year || parseInt(month.split("-")[0]),
    type: type || "salaire", amount, status: status || "pending",
    payment_date: payment_date || null, payment_method: payment_method || "Virement", note: note || null
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id   = searchParams.get("id");
  const body = await req.json();
  if (!id) return NextResponse.json({ error: "ID requis" }, { status: 400 });
  const { data, error } = await sb().from("employee_payments").update({ ...body, updated_at: new Date().toISOString() }).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID requis" }, { status: 400 });
  const { error } = await sb().from("employee_payments").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
