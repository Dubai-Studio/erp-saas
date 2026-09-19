/**
 * Calculs métier partagés entre API et front (pour cohérence).
 * Tout est pur, testable, sans dépendance externe.
 */

import type { InvoiceLine } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Numéros & dates
// ─────────────────────────────────────────────────────────────────────────────

/** Numéro de facture belge typique : FAC-2026-000123 */
export function nextInvoiceNumber (lastNumber: string | null | undefined, prefix = 'FAC'): string {
  const year = new Date().getFullYear()
  const m = lastNumber?.match(/(\d{6})$/)
  const seq = m ? (parseInt(m[1], 10) + 1) : 1
  return `${prefix}-${year}-${String(seq).padStart(6, '0')}`
}

export function nowIsoDate (): string {
  return new Date().toISOString().split('T')[0]
}

export function nowIsoDateTime (): string {
  return new Date().toISOString()
}

export function currentMonth (): string {
  return new Date().toISOString().slice(0, 7)
}

export function monthFromDate (date: string): string {
  return (date || '').slice(0, 7)
}

export function isThisMonth (dateIso: string | null | undefined, month = currentMonth()): boolean {
  return !!dateIso && dateIso.slice(0, 7) === month
}

export function daysBetween (a: string | Date, b: string | Date): number {
  const ms = (typeof a === 'string' ? new Date(a) : a).getTime() -
             (typeof b === 'string' ? new Date(b) : b).getTime()
  return Math.round(ms / 86_400_000)
}

export function addDays (date: string, days: number): string {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

// ─────────────────────────────────────────────────────────────────────────────
// Numériques (sûrs)
// ─────────────────────────────────────────────────────────────────────────────

export function toNum (v: unknown, def = 0): number {
  if (v === null || v === undefined || v === '') return def
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : def
}

export function toInt (v: unknown, def = 0): number {
  const n = toNum(v, def)
  return Math.trunc(n)
}

export function round2 (n: number): number {
  return Math.round(n * 100) / 100
}

// ─────────────────────────────────────────────────────────────────────────────
// Factures
// ─────────────────────────────────────────────────────────────────────────────

export interface InvoiceTotals {
  subtotal: number
  vat_amount: number
  total: number
  line_count: number
}

export function computeInvoiceTotals (lines: InvoiceLine[]): InvoiceTotals {
  let subtotal = 0
  let vat = 0
  for (const l of lines) {
    const qty = toNum(l.quantity)
    const price = toNum(l.unit_price)
    const rate = toNum(l.vat_rate)
    const ht = qty * price
    subtotal += ht
    vat += ht * (rate / 100)
  }
  return {
    subtotal: round2(subtotal),
    vat_amount: round2(vat),
    total: round2(subtotal + vat),
    line_count: lines.length,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Agrégats dashboard
// ─────────────────────────────────────────────────────────────────────────────

export function sumBy<T> (items: T[], pick: (x: T) => number): number {
  let s = 0
  for (const it of items) s += toNum(pick(it))
  return round2(s)
}

export function groupSum<T> (
  items: T[],
  pickKey: (x: T) => string,
  pickAmount: (x: T) => number,
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const it of items) {
    const k = pickKey(it) || 'Autre'
    out[k] = round2((out[k] || 0) + toNum(pickAmount(it)))
  }
  return out
}

export function topN<T> (items: T[], n: number, pickAmount: (x: T) => number): T[] {
  return [...items]
    .sort((a, b) => pickAmount(b) - pickAmount(a))
    .slice(0, n)
}

export function pctChange (current: number, previous: number): number {
  if (!previous) return current > 0 ? 100 : 0
  return round2(((current - previous) / previous) * 100)
}

// ─────────────────────────────────────────────────────────────────────────────
// Stock
// ─────────────────────────────────────────────────────────────────────────────

export function stockStatus (item: { quantity: number; min_quantity: number; status?: string }): 'in_stock' | 'low_stock' | 'out_of_stock' {
  const q = toNum(item.quantity)
  const min = toNum(item.min_quantity)
  if (q <= 0) return 'out_of_stock'
  if (min > 0 && q <= min) return 'low_stock'
  return 'in_stock'
}

export function stockValueAtPurchase (items: { quantity: number; purchase_price: number | null; unit_price: number | null }[]): number {
  return sumBy(items, (i) => toNum(i.quantity) * (toNum(i.purchase_price) || toNum(i.unit_price)))
}

export function stockValueAtSale (items: { quantity: number; selling_price: number }[]): number {
  return sumBy(items, (i) => toNum(i.quantity) * toNum(i.selling_price))
}

// ─────────────────────────────────────────────────────────────────────────────
// Heures travaillées
// ─────────────────────────────────────────────────────────────────────────────

export function calcHoursWorked (start: string | null, end: string | null, breakMin = 0): number {
  if (!start || !end) return 0
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const totalMin = (eh * 60 + em) - (sh * 60 + sm) - (breakMin || 0)
  if (totalMin <= 0) return 0
  return round2(totalMin / 60)
}

export function calcAmount (hours: number, rate: number, bonusPct = 0): number {
  return round2(hours * rate * (1 + bonusPct / 100))
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation croisée (helpers)
// ─────────────────────────────────────────────────────────────────────────────

export function isValidUuid (s: unknown): s is string {
  return typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
}

export function assertUuid (id: unknown): string {
  if (!isValidUuid(id)) throw new Error(`Identifiant invalide: ${String(id)}`)
  return id
}