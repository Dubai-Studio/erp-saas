/**
 * Formatters partagés.
 * Pas d'imports lourds : date-fns déjà présent pour les composants.
 */

export function formatMoney (
  n: number,
  currency = 'EUR',
  locale = 'fr-BE',
): string {
  if (!Number.isFinite(n)) return '—'
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

export function formatPct (n: number, locale = 'fr-BE', fractionDigits = 1): string {
  if (!Number.isFinite(n)) return '—'
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(n / 100)
}

export function formatNumber (n: number, locale = 'fr-BE'): string {
  if (!Number.isFinite(n)) return '—'
  return new Intl.NumberFormat(locale).format(n)
}

export function formatDate (iso: string | null | undefined, locale = 'fr-BE'): string {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat(locale, {
      day: '2-digit', month: '2-digit', year: 'numeric',
    }).format(new Date(iso))
  } catch { return iso }
}

export function formatDateLong (iso: string | null | undefined, locale = 'fr-BE'): string {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat(locale, {
      day: '2-digit', month: 'long', year: 'numeric',
    }).format(new Date(iso))
  } catch { return iso }
}

export function formatMonthFr (key: string): string {
  // key = 'YYYY-MM'
  const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']
  const m = parseInt(key.split('-')[1] || '1', 10) - 1
  return months[m] || key
}

export const STATUS_LABELS_FR: Record<string, string> = {
  draft: 'Brouillon',
  sent: 'Envoyée',
  pending: 'En attente',
  paid: 'Payée',
  overdue: 'En retard',
  cancelled: 'Annulée',
  active: 'Actif',
  inactive: 'Inactif',
  prospect: 'Prospect',
  archived: 'Archivé',
  leave: 'Congé',
  in_stock: 'En stock',
  low_stock: 'Stock faible',
  out_of_stock: 'Rupture',
  'en réparation': 'En réparation',
  vendu: 'Vendu',
  'hors service': 'Hors service',
}

export function statusLabel (s: string | null | undefined): string {
  if (!s) return '—'
  return STATUS_LABELS_FR[s] ?? s
}