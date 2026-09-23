/**
 * Génération PDF de facture conforme (BE/UE).
 *
 * - typo soignée (helvetica + fallbacks Unicode)
 * - mentions légales belges obligatoires (TVA, n° BCE si dispo)
 * - multi-page automatique si > N lignes
 * - numérotation officielle FAC-YYYY-NNNNNN
 * - support avoir (credit_note) avec libellé "AVOIR"
 * - totaux HT / TVA / TTC bien lisibles
 * - Header/Footer/Couleurs : utilise le theme PDF unifie (lib/pdf-theme)
 *
 * On garde jsPDF + jspdf-autotable pour éviter une dépendance native
 * côté serveur. Génération côté client uniquement pour cette V1.
 */
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatDate, formatMoney } from './format'
import { computeInvoiceTotals } from './calculations'
import type { CompanySettings } from './types'
import { COLORS, drawHeader, drawFooter, type DocKind } from './pdf-theme'

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

/** Mappe type interne → DocKind pour le header unifié */
function invoiceTypeToDocKind(type: InvoiceForPdf['type']): DocKind {
  switch (type) {
    case 'credit_note': return 'CREDIT'
    case 'quote':       return 'QUOTE'
    case 'proforma':    return 'PROFORMA'
    default:            return 'INVOICE'
  }
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

  // ── En-tête entreprise (theme partagé) ─────────────────────────────
  const y = drawHeader(doc, company, {
    kind: invoiceTypeToDocKind(invoice.type),
    reference: invoice.invoice_number,
    documentDate: invoice.issue_date,
    secondaryDate: invoice.due_date,
    secondaryLabel: "Date d'échéance",
  })

  // ── Bloc client ─────────────────────────────────────────────
  const clientY = y
  doc.setFillColor(...COLORS.light)
  doc.setDrawColor(...COLORS.border)
  doc.roundedRect(margin, clientY, contentWidth, 28, 2, 2, 'FD')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...COLORS.muted)
  doc.text('FACTURÉ À', margin + 4, clientY + 5)

  doc.setFontSize(13)
  doc.setTextColor(...COLORS.primary)
  doc.text(invoice.client?.name || invoice.client_name || '—', margin + 4, clientY + 12)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...COLORS.text)
  let cy = clientY + 18
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

  // Statut en haut à droite (badge)
  const statusLabel = statusFr(invoice.status)
  const badgeColors: Record<string, [number, number, number]> = {
    'paid':     COLORS.success,
    'sent':     COLORS.accent,
    'pending':  COLORS.warning,
    'overdue':  COLORS.danger,
    'cancelled': [148, 163, 184],
    'draft':    [148, 163, 184],
  }
  const badgeColor = badgeColors[invoice.status ?? ''] ?? COLORS.muted
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  const statusW = doc.getTextWidth(statusLabel) + 8
  doc.setFillColor(...badgeColor)
  doc.roundedRect(pageWidth - margin - statusW, clientY + 4, statusW, 8, 1.5, 1.5, 'F')
  doc.setTextColor(...COLORS.white)
  doc.text(statusLabel, pageWidth - margin - statusW / 2, clientY + 9.5, { align: 'center' })

  // ── Tableau des lignes ─────────────────────────────────────
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
      fillColor: COLORS.primary,
      textColor: COLORS.white,
      fontStyle: 'bold',
      fontSize: 9,
    },
    bodyStyles: { fontSize: 9, textColor: COLORS.text },
    alternateRowStyles: { fillColor: COLORS.light },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 18, halign: 'right' },
      2: { cellWidth: 30, halign: 'right' },
      3: { cellWidth: 18, halign: 'right' },
      4: { cellWidth: 32, halign: 'right' },
    },
    didDrawPage: () => {
      // Footer à chaque page — theme partagé
      drawFooter(doc, company, { kind: invoiceTypeToDocKind(invoice.type) })
    },
  })

  // ── Bloc totaux ────────────────────────────────────────────
  // @ts-ignore — lastAutoTable est injecté par jspdf-autotable
  const afterY: number = (doc.lastAutoTable?.finalY ?? clientY + 50) + 8
  const totalsX = pageWidth - margin - 70
  const totalsW = 70
  const totalsH = isCredit ? 38 : 32

  doc.setFillColor(...COLORS.light)
  doc.roundedRect(totalsX, afterY, totalsW, totalsH, 2, 2, 'F')
  doc.setDrawColor(...COLORS.border)
  doc.roundedRect(totalsX, afterY, totalsW, totalsH, 2, 2, 'S')

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...COLORS.muted)
  doc.text('Sous-total HT', totalsX + 4, afterY + 6)
  doc.setTextColor(...COLORS.text)
  doc.text(formatMoney(subtotal, currency), totalsX + totalsW - 4, afterY + 6, { align: 'right' })

  doc.setTextColor(...COLORS.muted)
  doc.text('TVA', totalsX + 4, afterY + 12)
  doc.setTextColor(...COLORS.text)
  doc.text(formatMoney(vatAmount, currency), totalsX + totalsW - 4, afterY + 12, { align: 'right' })

  doc.setDrawColor(...COLORS.border)
  doc.line(totalsX + 4, afterY + 16, totalsX + totalsW - 4, afterY + 16)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...COLORS.primary)
  doc.text(isCredit ? 'Total TTC (avoir)' : 'Total TTC', totalsX + 4, afterY + 24)
  doc.text(formatMoney(totalAmount, currency), totalsX + totalsW - 4, afterY + 24, { align: 'right' })

  // ── Notes ──────────────────────────────────────────────────
  if (invoice.notes) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...COLORS.muted)
    doc.text('NOTES', margin, afterY + 6)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...COLORS.text)
    const noteLines = doc.splitTextToSize(invoice.notes, contentWidth)
    doc.text(noteLines, margin, afterY + 12)
  }

  // Footer final sur la dernière page
  drawFooter(doc, company, {
    kind: invoiceTypeToDocKind(invoice.type),
    legal: [
      `Document généré le ${new Date().toLocaleDateString('fr-BE')} à ${new Date().toLocaleTimeString('fr-BE')}`,
      company.vat_number ? `N° TVA : ${company.vat_number}` : null,
      invoice.payment_terms ? `Conditions : ${invoice.payment_terms}` : null,
      'En cas de retard de paiement, pénalités de 3x le taux légal belge (Loi du 02.08.2002) et indemnité forfaitaire de 40 €.',
    ],
  })

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
