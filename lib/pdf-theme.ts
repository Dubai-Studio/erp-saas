/**
 * Thème PDF unifié pour tous les documents Next.ERP-Pro
 * ─────────────────────────────────────────────────────────
 *  - Couleurs cohérentes (factures, devis, interventions, fiches de paie)
 *  - Header entreprise partagé (logo, nom, adresse, BCE/TVA, IBAN, contact)
 *  - Footer unifié (mentions légales, BCE, contact, génération)
 *
 * Toute modification de palette ou de mise en page doit se faire ici
 * pour rester cohérent entre tous les PDFs.
 */
import jsPDF from 'jspdf'
import { formatDate } from './format'
import type { CompanySettings } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Palette unique — partagée par TOUS les PDFs
// ─────────────────────────────────────────────────────────────────────────────
export const COLORS = {
  primary:   [30, 58, 95]   as [number, number, number],   // navy — header, titres
  primaryDk: [22, 33, 62]   as [number, number, number],   // navy foncé — accents
  accent:    [59, 130, 246] as [number, number, number],   // bleu vif — boutons, focus
  success:   [16, 185, 129] as [number, number, number],   // vert — paiements, validations
  danger:    [220, 38, 38]  as [number, number, number],   // rouge — retenues, alertes
  warning:   [245, 158, 11] as [number, number, number],   // orange — en attente
  text:      [15, 23, 42]   as [number, number, number],   // texte principal
  muted:     [100, 116, 139] as [number, number, number], // texte secondaire
  border:    [226, 232, 240] as [number, number, number], // bordures
  light:     [248, 250, 252] as [number, number, number], // fonds alternatifs
  white:     [255, 255, 255] as [number, number, number],
} as const

export const HEX = {
  primary:   '#1e3a5f',
  primaryDk: '#16213e',
  accent:    '#3b82f6',
  success:   '#10b981',
  danger:    '#dc2626',
  warning:   '#f59e0b',
  text:      '#0f172a',
  muted:     '#64748b',
  border:    '#e2e8f0',
  light:     '#f8fafc',
} as const

// ─────────────────────────────────────────────────────────────────────────────
// Type de document — pour le footer "Nature du document"
// ─────────────────────────────────────────────────────────────────────────────
export type DocKind = 'INVOICE' | 'QUOTE' | 'CREDIT' | 'PROFORMA' | 'PAYSLIP' | 'INTERVENTION'

export const DOC_TITLES: Record<DocKind, string> = {
  INVOICE:      'FACTURE',
  QUOTE:        'DEVIS',
  CREDIT:       'AVOIR',
  PROFORMA:     'FACTURE PROFORMA',
  PAYSLIP:      'FICHE DE PAIE',
  INTERVENTION: 'FICHE D\'INTERVENTION',
}

export const DOC_SUBTITLES: Record<DocKind, string> = {
  INVOICE:      'Document commercial — à conserver 10 ans',
  QUOTE:        'Offre commerciale — non contractuelle',
  CREDIT:       'Note de crédit',
  PROFORMA:     'Facture proforma — non comptabilisable',
  PAYSLIP:      'Document de paie — à conserver 5 ans',
  INTERVENTION: 'Rapport d\'intervention — à conserver 5 ans',
}

// ─────────────────────────────────────────────────────────────────────────────
// Header entreprise — commun à tous les PDFs
// ─────────────────────────────────────────────────────────────────────────────
export interface HeaderOptions {
  /** Type de document (affiche "FICHE DE PAIE" / "FACTURE" / etc. en haut à droite) */
  kind: DocKind
  /** Référence du document (numéro de facture, période, etc.) */
  reference?: string
  /** Date du document (alignée à droite) */
  documentDate?: string | null
  /** Échéance ou date de versement (alignée à droite, sous documentDate) */
  secondaryDate?: string | null
  /** Label de la secondaryDate ("Échéance" / "Versement" / "Date d'intervention") */
  secondaryLabel?: string
}

export function drawHeader(
  doc: jsPDF,
  company: Partial<CompanySettings>,
  opts: HeaderOptions,
): number {
  const margin = 15
  const pageWidth = doc.internal.pageSize.getWidth()
  let y = margin

  // ── Bandeau navy en haut (bande décorative fine) ──
  doc.setFillColor(...COLORS.primary)
  doc.rect(0, 0, pageWidth, 4, 'F')
  doc.setFillColor(...COLORS.accent)
  doc.rect(0, 4, pageWidth, 1.5, 'F')

  // ── Bloc société (gauche) ──
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(...COLORS.primary)
  doc.text(company.company_name || 'Votre société', margin, margin + 10)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...COLORS.muted)
  y = margin + 16
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

  // ── Bloc type de document (droite) ──
  const rightX = pageWidth - margin
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(...COLORS.primary)
  doc.text(DOC_TITLES[opts.kind], rightX, margin + 10, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...COLORS.muted)
  doc.text(DOC_SUBTITLES[opts.kind], rightX, margin + 16, { align: 'right' })

  if (opts.reference) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...COLORS.text)
    doc.text(opts.reference, rightX, margin + 24, { align: 'right' })
  }
  if (opts.documentDate) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...COLORS.text)
    doc.text(`Émis le : ${formatDate(opts.documentDate)}`, rightX, margin + 30, { align: 'right' })
  }
  if (opts.secondaryDate) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...COLORS.muted)
    const label = opts.secondaryLabel ?? 'Date'
    doc.text(`${label} : ${formatDate(opts.secondaryDate)}`, rightX, margin + 35, { align: 'right' })
  }

  // ── Ligne de séparation ──
  const sepY = Math.max(y + 4, margin + 42)
  doc.setDrawColor(...COLORS.border)
  doc.setLineWidth(0.4)
  doc.line(margin, sepY, pageWidth - margin, sepY)

  return sepY + 6
}

// ─────────────────────────────────────────────────────────────────────────────
// Footer unifié — page X de Y + mentions légales + contacts
// ─────────────────────────────────────────────────────────────────────────────
export function drawFooter(
  doc: jsPDF,
  company: Partial<CompanySettings>,
  opts: { kind: DocKind; legal?: string[] },
): void {
  const margin = 15
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const footerY = pageHeight - 24

  // ── Ligne de séparation ──
  doc.setDrawColor(...COLORS.border)
  doc.setLineWidth(0.4)
  doc.line(margin, footerY - 4, pageWidth - margin, footerY - 4)

  // ── Bloc mentions légales (gauche) ──
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(7.5)
  doc.setTextColor(...COLORS.muted)
  const legalLines = (opts.legal ?? [
    DOC_SUBTITLES[opts.kind],
    company.vat_number ? `N° entreprise : ${company.vat_number}` : null,
    company.iban ? `IBAN société : ${company.iban.replace(/(.{4})/g, '$1 ').trim()}` : null,
    company.email ? `Contact : ${company.email}` : null,
    company.phone ? `Tél : ${company.phone}` : null,
    'Document généré par Next.ERP-Pro',
  ]).filter(Boolean) as string[]

  let y = footerY
  const contentWidth = pageWidth - 2 * margin - 50  // laisse 50mm à droite pour "Page X/Y"
  for (const line of legalLines) {
    const wrapped = doc.splitTextToSize(line, contentWidth)
    doc.text(wrapped, margin, y)
    y += wrapped.length * 3
    if (y > pageHeight - 8) break
  }

  // ── Pagination + label doc (droite) ──
  const pageStr = `Page ${doc.getNumberOfPages ? '' : ''}${doc.internal.getCurrentPageInfo().pageStr ?? doc.getCurrentPageInfo?.() ?? ''}`.replace(/\s+/g, ' ').trim() || `Page ${doc.getCurrentPageInfo().pageNumber}`
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...COLORS.muted)
  doc.text(pageStr, pageWidth - margin, footerY, { align: 'right' })
  doc.text(DOC_TITLES[opts.kind], pageWidth - margin, footerY + 4, { align: 'right' })
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers communs
// ─────────────────────────────────────────────────────────────────────────────
export function fmtMoney(n: number, currency = 'EUR'): string {
  if (!Number.isFinite(n)) return '—'
  return new Intl.NumberFormat('fr-BE', {
    style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n)
}

export function fmtNumber(n: number, decimals = 2): string {
  if (!Number.isFinite(n)) return '—'
  return new Intl.NumberFormat('fr-BE', {
    minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  }).format(n)
}

export function fmtIban(iban: string): string {
  return iban.replace(/(.{4})/g, '$1 ').trim()
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}
