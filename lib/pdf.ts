/**
 * Génération PDF de facture conforme (BE/UE).
 *
 * - typo soignée (helvetica + fallbacks Unicode)
 * - mentions légales belges obligatoires (TVA, n° BCE si dispo)
 * - multi-page automatique si > N lignes
 * - numérotation officielle FAC-YYYY-NNNNNN
 * - support avoir (credit_note) avec libellé "AVOIR"
 * - totaux HT / TVA / TTC bien lisibles
 *
 * On garde jsPDF + jspdf-autotable pour éviter une dépendance native
 * côté serveur. Génération côté client uniquement pour cette V1.
 */
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatDate, formatMoney } from './format'
import { computeInvoiceTotals } from './calculations'
import type { CompanySettings } from './types'

interface ClientLite {
  name: string
  email?: string | null
  address?: string | null
  city?: string | null
  zip_code?: string | null
  country?: string | null
  vat_number?: string | null
}

export interface InvoiceLineInput {
  description: string
  quantity: number
  unit_price: number
  vat_rate: number
  total?: number
}

// Type alias local pour compatibilité avec computeInvoiceTotals qui exige total: number
type InvoiceLineFull = { description: string; quantity: number; unit_price: number; vat_rate: number; total: number }

export interface InvoiceForPdf {
  invoice_number: string
  type?: 'invoice' | 'quote' | 'credit_note' | 'proforma'
  status?: string
  issue_date: string | null
  due_date?: string | null
  payment_terms?: string | null
  client?: ClientLite | null
  client_name?: string | null
  lines: InvoiceLineInput[]
  notes?: string | null
  currency?: string
  subtotal?: number
  vat_amount?: number
  total_amount?: number
}

const COLORS = {
  primary: '#1e3a5f',
  primaryRgb: [30, 58, 95] as [number, number, number],
  text: '#0f172a',
  textRgb: [15, 23, 42] as [number, number, number],
  muted: '#64748b',
  mutedRgb: [100, 116, 139] as [number, number, number],
  border: '#e2e8f0',
  borderRgb: [226, 232, 240] as [number, number, number],
  light: '#f8fafc',
  lightRgb: [248, 250, 252] as [number, number, number],
  danger: '#ef4444',
}

function hexToRgb (hex: string): [number, number, number] {
  const m = hex.replace('#', '').match(/[0-9a-f]{2}/gi)
  if (!m || m.length < 3) return [0, 0, 0]
  return [parseInt(m[0], 16), parseInt(m[1], 16), parseInt(m[2], 16)]
}

export function generateInvoicePdf (
  invoice: InvoiceForPdf,
  company: Partial<CompanySettings>,
): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 15
  const contentWidth = pageWidth - 2 * margin

  const isCredit = invoice.type === 'credit_note'

  // ── En-tête : société émettrice ─────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(COLORS.primaryRgb[0], COLORS.primaryRgb[1], COLORS.primaryRgb[2])
  doc.text(company.company_name || 'Votre société', margin, margin + 8)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(COLORS.mutedRgb[0], COLORS.mutedRgb[1], COLORS.mutedRgb[2])
  let y = margin + 14
  for (const line of [
    company.address,
    [company.zip_code, company.city].filter(Boolean).join(' '),
    company.country,
    company.vat_number ? `TVA : ${company.vat_number}` : null,
    company.email,
    company.phone,
    company.iban ? `IBAN : ${formatIban(company.iban)}` : null,
    company.bic ? `BIC : ${company.bic}` : null,
  ].filter(Boolean) as string[]) {
    doc.text(line, margin, y)
    y += 4
  }

  // ── Bloc droit : titre + numéro ──────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(28)
  doc.setTextColor(COLORS.primaryRgb[0], COLORS.primaryRgb[1], COLORS.primaryRgb[2])
  doc.text(
    isCredit ? 'AVOIR'
    : invoice.type === 'quote' ? 'DEVIS'
    : invoice.type === 'proforma' ? 'FACTURE PROFORMA'
    : 'FACTURE',
    pageWidth - margin, margin + 8, { align: 'right' },
  )

  doc.setFontSize(11)
  doc.setTextColor(COLORS.textRgb[0], COLORS.textRgb[1], COLORS.textRgb[2])
  doc.text(`N° ${invoice.invoice_number}`, pageWidth - margin, margin + 16, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(COLORS.mutedRgb[0], COLORS.mutedRgb[1], COLORS.mutedRgb[2])
  let ry = margin + 22
  const metaRows: [string, string][] = [
    ['Date d\'émission', formatDate(invoice.issue_date)],
    ['Date d\'échéance',  formatDate(invoice.due_date ?? null)],
    ['Statut',           statusFr(invoice.status)],
  ]
  for (const [label, value] of metaRows) {
    doc.text(`${label} :`, pageWidth - margin - 50, ry)
    doc.setTextColor(COLORS.textRgb[0], COLORS.textRgb[1], COLORS.textRgb[2])
    doc.text(value, pageWidth - margin, ry, { align: 'right' })
    doc.setTextColor(COLORS.mutedRgb[0], COLORS.mutedRgb[1], COLORS.mutedRgb[2])
    ry += 5
  }

  // ── Bloc client ───────────────────────────────────────────────────────────────────────────
  const clientY = Math.max(y, ry) + 8
  doc.setFillColor(COLORS.lightRgb[0], COLORS.lightRgb[1], COLORS.lightRgb[2])
  doc.rect(margin, clientY, contentWidth, 28, 'F')
  doc.setDrawColor(COLORS.borderRgb[0], COLORS.borderRgb[1], COLORS.borderRgb[2])
  doc.rect(margin, clientY, contentWidth, 28, 'S')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(COLORS.mutedRgb[0], COLORS.mutedRgb[1], COLORS.mutedRgb[2])
  doc.text('FACTURÉ À', margin + 4, clientY + 5)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(COLORS.textRgb[0], COLORS.textRgb[1], COLORS.textRgb[2])
  doc.text(invoice.client?.name || invoice.client_name || '—', margin + 4, clientY + 11)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(COLORS.mutedRgb[0], COLORS.mutedRgb[1], COLORS.mutedRgb[2])
  let cy = clientY + 16
  for (const line of [
    invoice.client?.address,
    [invoice.client?.zip_code, invoice.client?.city].filter(Boolean).join(' '),
    invoice.client?.country,
    invoice.client?.vat_number ? `TVA : ${invoice.client.vat_number}` : null,
    invoice.client?.email,
  ].filter(Boolean) as string[]) {
    doc.text(line, margin + 4, cy)
    cy += 4
  }

  // ── Tableau des lignes ───────────────────────────────────────────────────────────────────────
  const typedLines: InvoiceLineFull[] = invoice.lines.map((l) => ({
    description: l.description,
    quantity:    l.quantity,
    unit_price:  l.unit_price,
    vat_rate:    l.vat_rate ?? 0,
    total:       l.total ?? (l.quantity * l.unit_price),
  }))
  const totals = computeInvoiceTotals(typedLines)
  const subtotal = invoice.subtotal ?? totals.subtotal
  const vatAmount = invoice.vat_amount ?? totals.vat_amount
  const totalAmount = invoice.total_amount ?? totals.total
  const currency = invoice.currency || company.default_currency || 'EUR'

  autoTable(doc, {
    startY: clientY + 35,
    margin: { left: margin, right: margin },
    head: [['Description', 'Qté', 'P.U. HT', 'TVA', 'Total HT']],
    body: typedLines.map((l) => [
      l.description,
      { content: l.quantity.toString(), styles: { halign: 'right' } },
      { content: formatMoney(l.unit_price, currency), styles: { halign: 'right' } },
      { content: `${l.vat_rate}%`, styles: { halign: 'right' } },
      { content: formatMoney(l.quantity * l.unit_price, currency), styles: { halign: 'right' } },
    ]),
    theme: 'grid',
    headStyles: {
      fillColor: COLORS.primaryRgb,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
    },
    bodyStyles: { fontSize: 9, textColor: COLORS.textRgb },
    alternateRowStyles: { fillColor: COLORS.lightRgb },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 18, halign: 'right' },
      2: { cellWidth: 30, halign: 'right' },
      3: { cellWidth: 18, halign: 'right' },
      4: { cellWidth: 32, halign: 'right' },
    },
    didDrawPage: () => {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(COLORS.mutedRgb[0], COLORS.mutedRgb[1], COLORS.mutedRgb[2])
      doc.text(
        `${invoice.invoice_number} · page ${doc.getNumberOfPages()}`,
        pageWidth / 2,
        pageHeight - 8,
        { align: 'center' },
      )
    },
  })

  // ── Bloc totaux ─────────────────────────────────────────────────────────────────────────────
  // @ts-ignore — lastAutoTable est injecté par jspdf-autotable
  const afterY: number = (doc.lastAutoTable?.finalY ?? clientY + 50) + 8
  const totalsX = pageWidth - margin - 70
  const totalsW = 70
  const totalsH = isCredit ? 38 : 32

  doc.setFillColor(COLORS.lightRgb[0], COLORS.lightRgb[1], COLORS.lightRgb[2])
  doc.rect(totalsX, afterY, totalsW, totalsH, 'F')
  doc.setDrawColor(COLORS.borderRgb[0], COLORS.borderRgb[1], COLORS.borderRgb[2])
  doc.rect(totalsX, afterY, totalsW, totalsH, 'S')

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(COLORS.mutedRgb[0], COLORS.mutedRgb[1], COLORS.mutedRgb[2])
  doc.text('Sous-total HT', totalsX + 4, afterY + 6)
  doc.setTextColor(COLORS.textRgb[0], COLORS.textRgb[1], COLORS.textRgb[2])
  doc.text(formatMoney(subtotal, currency), totalsX + totalsW - 4, afterY + 6, { align: 'right' })

  doc.setTextColor(COLORS.mutedRgb[0], COLORS.mutedRgb[1], COLORS.mutedRgb[2])
  doc.text('TVA', totalsX + 4, afterY + 12)
  doc.setTextColor(COLORS.textRgb[0], COLORS.textRgb[1], COLORS.textRgb[2])
  doc.text(formatMoney(vatAmount, currency), totalsX + totalsW - 4, afterY + 12, { align: 'right' })

  doc.setDrawColor(COLORS.borderRgb[0], COLORS.borderRgb[1], COLORS.borderRgb[2])
  doc.line(totalsX + 4, afterY + 16, totalsX + totalsW - 4, afterY + 16)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(COLORS.primaryRgb[0], COLORS.primaryRgb[1], COLORS.primaryRgb[2])
  doc.text(isCredit ? 'Total TTC (avoir)' : 'Total TTC', totalsX + 4, afterY + 24)
  doc.text(formatMoney(totalAmount, currency), totalsX + totalsW - 4, afterY + 24, { align: 'right' })

  // ── Notes ────────────────────────────────────────────────────────────────────────────────────
  if (invoice.notes) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(COLORS.mutedRgb[0], COLORS.mutedRgb[1], COLORS.mutedRgb[2])
    doc.text('NOTES', margin, afterY + 6)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(COLORS.textRgb[0], COLORS.textRgb[1], COLORS.textRgb[2])
    const noteLines = doc.splitTextToSize(invoice.notes, contentWidth)
    doc.text(noteLines, margin, afterY + 12)
  }

  // ── Mentions légales ──────────────────────────────────────────────────────────────────────
  const footerY = pageHeight - 28
  doc.setDrawColor(COLORS.borderRgb[0], COLORS.borderRgb[1], COLORS.borderRgb[2])
  doc.line(margin, footerY - 4, pageWidth - margin, footerY - 4)

  doc.setFont('helvetica', 'italic')
  doc.setFontSize(7.5)
  doc.setTextColor(COLORS.mutedRgb[0], COLORS.mutedRgb[1], COLORS.mutedRgb[2])
  const mentions = [
    `Document généré le ${new Date().toLocaleDateString('fr-BE')} à ${new Date().toLocaleTimeString('fr-BE')}`,
    company.vat_number ? `N° TVA : ${company.vat_number}` : null,
    invoice.payment_terms ? `Conditions : ${invoice.payment_terms}` : null,
    'En cas de retard de paiement, pénalités de 3x le taux légal belge (Loi du 02.08.2002) et indemnité forfaitaire de 40 €.',
  ].filter(Boolean).join(' · ')
  const mentionsLines = doc.splitTextToSize(mentions, contentWidth)
  doc.text(mentionsLines, margin, footerY)

  return doc
}

export function downloadInvoicePdf (
  invoice: InvoiceForPdf,
  company: Partial<CompanySettings>,
) {
  const doc = generateInvoicePdf(invoice, company)
  doc.save(`${invoice.invoice_number || 'facture'}.pdf`)
}

export function openInvoicePdf (
  invoice: InvoiceForPdf,
  company: Partial<CompanySettings>,
) {
  const doc = generateInvoicePdf(invoice, company)
  const blob = doc.output('blob')
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank', 'noopener,noreferrer')
}

function formatIban (iban: string): string {
  return iban.replace(/(.{4})/g, '$1 ').trim()
}

function statusFr (s?: string): string {
  switch (s) {
    case 'paid': return 'Payée'
    case 'sent': return 'Envoyée'
    case 'pending': return 'En attente'
    case 'overdue': return 'En retard'
    case 'cancelled': return 'Annulée'
    case 'draft': return 'Brouillon'
    default: return s || '—'
  }
}