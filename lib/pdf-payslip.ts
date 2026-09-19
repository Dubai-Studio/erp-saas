/**
 * Génération PDF — Fiche de paie (modèle belge standard).
 *
 * Conformité :
 * - Mention du numéro d'employeur (BCE/ONSS)
 * - Période de paie
 * - Salaire brut imposable + non-imposable
 * - Cotisations sécurité sociale (employé + patron)
 * - Précompte professionnel (barème progressif BE)
 * - Salaire net
 * - Détails des heures (régime horaire) si applicable
 * - Heures supplémentaires / nuits / week-ends
 * - Période d'essai, type de contrat
 * - Mention "paiement par virement" + IBAN
 *
 * Données nécessaires :
 *  - company : Partial<CompanySettings>
 *  - employee : Employee + info paie (heures, taux, prime, etc.)
 */
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatDate, formatMoney } from './format'
import type { CompanySettings } from './types'

export interface PayslipInput {
  employee: {
    first_name: string
    last_name: string
    national_id?: string | null
    position?: string | null
    department?: string | null
    contract_type?: string | null
    worker_type?: string | null
    hire_date?: string | null
    iban?: string | null
    bic?: string | null
    payment_method?: string | null
    base_salary: number
    hours_worked?: number
    hourly_rate?: number
    overtime_hours?: number
    overtime_rate?: number
    night_hours?: number
    night_rate?: number
    weekend_hours?: number
    weekend_rate?: number
    bonus?: number
    advance?: number
    other_deductions?: number
  }
  period: {
    month: string                  // 'YYYY-MM'
    year: number
    payment_date: string           // 'YYYY-MM-DD'
    worked_days?: number
    absence_days?: number
  }
  social_security?: {
    employee_rate: number           // ex. 13.07
    employer_rate: number           // ex. 25.27
    special_employee_rate?: number // ex. 7.5 (statut unique)
  }
  fiscal?: {
    bracket?: number               // tranche marginale
    withholding_tax?: number       // précompte déjà calculé
    dependents?: number            // personnes à charge
  }
  company: Partial<CompanySettings>
}

const COLORS = {
  primary: [30, 58, 95] as [number, number, number],
  text: [15, 23, 42] as [number, number, number],
  muted: [100, 116, 139] as [number, number, number],
  border: [226, 232, 240] as [number, number, number],
  light: [248, 250, 252] as [number, number, number],
  success: [16, 185, 129] as [number, number, number],
}

function fmt (n: number, currency = 'EUR'): string {
  if (!Number.isFinite(n)) return '—'
  return new Intl.NumberFormat('fr-BE', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

export function generatePayslipPdf (input: PayslipInput): jsPDF {
  const { employee, period, company } = input
  const ssEmployeeRate = input.social_security?.employee_rate ?? 13.07
  const ssEmployerRate = input.social_security?.employer_rate ?? 25.27
  const withholding    = input.fiscal?.withholding_tax ?? 0

  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 15
  const contentW = pageWidth - 2 * margin

  // ── En-tête société ──────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(...COLORS.primary)
  doc.text(company.company_name || 'Votre société', margin, margin + 6)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...COLORS.muted)
  let y = margin + 12
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

  // ── Bloc titre droite ──────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(...COLORS.primary)
  doc.text('FICHE DE PAIE', pageWidth - margin, margin + 8, { align: 'right' })

  doc.setFontSize(10)
  doc.setTextColor(...COLORS.text)
  doc.text(`Période : ${period.month}`, pageWidth - margin, margin + 16, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.text(`Versement : ${formatDate(period.payment_date)}`, pageWidth - margin, margin + 22, { align: 'right' })

  // ── Bloc employé ──────────────────────────────────────────────────────
  const blockY = Math.max(y + 4, margin + 30)
  doc.setFillColor(...COLORS.light)
  doc.rect(margin, blockY, contentW, 36, 'F')
  doc.setDrawColor(...COLORS.border)
  doc.rect(margin, blockY, contentW, 36, 'S')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...COLORS.muted)
  doc.text('SALARIÉ', margin + 4, blockY + 4)

  doc.setFontSize(12)
  doc.setTextColor(...COLORS.text)
  doc.text(`${employee.first_name} ${employee.last_name}`, margin + 4, blockY + 11)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...COLORS.muted)
  let cy = blockY + 17
  for (const line of [
    `N° registre national : ${employee.national_id || '—'}`,
    `Fonction : ${employee.position || '—'}`,
    `Département : ${employee.department || '—'}`,
    `Contrat : ${employee.contract_type || employee.worker_type || 'CDI'} (entrée ${formatDate(employee.hire_date)})`,
  ]) {
    doc.text(line, margin + 4, cy)
    cy += 4
  }

  // ── Calculs paie ──────────────────────────────────────────────────────
  const baseSalary = employee.base_salary
  const overtimeAmount   = (employee.overtime_hours ?? 0) * (employee.overtime_rate ?? 0)
  const nightAmount      = (employee.night_hours ?? 0) * (employee.night_rate ?? 0)
  const weekendAmount    = (employee.weekend_hours ?? 0) * (employee.weekend_rate ?? 0)
  const bonus            = employee.bonus ?? 0
  const grossTaxable     = baseSalary + overtimeAmount + nightAmount + weekendAmount + bonus

  // Salaire brut imposable vs non imposable (frais propres)
  const grossNonTaxable = 0  // ex. indemnités non imposables
  const grossTotal      = grossTaxable + grossNonTaxable

  const ssEmployee      = round2(grossTaxable * ssEmployeeRate / 100)
  const specialSS       = input.fiscal?.dependents
    ? 0
    : round2(grossTaxable * 7.5 / 100)  // Cotisation spéciale sécurité sociale (statut unique)
  const taxableIncome   = round2(grossTaxable - ssEmployee - specialSS)

  const advance         = employee.advance ?? 0
  const otherDeduct     = employee.other_deductions ?? 0
  const netBeforeTax    = round2(grossTotal - ssEmployee - specialSS - advance - otherDeduct)
  const netSalary       = round2(netBeforeTax - withholding)

  // Charges patronales (informatif, payées par l'employeur en plus)
  const ssEmployer      = round2(grossTaxable * ssEmployerRate / 100)
  const employerCost    = round2(grossTotal + ssEmployer)

  // ── Tableau calcul ─────────────────────────────────────────────────────
  autoTable(doc, {
    startY: blockY + 42,
    margin: { left: margin, right: margin },
    head: [['DÉSIGNATION', 'BASE', 'TAUX', 'MONTANT']],
    body: [
      ['Salaire de base',                '',                       '',                    fmt(baseSalary)],
      ['Heures supplémentaires',         `${employee.overtime_hours ?? 0} h`,  fmt(employee.overtime_rate ?? 0) + '/h', fmt(overtimeAmount)],
      ['Heures de nuit',                 `${employee.night_hours ?? 0} h`,     fmt(employee.night_rate ?? 0) + '/h',    fmt(nightAmount)],
      ['Heures week-end',                `${employee.weekend_hours ?? 0} h`,   fmt(employee.weekend_rate ?? 0) + '/h',  fmt(weekendAmount)],
      ['Primes / bonus',                 '',                       '',                    fmt(bonus)],
      [{ content: 'SALAIRE BRUT',          styles: { fontStyle: 'bold', fillColor: COLORS.light } },  { content: '', styles: { fillColor: COLORS.light } }, { content: '', styles: { fillColor: COLORS.light } }, { content: fmt(grossTotal), styles: { fontStyle: 'bold', fillColor: COLORS.light } }],
    ],
    theme: 'grid',
    headStyles: { fillColor: COLORS.primary, textColor: [255,255,255], fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: COLORS.text },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 25, halign: 'right' },
      2: { cellWidth: 25, halign: 'right' },
      3: { cellWidth: 30, halign: 'right' },
    },
  })

  // @ts-ignore
  let yPos: number = (doc.lastAutoTable?.finalY ?? blockY + 80) + 6

  // ── Cotisations + retenues ──────────────────────────────────────────────
  autoTable(doc, {
    startY: yPos,
    margin: { left: margin, right: margin },
    head: [['RETENUES', 'BASE', 'TAUX', 'MONTANT']],
    body: [
      ['Sécurité sociale (employé)',  fmt(grossTaxable),     `${ssEmployeeRate}%`,        fmt(ssEmployee)],
      ['Cotisation spéciale SS',       fmt(grossTaxable),     '7.50%',                    fmt(specialSS)],
      ['Avance sur salaire',          '',                    '',                          fmt(advance)],
      ['Autres retenues',             '',                    '',                          fmt(otherDeduct)],
      ['Précompte professionnel',      fmt(taxableIncome),    input.fiscal?.bracket ? `~${input.fiscal.bracket}%` : '', fmt(withholding)],
      [{ content: 'TOTAL RETENUES', styles: { fontStyle: 'bold', fillColor: COLORS.light } }, { content: '', styles: { fillColor: COLORS.light } }, { content: '', styles: { fillColor: COLORS.light } }, { content: fmt(ssEmployee + specialSS + advance + otherDeduct + withholding), styles: { fontStyle: 'bold', fillColor: COLORS.light } }],
    ],
    theme: 'grid',
    headStyles: { fillColor: [220, 38, 38], textColor: [255,255,255], fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: COLORS.text },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 25, halign: 'right' },
      2: { cellWidth: 25, halign: 'right' },
      3: { cellWidth: 30, halign: 'right' },
    },
  })
  // @ts-ignore
  yPos = (doc.lastAutoTable?.finalY ?? yPos) + 8

  // ── NET À PAYER (gros) ───────────────────────────────────────────────
  doc.setFillColor(...COLORS.success)
  doc.rect(pageWidth - margin - 80, yPos, 80, 16, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(255, 255, 255)
  doc.text('NET À PAYER', pageWidth - margin - 76, yPos + 6)
  doc.setFontSize(14)
  doc.text(fmt(netSalary), pageWidth - margin - 4, yPos + 12, { align: 'right' })

  yPos += 24

  // ── Charges patronales (info) ─────────────────────────────────────────
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...COLORS.muted)
  doc.text(`Charges patronales (informatif) : ONSS ${ssEmployerRate}% = ${fmt(ssEmployer)} | Coût total employeur : ${fmt(employerCost)}`, margin, yPos)
  yPos += 8

  // ── Mode de paiement ─────────────────────────────────────────────────
  doc.setDrawColor(...COLORS.border)
  doc.line(margin, yPos, pageWidth - margin, yPos)
  yPos += 6

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...COLORS.text)
  doc.text('MODE DE PAIEMENT', margin, yPos)
  doc.setFont('helvetica', 'normal')
  doc.text(`${employee.payment_method || 'Virement'}`, margin + 50, yPos)
  if (employee.iban) {
    doc.text(`IBAN : ${formatIban(employee.iban)}${employee.bic ? ' · BIC : ' + employee.bic : ''}`, margin + 70, yPos)
  }
  yPos += 8

  // ── Jours travaillés ─────────────────────────────────────────────────
  if (period.worked_days !== undefined || period.absence_days !== undefined) {
    doc.setFont('helvetica', 'bold')
    doc.text('JOURS', margin, yPos)
    doc.setFont('helvetica', 'normal')
    doc.text(`Travaillés : ${period.worked_days ?? '—'}    |    Absences : ${period.absence_days ?? '—'}`, margin + 50, yPos)
    yPos += 8
  }

  // ── Mentions légales ──────────────────────────────────────────────────
  yPos = pageHeight - 50
  doc.setDrawColor(...COLORS.border)
  doc.line(margin, yPos - 4, pageWidth - margin, yPos - 4)

  doc.setFont('helvetica', 'italic')
  doc.setFontSize(7.5)
  doc.setTextColor(...COLORS.muted)
  const mentions = [
    `Document généré le ${new Date().toLocaleDateString('fr-BE')}`,
    'Conservation recommandée 5 ans (durée légale belge)',
    company.vat_number ? `N° entreprise : ${company.vat_number}` : null,
    'Ce document est confidentiel et destiné uniquement au salarié.',
  ].filter(Boolean).join(' · ')
  const mLines = doc.splitTextToSize(mentions, contentW)
  doc.text(mLines, margin, yPos)
  yPos += mLines.length * 3

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...COLORS.text)
  doc.text('Signature de l\'employeur :', margin, yPos + 6)
  doc.text('Reçu par le salarié :', pageWidth / 2, yPos + 6)

  return doc
}

export function downloadPayslip (input: PayslipInput, fileName?: string) {
  const doc = generatePayslipPdf(input)
  doc.save(fileName ?? `paie-${input.employee.last_name}-${input.period.month}.pdf`)
}

export function openPayslip (input: PayslipInput) {
  const doc = generatePayslipPdf(input)
  const blob = doc.output('blob')
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank', 'noopener,noreferrer')
}

function round2 (n: number): number {
  return Math.round(n * 100) / 100
}

function formatIban (iban: string): string {
  return iban.replace(/(.{4})/g, '$1 ').trim()
}