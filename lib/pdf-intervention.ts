/**
 * Génération PDF — Rapport d'intervention.
 *
 * Modèle standard pour technicien / sous-traitant :
 *  - N° d'intervention
 *  - Date, heure début/fin
 *  - Client + adresse du site
 *  - Technicien(s) assigné(s)
 *  - Description du problème / travaux réalisés
 *  - Pièces détachées utilisées
 *  - Temps passé par tâche
 *  - Observations / recommandations
 *  - Signatures client + technicien
 *  - Photo placeholder (1 cadre par intervention, à enrichir)
 */
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatDate, formatMoney } from './format'
import type { CompanySettings } from './types'

interface ClientLite {
  name: string
  address?: string | null
  city?: string | null
  zip_code?: string | null
  contact_name?: string | null
  contact_phone?: string | null
  contact_email?: string | null
}

export interface InterventionPart {
  reference: string
  description: string
  quantity: number
  unit_price: number
}

export interface InterventionTask {
  description: string
  hours: number
  rate: number
}

export interface InterventionForPdf {
  intervention_number: string
  date: string | null
  start_time?: string | null
  end_time?: string | null
  client?: ClientLite | null
  client_name?: string | null
  site_address?: string | null
  technician_name?: string | null
  technician_phone?: string | null
  problem_description: string
  work_done: string
  tasks?: InterventionTask[]
  parts?: InterventionPart[]
  observations?: string | null
  recommendations?: string | null
  status?: 'planned' | 'in_progress' | 'done' | 'billed' | 'cancelled'
  currency?: string
}

const COLORS = {
  primary: [30, 58, 95] as [number, number, number],
  text: [15, 23, 42] as [number, number, number],
  muted: [100, 116, 139] as [number, number, number],
  border: [226, 232, 240] as [number, number, number],
  light: [248, 250, 252] as [number, number, number],
  success: [16, 185, 129] as [number, number, number],
  warning: [245, 158, 11] as [number, number, number],
}

const STATUS_LABELS: Record<string, string> = {
  planned: 'Planifiée',
  in_progress: 'En cours',
  done: 'Terminée',
  billed: 'Facturée',
  cancelled: 'Annulée',
}

export function generateInterventionPdf (intervention: InterventionForPdf, company: Partial<CompanySettings>): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 15
  const contentW = pageWidth - 2 * margin

  // En-tête société
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
    company.phone,
    company.email,
    company.vat_number ? `TVA : ${company.vat_number}` : null,
  ].filter(Boolean) as string[]) {
    doc.text(line, margin, y)
    y += 4
  }

  // Titre droite
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(24)
  doc.setTextColor(...COLORS.primary)
  doc.text('RAPPORT D\'INTERVENTION', pageWidth - margin, margin + 8, { align: 'right' })
  doc.setFontSize(11)
  doc.setTextColor(...COLORS.text)
  doc.text(`N° ${intervention.intervention_number}`, pageWidth - margin, margin + 16, { align: 'right' })

  const status = STATUS_LABELS[intervention.status || 'planned'] || intervention.status
  doc.setFontSize(9)
  doc.setTextColor(...COLORS.muted)
  doc.text(`Statut : ${status}`, pageWidth - margin, margin + 22, { align: 'right' })

  // Bloc client
  const clientY = Math.max(y, margin + 26) + 6
  doc.setFillColor(...COLORS.light)
  doc.rect(margin, clientY, contentW / 2 - 2, 38, 'F')
  doc.setDrawColor(...COLORS.border)
  doc.rect(margin, clientY, contentW / 2 - 2, 38, 'S')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...COLORS.muted)
  doc.text('CLIENT', margin + 4, clientY + 4)
  doc.setFontSize(11)
  doc.setTextColor(...COLORS.text)
  doc.text(intervention.client?.name || intervention.client_name || '—', margin + 4, clientY + 11)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...COLORS.muted)
  let cy = clientY + 16
  for (const line of [
    intervention.client?.contact_name,
    intervention.client?.contact_phone,
    intervention.client?.contact_email,
    intervention.site_address,
    [intervention.client?.zip_code, intervention.client?.city].filter(Boolean).join(' '),
  ].filter(Boolean) as string[]) {
    doc.text(line, margin + 4, cy)
    cy += 3.5
  }

  // Bloc intervention
  const ix = margin + contentW / 2 + 2
  doc.setFillColor(...COLORS.light)
  doc.rect(ix, clientY, contentW / 2 - 2, 38, 'F')
  doc.setDrawColor(...COLORS.border)
  doc.rect(ix, clientY, contentW / 2 - 2, 38, 'S')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...COLORS.muted)
  doc.text('INTERVENTION', ix + 4, clientY + 4)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...COLORS.text)
  let iy = clientY + 11
  for (const [label, value] of [
    ['Date',             formatDate(intervention.date)],
    ['Heure début',      intervention.start_time || '—'],
    ['Heure fin',        intervention.end_time || '—'],
    ['Technicien',       intervention.technician_name || '—'],
  ] as const) {
    doc.setTextColor(...COLORS.muted)
    doc.text(`${label} :`, ix + 4, iy)
    doc.setTextColor(...COLORS.text)
    doc.text(value, ix + 28, iy)
    iy += 4
  }

  // Description problème
  y = clientY + 44
  section(doc, 'DESCRIPTION DU PROBLÈME / DEMANDE CLIENT', margin, y, contentW)
  y += 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...COLORS.text)
  const probLines = doc.splitTextToSize(intervention.problem_description, contentW)
  doc.text(probLines, margin, y)
  y += probLines.length * 4 + 6

  // Travaux réalisés
  section(doc, 'TRAVAUX RÉALISÉS', margin, y, contentW)
  y += 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...COLORS.text)
  const workLines = doc.splitTextToSize(intervention.work_done, contentW)
  doc.text(workLines, margin, y)
  y += workLines.length * 4 + 6

  // Heures par tâche (si fournies)
  if (intervention.tasks && intervention.tasks.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Tâche', 'Heures', 'Taux', 'Montant']],
      body: intervention.tasks.map((t) => [
        t.description,
        { content: `${t.hours} h`, styles: { halign: 'right' } },
        { content: formatMoney(t.rate, intervention.currency || 'EUR'), styles: { halign: 'right' } },
        { content: formatMoney(t.hours * t.rate, intervention.currency || 'EUR'), styles: { halign: 'right' } },
      ]),
      theme: 'grid',
      headStyles: { fillColor: COLORS.primary, textColor: [255,255,255], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9, textColor: COLORS.text },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 25, halign: 'right' },
        2: { cellWidth: 30, halign: 'right' },
        3: { cellWidth: 35, halign: 'right' },
      },
    })
    // @ts-ignore
    y = (doc.lastAutoTable?.finalY ?? y) + 8
  }

  // Pièces détachées
  if (intervention.parts && intervention.parts.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Référence', 'Pièce', 'Qté', 'P.U. HT', 'Total HT']],
      body: intervention.parts.map((p) => [
        p.reference,
        p.description,
        { content: p.quantity.toString(), styles: { halign: 'right' } },
        { content: formatMoney(p.unit_price, intervention.currency || 'EUR'), styles: { halign: 'right' } },
        { content: formatMoney(p.quantity * p.unit_price, intervention.currency || 'EUR'), styles: { halign: 'right' } },
      ]),
      theme: 'grid',
      headStyles: { fillColor: COLORS.primary, textColor: [255,255,255], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9, textColor: COLORS.text },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 18, halign: 'right' },
        3: { cellWidth: 30, halign: 'right' },
        4: { cellWidth: 32, halign: 'right' },
      },
    })
    // @ts-ignore
    y = (doc.lastAutoTable?.finalY ?? y) + 8
  }

  // Observations / Recommandations
  if (intervention.observations || intervention.recommendations) {
    if (intervention.observations) {
      section(doc, 'OBSERVATIONS', margin, y, contentW)
      y += 6
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(...COLORS.text)
      const obsLines = doc.splitTextToSize(intervention.observations, contentW)
      doc.text(obsLines, margin, y)
      y += obsLines.length * 4 + 6
    }
    if (intervention.recommendations) {
      section(doc, 'RECOMMANDATIONS', margin, y, contentW)
      y += 6
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(...COLORS.text)
      const recLines = doc.splitTextToSize(intervention.recommendations, contentW)
      doc.text(recLines, margin, y)
      y += recLines.length * 4 + 6
    }
  }

  // Placeholder photo
  y += 4
  doc.setDrawColor(...COLORS.border)
  doc.setLineDashPattern([2, 2], 0)
  doc.rect(margin, y, 60, 40, 'S')
  doc.setLineDashPattern([], 0)
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(8)
  doc.setTextColor(...COLORS.muted)
  doc.text('Photo (à coller ou scanner)', margin + 30, y + 22, { align: 'center' })
  y += 46

  // Signatures
  if (y > pageHeight - 60) {
    doc.addPage()
    y = margin + 10
  }
  const sigY = pageHeight - 36
  doc.setDrawColor(...COLORS.border)
  doc.line(margin, sigY - 6, pageWidth - margin, sigY - 6)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...COLORS.text)
  doc.text('SIGNATURES', margin, sigY)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...COLORS.muted)
  doc.text(`Technicien : ${intervention.technician_name || '—'}`, margin, sigY + 8)
  doc.text('Client :', pageWidth / 2 + 4, sigY + 8)

  // Cadres signature
  doc.setDrawColor(...COLORS.border)
  doc.rect(margin, sigY + 12, 70, 14, 'S')
  doc.rect(pageWidth / 2 + 4, sigY + 12, 70, 14, 'S')

  doc.setFontSize(8)
  doc.setTextColor(...COLORS.muted)
  doc.text('Date et signature', margin + 2, sigY + 28)
  doc.text('Date, nom et signature', pageWidth / 2 + 6, sigY + 28)

  // Mentions pied de page
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(7.5)
  doc.setTextColor(...COLORS.muted)
  doc.text(
    `Document généré le ${new Date().toLocaleDateString('fr-BE')} à ${new Date().toLocaleTimeString('fr-BE')}`,
    pageWidth / 2,
    pageHeight - 6,
    { align: 'center' },
  )

  return doc
}

export function downloadIntervention (intervention: InterventionForPdf, company: Partial<CompanySettings>) {
  const doc = generateInterventionPdf(intervention, company)
  doc.save(`${intervention.intervention_number}.pdf`)
}

export function openIntervention (intervention: InterventionForPdf, company: Partial<CompanySettings>) {
  const doc = generateInterventionPdf(intervention, company)
  const blob = doc.output('blob')
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank', 'noopener,noreferrer')
}

function section (doc: jsPDF, title: string, x: number, y: number, w: number) {
  doc.setFillColor(30, 58, 95)
  doc.rect(x, y - 3, 3, 4, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...COLORS.text)
  doc.text(title, x + 5, y)
}