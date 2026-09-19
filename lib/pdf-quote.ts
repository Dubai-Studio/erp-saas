/**
 * Génération PDF — Devis (quote).
 *
 * Différences avec une facture :
 *  - Titre "DEVIS"
 *  - Mention de validité (ex : 30 jours)
 *  - Pas de numéro de TVA obligatoire côté mentions
 *  - Pas de date d'échéance (mais une date de validité)
 *  - Ligne "Bon pour accord" + signature client
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

export interface QuoteForPdf {
  quote_number: string
  status?: string
  issue_date: string | null
  validity_date: string | null                  // ex: +30 jours
  payment_terms?: string | null
  client?: ClientLite | null
  client_name?: string | null
  lines: Array<{ description: string; quantity: number; unit_price: number; vat_rate: number; total?: number }>
  notes?: string | null
  currency?: string
  subtotal?: number
  vat_amount?: number
  total_amount?: number
}

const COLORS = {
  primary: [30, 58, 95] as [number, number, number],
  primaryRgb: [30, 58, 95] as [number, number, number],
  text: [15, 23, 42] as [number, number, number],
  muted: [100, 116, 139] as [number, number, number],
  border: [226, 232, 240] as [number, number, number],
  light: [248, 250, 252] as [number, number, number],
}

export function generateQuotePdf (quote: QuoteForPdf, company: Partial<CompanySettings>): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 15
  const contentW = pageWidth - 2 * margin

  // En-tête société
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(...COLORS.primary)
  doc.text(company.company_name || 'Votre société', margin, margin + 8)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...COLORS.muted)
  let y = margin + 14
  for (const line of [
    company.address,
    [company.zip_code, company.city].filter(Boolean).join(' '),
    company.country,
    company.vat_number ? `TVA : ${company.vat_number}` : null,
    company.email,
    company.phone,
  ].filter(Boolean) as string[]) {
    doc.text(line, margin, y)
    y += 4
  }

  // Titre
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(32)
  doc.setTextColor(...COLORS.primary)
  doc.text('DEVIS', pageWidth - margin, margin + 12, { align: 'right' })

  doc.setFontSize(11)
  doc.setTextColor(...COLORS.text)
  doc.text(`N° ${quote.quote_number}`, pageWidth - margin, margin + 20, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...COLORS.muted)
  let ry = margin + 26
  for (const [label, value] of [
    ['Date d\'émission', formatDate(quote.issue_date)],
    ['Validité',         formatDate(quote.validity_date)],
  ] as const) {
    doc.text(`${label} :`, pageWidth - margin - 50, ry)
    doc.setTextColor(...COLORS.text)
    doc.text(value, pageWidth - margin, ry, { align: 'right' })
    doc.setTextColor(...COLORS.muted)
    ry += 5
  }

  // Bloc client
  const clientY = Math.max(y, ry) + 8
  doc.setFillColor(...COLORS.light)
  doc.rect(margin, clientY, contentW, 28, 'F')
  doc.setDrawColor(...COLORS.border)
  doc.rect(margin, clientY, contentW, 28, 'S')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...COLORS.muted)
  doc.text('DESTINATAIRE', margin + 4, clientY + 5)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...COLORS.text)
  doc.text(quote.client?.name || quote.client_name || '—', margin + 4, clientY + 11)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...COLORS.muted)
  let cy = clientY + 16
  for (const line of [
    quote.client?.address,
    [quote.client?.zip_code, quote.client?.city].filter(Boolean).join(' '),
    quote.client?.country,
    quote.client?.vat_number ? `TVA : ${quote.client.vat_number}` : null,
    quote.client?.email,
  ].filter(Boolean) as string[]) {
    doc.text(line, margin + 4, cy)
    cy += 4
  }

  // Lignes
  const typedLines = quote.lines.map((l) => ({
    description: l.description,
    quantity: l.quantity,
    unit_price: l.unit_price,
    vat_rate: l.vat_rate ?? 0,
    total: l.total ?? (l.quantity * l.unit_price),
  }))
  const totals = computeInvoiceTotals(typedLines)
  const subtotal = quote.subtotal ?? totals.subtotal
  const vatAmount = quote.vat_amount ?? totals.vat_amount
  const totalAmount = quote.total_amount ?? totals.total
  const currency = quote.currency || company.default_currency || 'EUR'

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
    headStyles: { fillColor: COLORS.primary, textColor: [255,255,255], fontStyle: 'bold', fontSize: 9 },
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
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(...COLORS.muted)
      doc.text(`${quote.quote_number} · page ${doc.getNumberOfPages()}`, pageWidth / 2, pageHeight - 8, { align: 'center' })
    },
  })

  // @ts-ignore
  const afterY: number = (doc.lastAutoTable?.finalY ?? clientY + 50) + 8

  // Totaux
  const totalsX = pageWidth - margin - 70
  const totalsW = 70
  doc.setFillColor(...COLORS.light)
  doc.rect(totalsX, afterY, totalsW, 32, 'F')
  doc.setDrawColor(...COLORS.border)
  doc.rect(totalsX, afterY, totalsW, 32, 'S')
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
  doc.text('Total TTC', totalsX + 4, afterY + 24)
  doc.text(formatMoney(totalAmount, currency), totalsX + totalsW - 4, afterY + 24, { align: 'right' })

  // Notes
  if (quote.notes) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...COLORS.muted)
    doc.text('NOTES', margin, afterY + 6)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...COLORS.text)
    const noteLines = doc.splitTextToSize(quote.notes, contentW)
    doc.text(noteLines, margin, afterY + 12)
  }

  // BON POUR ACCORD (signature client)
  const bpaY = pageHeight - 56
  doc.setDrawColor(...COLORS.border)
  doc.line(margin, bpaY - 4, pageWidth - margin, bpaY - 4)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...COLORS.text)
  doc.text('BON POUR ACCORD', margin, bpaY)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...COLORS.muted)
  const bpaText = [
    `Le client reconnaît avoir pris connaissance des conditions générales et accepte le présent devis.`,
    `Validité de l'offre : ${formatDate(quote.validity_date)}. Au-delà, le devis devra être réactualisé.`,
    quote.payment_terms ? `Conditions : ${quote.payment_terms}` : null,
  ].filter(Boolean) as string[]
  const bpaLines = doc.splitTextToSize(bpaText.join(' '), contentW)
  doc.text(bpaLines, margin, bpaY + 6)

  // Signature
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...COLORS.text)
  doc.text('Date : ____________________', margin, bpaY + 24)
  doc.text('Signature et cachet :', pageWidth / 2, bpaY + 24)

  return doc
}

export function downloadQuote (quote: QuoteForPdf, company: Partial<CompanySettings>) {
  const doc = generateQuotePdf(quote, company)
  doc.save(`${quote.quote_number}.pdf`)
}

export function openQuote (quote: QuoteForPdf, company: Partial<CompanySettings>) {
  const doc = generateQuotePdf(quote, company)
  const blob = doc.output('blob')
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank', 'noopener,noreferrer')
}