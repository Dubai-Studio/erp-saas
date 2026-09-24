/**
 * Génération PDF — Fiche de paie belge (modèle complet)
 * ───────────────────────────────────────────────────────
 * Utilise le thème PDF unifié (lib/pdf-theme) pour la couleur, le header
 * entreprise et le footer mentions légales.
 *
 * Conformité légale belge :
 *  - Période de paie + date de versement
 *  - Identification salarié (nom, NN, fonction, département, type de contrat, date d'entrée)
 *  - Salaire brut imposable / non-imposable décomposé
 *  - Détail heures (régulier + supp + nuit + week-end) avec taux horaire
 *  - Cotisations ONSS employé + cotisation spéciale SS + précompte professionnel
 *  - Cumul brut / cotisations / net YTD (depuis janvier)
 *  - Solde congés (si fourni)
 *  - Mode de paiement + IBAN + BIC + date virement
 *  - Coût total employeur (charges patronales incluses)
 *  - Mentions légales : conservation 5 ans, BCE, N° entreprise
 *  - Double signature : employeur + salarié
 */
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatDate } from './format'
import type { CompanySettings } from './types'
import { COLORS, DOC_TITLES, DOC_SUBTITLES, drawHeader, drawFooter, fmtMoney, fmtNumber, fmtIban, round2, type DocKind } from './pdf-theme'

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
    payment_day?: number | null
    base_salary: number
    hourly_rate?: number
    hours_worked?: number
    overtime_hours?: number
    overtime_rate?: number
    night_hours?: number
    night_rate?: number
    weekend_hours?: number
    weekend_rate?: number
    bonus?: number
    advance?: number
    other_deductions?: number
    /** Heures contractuelles mensuelles (ex. 38h/sem × 52 / 12 = 164.67h) */
    contract_hours_month?: number
    /** Solde congés payés en jours (si fourni) */
    vacation_days_balance?: number
    /** Ancienneté en années (calculée ou fournie) */
    seniority_years?: number
  }
  period: {
    month: string                  // 'YYYY-MM'
    year: number
    payment_date: string           // 'YYYY-MM-DD'
    worked_days?: number
    absence_days?: number
    holiday_days?: number
    sick_days?: number
  }
  /** Cumul annuel depuis janvier (optionnel, agrégé côté API) */
  ytd?: {
    gross?: number
    ss_employee?: number
    withholding?: number
    net?: number
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

/**
 * Calcule le salaire mensuel à partir des heures et taux (régime horaire)
 * ou retourne le salaire de base directement (régime mensuel).
 */
function computeGross(input: PayslipInput): {
  baseSalary: number
  baseAmount: number
  overtimeAmount: number
  nightAmount: number
  weekendAmount: number
  bonus: number
  grossTaxable: number
  grossNonTaxable: number
  grossTotal: number
  totalHours: number
} {
  const e = input.employee
  const baseSalary = e.base_salary

  // Si heures contractuelles indiquées ET taux horaire → calcul "régime horaire"
  let baseAmount = baseSalary
  if (e.hourly_rate && e.hours_worked && e.contract_hours_month) {
    baseAmount = Math.min(e.hours_worked, e.contract_hours_month) * e.hourly_rate
  }

  const overtimeAmount = (e.overtime_hours ?? 0) * (e.overtime_rate ?? 0)
  const nightAmount    = (e.night_hours ?? 0)    * (e.night_rate ?? 0)
  const weekendAmount  = (e.weekend_hours ?? 0)  * (e.weekend_rate ?? 0)
  const bonus          = e.bonus ?? 0
  const grossTaxable   = baseAmount + overtimeAmount + nightAmount + weekendAmount + bonus
  const grossNonTaxable = 0 // ex. indemnités non imposables (placeholder)
  const grossTotal      = grossTaxable + grossNonTaxable
  const totalHours      = (e.hours_worked ?? 0) + (e.overtime_hours ?? 0)
                          + (e.night_hours ?? 0) + (e.weekend_hours ?? 0)

  return { baseSalary, baseAmount, overtimeAmount, nightAmount, weekendAmount, bonus, grossTaxable, grossNonTaxable, grossTotal, totalHours }
}

export function generatePayslipPdf(input: PayslipInput): jsPDF {
  const { employee, period, company } = input
  const ssEmployeeRate     = input.social_security?.employee_rate ?? 13.07
  const ssEmployerRate     = input.social_security?.employer_rate ?? 25.27
  const specialSSRate      = input.social_security?.special_employee_rate ?? 7.5
  const withholding        = input.fiscal?.withholding_tax ?? 0

  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth  = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin     = 15
  const contentW   = pageWidth - 2 * margin

  // ── En-tête société (theme partagé) ─────────────────────────────────────
  const periodLabel = formatMonthYear(period.month)
  let y = drawHeader(doc, company, {
    kind: 'PAYSLIP',
    reference: periodLabel,
    documentDate: period.payment_date,
    secondaryDate: undefined,
  })

  // ── Bloc identité salarié ───────────────────────────────────────────────
  doc.setFillColor(...COLORS.light)
  doc.setDrawColor(...COLORS.border)
  doc.roundedRect(margin, y, contentW, 40, 2, 2, 'FD')

  // Label + nom
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...COLORS.muted)
  doc.text('SALARIÉ', margin + 4, y + 5)

  doc.setFontSize(15)
  doc.setTextColor(...COLORS.primary)
  doc.text(`${employee.first_name} ${employee.last_name}`, margin + 4, y + 13)

  // Infos à gauche (sous le nom)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...COLORS.text)
  let lY = y + 20
  const leftInfo: Array<[string, string]> = [
    ['N° Registre national', employee.national_id || '—'],
    ['Fonction',              employee.position || '—'],
    ['Département',           employee.department || '—'],
  ]
  for (const [label, value] of leftInfo) {
    doc.setTextColor(...COLORS.muted)
    doc.text(`${label} :`, margin + 4, lY)
    doc.setTextColor(...COLORS.text)
    doc.text(value, margin + 42, lY)
    lY += 4.5
  }

  // Bloc droite : type contrat + date entrée + paiement + solde congés
  const rX = margin + contentW / 2 + 4
  let rY = y + 13
  const contractLabel = employee.contract_type || employee.worker_type || 'CDI'
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...COLORS.accent)
  doc.text(contractLabel.toUpperCase(), rX, rY)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...COLORS.muted)
  rY += 5
  doc.text(`Date d'entrée : ${formatDate(employee.hire_date)}`, rX, rY)
  if (employee.seniority_years !== undefined) {
    rY += 4
    doc.text(`Ancienneté : ${employee.seniority_years.toFixed(1)} ans`, rX, rY)
  }
  if (employee.payment_day) {
    rY += 4
    doc.text(`Paiement le : ${employee.payment_day} de chaque mois`, rX, rY)
  }
  if (employee.vacation_days_balance !== undefined) {
    rY += 4
    doc.setTextColor(...COLORS.success)
    doc.setFont('helvetica', 'bold')
    doc.text(`Solde congés : ${employee.vacation_days_balance.toFixed(1)} jours`, rX, rY)
  }

  y += 46

  // ── Période + jours travaillés (4 KPIs en grille) ───────────────────────
  const kpiH = 22
  const kpiW = (contentW - 6) / 4  // 4 KPIs avec marges de 2mm
  const kpis: Array<{ label: string; value: string; color: [number, number, number] }> = [
    { label: 'Période',         value: periodLabel,                              color: COLORS.primary },
    { label: 'Jours travaillés', value: period.worked_days?.toString() ?? '—',     color: COLORS.text },
    { label: 'Absences',        value: period.absence_days?.toString() ?? '—',    color: COLORS.text },
    { label: 'Congés',          value: period.holiday_days?.toString() ?? '—',    color: COLORS.text },
  ]
  kpis.forEach((k, i) => {
    const x = margin + i * (kpiW + 2)
    doc.setFillColor(...COLORS.light)
    doc.setDrawColor(...COLORS.border)
    doc.roundedRect(x, y, kpiW, kpiH, 2, 2, 'FD')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...COLORS.muted)
    doc.text(k.label.toUpperCase(), x + 3, y + 5)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(...k.color)
    doc.text(k.value, x + 3, y + 15)
  })
  y += kpiH + 6

  // ── Calculs paie ───────────────────────────────────────────────────────
  const g = computeGross(input)
  const ssEmployee    = round2(g.grossTaxable * ssEmployeeRate / 100)
  const specialSS     = round2(g.grossTaxable * specialSSRate / 100)
  const taxableIncome = round2(g.grossTaxable - ssEmployee - specialSS)
  const advance       = employee.advance ?? 0
  const otherDeduct   = employee.other_deductions ?? 0
  const netSalary     = round2(g.grossTotal - ssEmployee - specialSS - advance - otherDeduct - withholding)

  // Charges patronales (informatif, payées par l'employeur en plus)
  const ssEmployer    = round2(g.grossTaxable * ssEmployerRate / 100)
  const employerCost  = round2(g.grossTotal + ssEmployer)
  const totalRetenues = round2(ssEmployee + specialSS + advance + otherDeduct + withholding)

  // ── Tableau UNIFIE gains + retenues (bleu, +/- par ligne) ──────────
  // Chaque ligne commence par '+' pour les gains et '-' pour les retenues
  // pour une lecture immédiate.
  const rows: Array<[string, string, string, string]> = []

  // ── Gains (+) ─────────────────────────────────────────
  if (employee.hourly_rate && employee.hours_worked !== undefined) {
    rows.push(['+ Salaire de base (horaire)', `${(employee.hours_worked ?? 0).toFixed(1)} h`, `${fmtMoney(employee.hourly_rate)}/h`, fmtMoney(g.baseAmount)])
  } else {
    rows.push(['+ Salaire de base (mensuel)', '1 mois', '—', fmtMoney(g.baseAmount)])
  }
  if ((employee.overtime_hours ?? 0) > 0) {
    rows.push(['+ Heures supplémentaires (+50%)', `${employee.overtime_hours} h`, `${fmtMoney(employee.overtime_rate ?? 0)}/h`, fmtMoney(g.overtimeAmount)])
  }
  if ((employee.night_hours ?? 0) > 0) {
    rows.push(['+ Heures de nuit (+20%)', `${employee.night_hours} h`, `${fmtMoney(employee.night_rate ?? 0)}/h`, fmtMoney(g.nightAmount)])
  }
  if ((employee.weekend_hours ?? 0) > 0) {
    rows.push(['+ Heures week-end (+50%)', `${employee.weekend_hours} h`, `${fmtMoney(employee.weekend_rate ?? 0)}/h`, fmtMoney(g.weekendAmount)])
  }
  if (g.bonus > 0) {
    rows.push(['+ Primes / bonus', '—', '—', fmtMoney(g.bonus)])
  }
  rows.push([`Brut imposable (${g.totalHours.toFixed(1)} h)`, '—', '—', fmtMoney(g.grossTaxable)])
  if (g.grossNonTaxable > 0) {
    rows.push(['+ Indemnités non imposables', '—', '—', fmtMoney(g.grossNonTaxable)])
  }

  // ── Retenues (-) ─────────────────────────────────────
  rows.push(['− Sécurité sociale (ONSS — employé)', fmtMoney(g.grossTaxable), `${ssEmployeeRate.toFixed(2)}%`, fmtMoney(ssEmployee)])
  rows.push(['− Cotisation spéciale SS', fmtMoney(g.grossTaxable), `${specialSSRate.toFixed(2)}%`, fmtMoney(specialSS)])
  if (advance > 0)    rows.push(['− Avance sur salaire', '—', '—', fmtMoney(advance)])
  if (otherDeduct > 0) rows.push(['− Autres retenues', '—', '—', fmtMoney(otherDeduct)])
  rows.push([
    '− Précompte professionnel (barème progressif)',
    fmtMoney(taxableIncome),
    input.fiscal?.bracket ? `~${input.fiscal.bracket}%` : '—',
    fmtMoney(withholding),
  ])

  // ── Total NET (ligne finale sur fond bleu primary) ────
  rows.push([
    `NET À PAYER  (versement le ${formatDate(period.payment_date)})`,
    '',
    '',
    fmtMoney(netSalary),
  ])

  // Couleurs de dégradé bleu : primary (header), rows alternées #f0f6ff,
  // retenues #f4f7fe. Header navy primary, ligne finale NET À PAYER en
  // bandeau navy primary. MÊME police (helvetica normal) pour toutes les
  // lignes pour une lecture uniforme — pas de bold parasite.
  // Pas de bordures verticales : uniquement lignes horizontales fines entre
  // chaque row + ligne épaisse navy sous header + ligne épaisse avant NET.
  // Police 7pt (au lieu de 8pt) pour éviter tout wrap bizarre
  // ('S e c u r i t e   s o c i a l e' avec espaces entre lettres quand
  // la cellule était trop étroite).
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['DESCRIPTION', 'BASE', 'TAUX / MAJORATION', 'MONTANT (€)']],
    body: rows,
    theme: 'plain',
    styles: {
      font: 'helvetica', fontStyle: 'normal', fontSize: 7,
      cellPadding: { top: 2, bottom: 2, left: 4, right: 4 },
      overflow: 'linebreak',
      valign: 'middle',
      lineWidth: 0,
      lineColor: [220, 226, 235],
    },
    headStyles: {
      fillColor: COLORS.primary, textColor: COLORS.white,
      fontStyle: 'bold', fontSize: 8,
      cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
      valign: 'middle',
      lineWidth: 0,
    },
    alternateRowStyles: { fillColor: [240, 246, 255] },
    columnStyles: {
      0: { cellWidth: 'auto', minCellWidth: 70, halign: 'left',  valign: 'middle' },
      1: { cellWidth: 22,                  halign: 'right', valign: 'middle' },
      2: { cellWidth: 25,                  halign: 'right', valign: 'middle' },
      3: { cellWidth: 55,                  halign: 'right', valign: 'middle' },
    },
    didParseCell: (data) => {
      if (data.section !== 'body') return
      const idx = data.row.index
      const isNetRow = idx === rows.length - 1
      // Ligne NET : gros, fond primary navy, texte blanc
      if (isNetRow) {
        data.cell.styles.fillColor = COLORS.primary
        data.cell.styles.textColor = COLORS.white
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.fontSize = 10
        return
      }
      const desc = String(rows[idx]?.[0] ?? '')
      const isRetenue = desc.startsWith('−')
      const isSousTotal = desc.startsWith('Brut imposable')
      if (isSousTotal) {
        data.cell.styles.fillColor = COLORS.light
        data.cell.styles.fontStyle = 'bold'
      } else if (isRetenue && idx % 2 === 0) {
        data.cell.styles.fillColor = [244, 247, 254]
      }
    },
    // Bordures : uniquement horizontales, dessinées à la main
    didDrawCell: (data) => {
      const { doc, cell, row, column, table, section } = data
      const leftX  = table.settings.margin.left
      const rightX = leftX + (table as any).width   // largeur totale du tableau
      const HR_COLOR: [number, number, number] = [220, 226, 235]
      const HEADER_COLOR: [number, number, number] = COLORS.primary

      // Ligne épaisse navy SOUS le header
      if (section === 'head' && column.index === 0) {
        doc.setDrawColor(...HEADER_COLOR)
        doc.setLineWidth(0.5)
        doc.line(leftX, cell.y + cell.height, rightX, cell.y + cell.height)
        return
      }
      // Pour le body, on ne dessine qu'une seule fois par row (1ʳᵉ colonne)
      if (section !== 'body' || column.index !== 0) return

      // Ligne horizontale fine entre chaque row
      if (row.index < table.body.length - 1) {
        doc.setDrawColor(...HR_COLOR)
        doc.setLineWidth(0.15)
        doc.line(leftX, row.y + row.height, rightX, row.y + row.height)
      }
      // Ligne épaisse navy juste avant la ligne NET (avant-dernière row)
      if (row.index === table.body.length - 2) {
        doc.setDrawColor(...HEADER_COLOR)
        doc.setLineWidth(0.5)
        doc.line(leftX, row.y, rightX, row.y)
      }
    },
  })
  // @ts-ignore
  y = (doc.lastAutoTable?.finalY ?? y + 50) + 8

  // ── Cumul annuel YTD (si fourni) ──────────────────────────

  // ── Cumul annuel YTD (si fourni) ──────────────────────────────────────
  if (input.ytd && (input.ytd.gross !== undefined || input.ytd.net !== undefined)) {
    const ytdGross      = input.ytd.gross ?? 0
    const ytdSS         = input.ytd.ss_employee ?? 0
    const ytdWithholding = input.ytd.withholding ?? 0
    const ytdNet        = input.ytd.net ?? 0

    doc.setFillColor(...COLORS.light)
    doc.setDrawColor(...COLORS.border)
    doc.roundedRect(margin, y, contentW, 22, 2, 2, 'FD')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...COLORS.muted)
    doc.text(`CUMUL ${period.year} (janvier à aujourd'hui)`, margin + 4, y + 5)
    const ytdCols = [
      { l: 'Brut imposable',  v: fmtMoney(ytdGross) },
      { l: 'Cotisations SS',  v: fmtMoney(ytdSS) },
      { l: 'Précompte',        v: fmtMoney(ytdWithholding) },
      { l: 'Net versé',        v: fmtMoney(ytdNet) },
    ]
    const colW = (contentW - 8) / ytdCols.length
    ytdCols.forEach((c, i) => {
      const cx = margin + 4 + i * colW
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
      doc.setTextColor(...COLORS.muted)
      doc.text(c.l, cx, y + 12)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(...COLORS.primary)
      doc.text(c.v, cx, y + 18)
    })
    y += 28
  }

  // ── Charges patronales (info, en gris) ────────────────────────────────
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...COLORS.muted)
  doc.text(
    `Charges patronales : ONSS ${ssEmployerRate.toFixed(2)}% = ${fmtMoney(ssEmployer)} | Coût total employeur : ${fmtMoney(employerCost)}`,
    margin, y,
  )
  y += 6

  // ── Mode de paiement + coordonnées bancaires ──────────────────────────
  doc.setDrawColor(...COLORS.border)
  doc.line(margin, y, pageWidth - margin, y)
  y += 6

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...COLORS.primary)
  doc.text('MODE DE PAIEMENT', margin, y)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...COLORS.text)
  doc.text(employee.payment_method || 'Virement bancaire', margin + 50, y)

  if (employee.iban) {
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...COLORS.primary)
    doc.text('IBAN', pageWidth - margin - 70, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...COLORS.text)
    doc.text(fmtIban(employee.iban), pageWidth - margin, y, { align: 'right' })
    y += 5
    if (employee.bic) {
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...COLORS.primary)
      doc.text('BIC', pageWidth - margin - 70, y)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...COLORS.text)
      doc.text(employee.bic, pageWidth - margin, y, { align: 'right' })
    }
  }
  y += 8

  // ── Signatures ─────────────────────────────────────────────────────────
  const sigY = pageHeight - 60
  if (sigY > y + 6) {
    // Force position to bottom
    y = sigY
  }
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...COLORS.text)
  doc.text('Signature de l\'employeur :', margin, y)
  doc.text('Reçu par le salarié :', pageWidth / 2, y)

  doc.setDrawColor(...COLORS.border)
  doc.line(margin, y + 14, margin + 60, y + 14)
  doc.line(pageWidth / 2, y + 14, pageWidth / 2 + 60, y + 14)

  // ── Footer (theme partagé) ────────────────────────────────────────────
  drawFooter(doc, company, { kind: 'PAYSLIP' })

  return doc
}

export function downloadPayslip(input: PayslipInput, fileName?: string) {
  const doc = generatePayslipPdf(input)
  doc.save(fileName ?? `paie-${input.employee.last_name}-${input.period.month}.pdf`)
}

export function openPayslip(input: PayslipInput) {
  const doc = generatePayslipPdf(input)
  const blob = doc.output('blob')
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank', 'noopener,noreferrer')
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers privés
// ─────────────────────────────────────────────────────────────────────────────
function formatMonthYear(yyyymm: string): string {
  const [y, m] = yyyymm.split('-').map(Number)
  if (!y || !m) return yyyymm
  const months = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
                  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
  return `${months[m - 1] ?? ''} ${y}`
}
