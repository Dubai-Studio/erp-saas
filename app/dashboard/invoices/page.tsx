'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useRef } from 'react'
import React from 'react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Client {
  id: string; name: string; email: string; address: string
  city: string; country: string; vat_number: string
}
interface Project { id: string; name: string; client_id?: string }
interface InvoiceLine {
  description: string; quantity: number; unit_price: number; vat_rate: number
}
interface Invoice {
  id: string; invoice_number: string; client_id: string; client_name?: string
  project_id?: string; project_name?: string
  status: 'draft'|'sent'|'paid'|'overdue'|'cancelled'
  issue_date: string; due_date: string; lines: InvoiceLine[]
  subtotal: number; vat_amount: number; total_amount: number
  notes: string; payment_terms: string; created_at: string
  type: 'outgoing'
}
interface ExternalInvoice {
  id: string; type: 'incoming'; file_name: string; file_url?: string
  supplier_id?: string; supplier_name: string
  client_id?: string; project_id?: string; project_name?: string
  amount_ht: number; vat_amount: number; total_amount: number
  issue_date: string; due_date?: string; category: string
  notes: string; status: 'pending'|'paid'|'contested'; created_at: string
}
type TabMode = 'outgoing' | 'incoming'

// ─── Constantes ───────────────────────────────────────────────────────────────
const C = {
  primary:   '#1e3a5f',
  blue:      '#2563eb',
  green:     '#10b981',
  amber:     '#f59e0b',
  red:       '#ef4444',
  purple:    '#7c3aed',
  slate:     '#64748b',
  border:    '#e2e8f0',
  bg:        '#f8fafc',
  text:      '#0f172a',
  textSub:   '#64748b',
}

const STATUS_OUT: Record<string, { label:string; color:string; bg:string; border:string; dot:string }> = {
  draft:     { label:'Brouillon', color:'#64748b', bg:'#f8fafc',  border:'#e2e8f0', dot:'#94a3b8' },
  sent:      { label:'Envoyée',   color:'#1d4ed8', bg:'#eff6ff',  border:'#bfdbfe', dot:'#3b82f6' },
  paid:      { label:'Payée',     color:'#15803d', bg:'#f0fdf4',  border:'#bbf7d0', dot:'#22c55e' },
  overdue:   { label:'En retard', color:'#b91c1c', bg:'#fef2f2',  border:'#fecaca', dot:'#ef4444' },
  cancelled: { label:'Annulée',   color:'#92400e', bg:'#fffbeb',  border:'#fde68a', dot:'#f59e0b' },
}
const STATUS_IN: Record<string, { label:string; color:string; bg:string; border:string; dot:string }> = {
  pending:   { label:'En attente', color:'#1d4ed8', bg:'#eff6ff', border:'#bfdbfe', dot:'#3b82f6' },
  paid:      { label:'Payée',      color:'#15803d', bg:'#f0fdf4', border:'#bbf7d0', dot:'#22c55e' },
  contested: { label:'Contestée',  color:'#b91c1c', bg:'#fef2f2', border:'#fecaca', dot:'#ef4444' },
}
const EXT_CATEGORIES = ['Prestation','Matériel','Logistique','Loyer','Utilities','Assurance','Honoraires','Autre']
const VAT_RATES    = [0, 6, 12, 21]
const PAYMENT_TERMS = ['Immédiat','15 jours','30 jours','45 jours','60 jours','Sur commande']
const EMPTY_LINE: InvoiceLine = { description:'', quantity:1, unit_price:0, vat_rate:21 }

const COMPANY = {
  name:    'Next-ERP.PRO',
  address: 'Rue de la Loi 1',
  city:    '1000 Bruxelles',
  country: 'Belgique',
  vat:     'BE 0000.000.000',
  email:   'contact@next-erp.pro',
  phone:   '+32 2 000 00 00',
  iban:    'BE00 0000 0000 0000',
  bic:     'GEBABEBB',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt  = (n: number) => new Intl.NumberFormat('fr-BE',{style:'currency',currency:'EUR'}).format(n||0)
const fmtD = (d: string) => d ? new Date(d).toLocaleDateString('fr-BE',{day:'2-digit',month:'short',year:'numeric'}) : '—'
const today  = () => new Date().toISOString().split('T')[0]
const due30  = () => new Date(Date.now()+30*86400000).toISOString().split('T')[0]

function calcLines(lines: InvoiceLine[]) {
  const subtotal   = lines.reduce((s,l) => s + (Number(l.quantity)||0)*(Number(l.unit_price)||0), 0)
  const vat_amount = lines.reduce((s,l) => s + (Number(l.quantity)||0)*(Number(l.unit_price)||0)*((Number(l.vat_rate)||0)/100), 0)
  return { subtotal, vat_amount, total_amount: subtotal + vat_amount }
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const card: React.CSSProperties = {
  background:'#fff', borderRadius:14,
  boxShadow:'0 1px 3px rgba(0,0,0,0.05),0 4px 12px rgba(0,0,0,0.04)',
  border:`1px solid ${C.border}`,
}
const inp: React.CSSProperties = {
  width:'100%', padding:'9px 12px', border:`1.5px solid ${C.border}`,
  borderRadius:9, fontSize:13, color:C.text, background:'#fff',
  outline:'none', boxSizing:'border-box', fontFamily:'inherit',
}
const lbl: React.CSSProperties = {
  display:'block', fontSize:11, fontWeight:700, color:C.slate,
  marginBottom:5, textTransform:'uppercase', letterSpacing:'0.04em',
}

// ─── Icons ────────────────────────────────────────────────────────────────────
const Ic = {
  plus:     <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  edit:     <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  trash:    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>,
  eye:      <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  pdf:      <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  x:        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  search:   <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>,
  upload:   <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  download: <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  check:    <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>,
  refresh:  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>,
  invoice:  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  arrowIn:  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 5v14M5 12l7 7 7-7"/></svg>,
  arrowOut: <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg>,
  filter:   <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
  calendar: <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  attach:   <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>,
  euro:     <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 10h12M4 14h12M19 5A9 9 0 1 1 5 19"/></svg>,
  list:     <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
  grid:     <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>,
  export:   <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  send:     <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  building: <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6M9 13h6M9 17h4"/></svg>,
  fileIn:   <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="12 18 12 12"/><polyline points="9 15 12 18 15 15"/></svg>,
  fileOut:  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="12 12 12 18"/><polyline points="9 15 12 12 15 15"/></svg>,
  warn:     <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  bank:     <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>,
  link:     <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
}

// ─── ActionBtn ────────────────────────────────────────────────────────────────
function AB({ onClick, title, icon, hBg, hCol, label }:{
  onClick:()=>void; title:string; icon:React.ReactNode
  hBg:string; hCol:string; label?:string
}) {
  const [h,setH] = useState(false)
  return (
    <button onClick={onClick} title={title}
      onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      style={{
        display:'flex', alignItems:'center', justifyContent:'center',
        gap: label ? 5 : 0,
        height:32, padding: label ? '0 10px' : '0', minWidth:32,
        borderRadius:8, border:'none', cursor:'pointer',
        background: h ? hBg : C.bg,
        color: h ? hCol : '#94a3b8',
        fontSize:12, fontWeight:600, transition:'all 0.15s', flexShrink:0,
      }}
    >
      {icon}{label}
    </button>
  )
}

// ─── PDF Générateur PRO ───────────────────────────────────────────────────────
function generatePDF(invoice: Invoice, client: Client|undefined) {
  const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' })
  const W=210, M=18, pW=W-M*2

  // Recalcul défensif des totaux
  const safeLines: InvoiceLine[] = Array.isArray(invoice.lines) ? invoice.lines : []
  const subtotal     = (invoice.subtotal != null && !isNaN(invoice.subtotal))
    ? Number(invoice.subtotal)
    : safeLines.reduce((s,l) => s + (Number(l.quantity)||0)*(Number(l.unit_price)||0), 0)
  const vat_amount   = (invoice.vat_amount != null && !isNaN(invoice.vat_amount))
    ? Number(invoice.vat_amount)
    : safeLines.reduce((s,l) => s + (Number(l.quantity)||0)*(Number(l.unit_price)||0)*((Number(l.vat_rate)||0)/100), 0)
  const total_amount = (invoice.total_amount != null && !isNaN(invoice.total_amount))
    ? Number(invoice.total_amount)
    : subtotal + vat_amount

  // ── En-tête fond sombre ──
  doc.setFillColor(15, 23, 42)
  doc.rect(0, 0, W, 56, 'F')

  // Logo / Nom société
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text(COMPANY.name, M, 19)

  // Sous-titre société
  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(148, 163, 184)
  doc.text(COMPANY.address + ', ' + COMPANY.city, M, 26)
  doc.text('TVA : ' + COMPANY.vat + '   |   ' + COMPANY.email + '   |   ' + COMPANY.phone, M, 32)

  // FACTURE titre (droite)
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(24)
  doc.setFont('helvetica', 'bold')
  doc.text('FACTURE', W - M, 19, { align: 'right' })

  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(148, 163, 184)
  doc.text('N° ' + invoice.invoice_number, W - M, 27, { align: 'right' })

  // Badge statut
  const stColors: Record<string,[number,number,number]> = {
    paid:[22,163,74], sent:[37,99,235], draft:[100,116,139], overdue:[220,38,38], cancelled:[217,119,6]
  }
  const [r,g,b] = stColors[invoice.status] || [100,116,139]
  doc.setFillColor(r, g, b)
  const stLabel = STATUS_OUT[invoice.status]?.label || ''
  doc.roundedRect(W - M - 30, 33, 30, 8, 2, 2, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'bold')
  doc.text(stLabel, W - M - 15, 38.2, { align: 'center' })

  // ── Bande info dates ──
  doc.setFillColor(241, 245, 249)
  doc.rect(0, 57, W, 20, 'F')
  const dateItems = [
    { l: "Date d'émission", v: fmtD(invoice.issue_date) },
    { l: "Date d'échéance",  v: fmtD(invoice.due_date) },
    { l: "Conditions de paiement", v: invoice.payment_terms || '30 jours' },
  ]
  dateItems.forEach((d, i) => {
    const x = M + i * (pW / 3)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 116, 139)
    doc.text(d.l.toUpperCase(), x, 64)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(15, 23, 42)
    doc.text(d.v, x, 71)
  })

  // ── Bloc facturer à ──
  doc.setFillColor(255, 255, 255)
  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.3)
  doc.roundedRect(M, 84, 90, 44, 3, 3, 'FD')
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(100, 116, 139)
  doc.text('FACTURÉ À', M + 5, 92)
  doc.setFontSize(10)
  doc.setTextColor(15, 23, 42)
  doc.text(client?.name || invoice.client_name || '—', M + 5, 100)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(71, 85, 105)
  const clientLines = [
    client?.address || '',
    [client?.city, client?.country].filter(Boolean).join(', '),
    client?.email || '',
    client?.vat_number ? 'N° TVA : ' + client.vat_number : '',
  ].filter(Boolean)
  doc.text(clientLines, M + 5, 108, { lineHeightFactor: 1.65 })

  // Bloc projet si présent
  if (invoice.project_name) {
    doc.setFillColor(239, 246, 255)
    doc.setDrawColor(191, 219, 254)
    doc.roundedRect(W - M - 90, 84, 90, 18, 3, 3, 'FD')
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(100, 116, 139)
    doc.text('PROJET', W - M - 85, 92)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(37, 99, 235)
    doc.text(invoice.project_name, W - M - 85, 99)
  }

  // ── Tableau des lignes ──
  autoTable(doc, {
    startY: 136,
    head: [['Description', 'Qté', 'Prix unit. HT', 'TVA', 'Total HT']],
    body: safeLines.map(l => [
      l.description || '',
      String(Number(l.quantity) || 0),
      fmt(Number(l.unit_price) || 0),
      `${Number(l.vat_rate) || 0} %`,
      fmt((Number(l.quantity)||0) * (Number(l.unit_price)||0)),
    ]),
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: 255,
      fontSize: 8.5,
      fontStyle: 'bold',
      cellPadding: 5,
    },
    bodyStyles: {
      fontSize: 9,
      cellPadding: { top: 5, bottom: 5, left: 6, right: 6 },
      textColor: [30, 41, 59],
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 82 },
      1: { halign: 'center', cellWidth: 16 },
      2: { halign: 'right',  cellWidth: 28 },
      3: { halign: 'center', cellWidth: 18 },
      4: { halign: 'right',  cellWidth: 30 },
    },
    margin: { left: M, right: M },
    tableLineColor: [226, 232, 240],
    tableLineWidth: 0.2,
    didDrawPage: () => {},
  })

  const fY = (doc as jsPDF & {lastAutoTable:{finalY:number}}).lastAutoTable.finalY + 8
  const txW = 78, txX = W - M - txW

  // Bloc totaux
  doc.setFillColor(248, 250, 252)
  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.3)
  doc.roundedRect(txX, fY, txW, 46, 3, 3, 'FD')

  // Lignes sous-total & TVA
  const totRows = [
    { l: 'Sous-total HTVA', v: fmt(subtotal) },
    { l: 'TVA',              v: fmt(vat_amount) },
  ]
  totRows.forEach((t, i) => {
    const y = fY + 11 + i * 11
    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 116, 139)
    doc.text(t.l, txX + 6, y)
    doc.setTextColor(30, 41, 59)
    doc.setFont('helvetica', 'bold')
    doc.text(t.v, txX + txW - 6, y, { align: 'right' })
  })

  // Ligne séparateur
  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.4)
  doc.line(txX + 5, fY + 32, txX + txW - 5, fY + 32)

  // Total TTC fond sombre
  doc.setFillColor(15, 23, 42)
  doc.roundedRect(txX, fY + 33, txW, 13, 2, 2, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.text('TOTAL TTC', txX + 6, fY + 41)
  doc.setFontSize(11)
  doc.text(fmt(total_amount), txX + txW - 6, fY + 41, { align: 'right' })

  // Notes (si présentes)
  if (invoice.notes) {
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(100, 116, 139)
    doc.text('NOTES', M, fY + 11)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(71, 85, 105)
    doc.setFontSize(8.5)
    const noteLines = doc.splitTextToSize(invoice.notes, txX - M - 8)
    doc.text(noteLines, M, fY + 20)
  }

  // ── Coordonnées bancaires ──
  const bY = fY + 56
  doc.setFillColor(239, 246, 255)
  doc.setDrawColor(191, 219, 254)
  doc.setLineWidth(0.3)
  doc.roundedRect(M, bY, pW, 18, 3, 3, 'FD')
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 64, 175)
  doc.text('COORDONNÉES BANCAIRES', M + 5, bY + 6.5)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(37, 99, 235)
  doc.text(
    `IBAN : ${COMPANY.iban}   •   BIC : ${COMPANY.bic}   •   Communication : ${invoice.invoice_number}`,
    M + 5, bY + 13
  )

  // ── Pied de page ──
  doc.setFillColor(15, 23, 42)
  doc.rect(0, 282, W, 15, 'F')
  doc.setTextColor(148, 163, 184)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.text(
    `${COMPANY.name}  —  ${COMPANY.vat}  —  ${COMPANY.email}  —  ${COMPANY.address}, ${COMPANY.city}`,
    W / 2, 290.5, { align: 'center' }
  )

  doc.save(`Facture-${invoice.invoice_number}.pdf`)
}

// ─── MODAL : Facture émise ────────────────────────────────────────────────────
function OutgoingModal({ open, onClose, onSave, initial, clients, projects }:{
  open:boolean; onClose:()=>void
  onSave:(d:Partial<Invoice>)=>Promise<void>
  initial?:Invoice|null; clients:Client[]; projects:Project[]
}) {
  const EMPTY = {
    client_id:'', project_id:'', issue_date:today(), due_date:due30(),
    payment_terms:'30 jours', notes:'',
    lines:[{...EMPTY_LINE}] as InvoiceLine[],
    status:'draft' as Invoice['status']
  }
  const [form,   setForm]   = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const [tab,    setTab]    = useState<'info'|'lines'|'notes'>('info')

  useEffect(()=>{
    setForm(initial ? {
      client_id:     initial.client_id||'',
      project_id:    initial.project_id||'',
      issue_date:    initial.issue_date?.split('T')[0]||today(),
      due_date:      initial.due_date?.split('T')[0]||due30(),
      payment_terms: initial.payment_terms||'30 jours',
      notes:         initial.notes||'',
      lines:         initial.lines?.length ? initial.lines : [{...EMPTY_LINE}],
      status:        initial.status||'draft',
    } : {...EMPTY, lines:[{...EMPTY_LINE}]})
    setError(''); setTab('info')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[initial,open])

  if(!open) return null
  const totals = calcLines(form.lines)

  function updLine(i:number, k:keyof InvoiceLine, v:string|number){
    setForm(f=>{
      const l=[...f.lines]
      l[i]={...l[i],[k]:typeof v==='string'&&k!=='description'?parseFloat(v)||0:v}
      return{...f,lines:l}
    })
  }

  async function submit(e:React.FormEvent){
    e.preventDefault()
    if(!form.client_id){ setError('Veuillez sélectionner un client.'); return }
    if(form.lines.some(l=>!l.description.trim())){ setError('Chaque ligne doit avoir une description.'); return }
    setSaving(true); setError('')
    try{
      await onSave({...form,...totals,type:'outgoing'})
    } catch(err){
      setError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde.')
    } finally {
      setSaving(false)
    }
  }

  const clientProjects = projects.filter(p => !form.client_id || p.client_id === form.client_id)
  const hdrBg = 'linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%)'

  const TS = (t:string):React.CSSProperties => ({
    padding:'10px 18px', border:'none', background:'transparent',
    fontSize:13, fontWeight:600, cursor:'pointer',
    color: tab===t ? '#fff' : 'rgba(255,255,255,0.5)',
    borderBottom: tab===t ? '2px solid #fff' : '2px solid transparent',
    transition:'all 0.15s',
  })

  return (
    <div style={{position:'fixed',inset:0,zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div style={{position:'absolute',inset:0,background:'rgba(15,23,42,0.55)',backdropFilter:'blur(6px)'}} onClick={onClose}/>
      <div style={{...card,position:'relative',width:'100%',maxWidth:840,maxHeight:'94vh',overflowY:'auto',zIndex:1,display:'flex',flexDirection:'column'}}>

        <div style={{background:hdrBg,padding:'22px 24px 0',borderRadius:'14px 14px 0 0',flexShrink:0}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
            <div>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <div style={{width:34,height:34,borderRadius:10,background:'rgba(255,255,255,0.15)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',flexShrink:0}}>{Ic.invoice}</div>
                <h2 style={{fontSize:17,fontWeight:800,color:'#fff'}}>
                  {initial?`Modifier ${initial.invoice_number}`:'Nouvelle facture client'}
                </h2>
              </div>
              <p style={{fontSize:12,color:'rgba(255,255,255,0.6)',marginTop:4,marginLeft:44}}>Facturation TVA Belgique — 0 / 6 / 12 / 21 %</p>
            </div>
            <button onClick={onClose} style={{background:'rgba(255,255,255,0.12)',border:'none',borderRadius:9,padding:8,cursor:'pointer',color:'#fff',display:'flex',flexShrink:0}}>{Ic.x}</button>
          </div>
          <div style={{display:'flex',gap:2}}>
            {(['info','lines','notes'] as const).map(t=>(
              <button key={t} style={TS(t)} onClick={()=>setTab(t)}>
                {t==='info'?'Informations':t==='lines'?`Lignes (${form.lines.length})`:'Notes & Paiement'}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={submit} style={{flex:1,display:'flex',flexDirection:'column'}}>
          {error&&(
            <div style={{margin:'14px 24px 0',padding:'10px 14px',background:'#fef2f2',border:'1.5px solid #fecaca',borderRadius:10,fontSize:13,color:'#dc2626',display:'flex',alignItems:'center',gap:8}}>
              {Ic.warn}{error}
            </div>
          )}

          {tab==='info'&&(
            <div style={{padding:24,display:'flex',flexDirection:'column',gap:16,flex:1,overflowY:'auto'}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
                <div style={{gridColumn:'1/-1'}}>
                  <label style={lbl}>Client <span style={{color:'#ef4444'}}>*</span></label>
                  <select style={{...inp}} value={form.client_id}
                    onChange={e=>setForm(f=>({...f,client_id:e.target.value,project_id:''}))}>
                    <option value="">— Sélectionner un client —</option>
                    {clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                {clientProjects.length>0&&(
                  <div style={{gridColumn:'1/-1'}}>
                    <label style={lbl}>Projet associé (optionnel)</label>
                    <select style={{...inp}} value={form.project_id||''}
                      onChange={e=>setForm(f=>({...f,project_id:e.target.value}))}>
                      <option value="">— Aucun projet —</option>
                      {clientProjects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label style={lbl}>Date d'émission</label>
                  <input type="date" style={inp} value={form.issue_date}
                    onChange={e=>setForm(f=>({...f,issue_date:e.target.value}))}/>
                </div>
                <div>
                  <label style={lbl}>Date d'échéance</label>
                  <input type="date" style={inp} value={form.due_date}
                    onChange={e=>setForm(f=>({...f,due_date:e.target.value}))}/>
                </div>
                <div>
                  <label style={lbl}>Conditions de paiement</label>
                  <select style={{...inp}} value={form.payment_terms}
                    onChange={e=>setForm(f=>({...f,payment_terms:e.target.value}))}>
                    {PAYMENT_TERMS.map(t=><option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Statut</label>
                  <select style={{...inp}} value={form.status}
                    onChange={e=>setForm(f=>({...f,status:e.target.value as Invoice['status']}))}>
                    {Object.entries(STATUS_OUT).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
              <div style={{background:C.bg,borderRadius:12,padding:16,border:`1px solid ${C.border}`}}>
                <p style={{...lbl,marginBottom:12}}>Aperçu des montants</p>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
                  {[
                    {l:'Sous-total HTVA',v:fmt(totals.subtotal),hi:false},
                    {l:'TVA',            v:fmt(totals.vat_amount),hi:false},
                    {l:'Total TTC',      v:fmt(totals.total_amount),hi:true}
                  ].map((t,i)=>(
                    <div key={i} style={{textAlign:'center',padding:'12px 0',background:'#fff',borderRadius:10,border:t.hi?`2px solid ${C.blue}`:`1px solid ${C.border}`}}>
                      <p style={{fontSize:10,color:'#94a3b8',marginBottom:4,textTransform:'uppercase',letterSpacing:'0.04em'}}>{t.l}</p>
                      <p style={{fontSize:17,fontWeight:800,color:t.hi?C.blue:C.text}}>{t.v}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab==='lines'&&(
            <div style={{padding:24,flex:1,overflowY:'auto'}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 68px 110px 78px 104px 34px',gap:8,marginBottom:6,padding:'0 4px'}}>
                {['Description','Qté','Prix unit. HT','TVA %','Total HT',''].map((h,i)=>(
                  <p key={i} style={{...lbl,marginBottom:0,textAlign:i>0&&i<5?'center':'left',fontSize:10}}>{h}</p>
                ))}
              </div>
              {form.lines.map((line,i)=>{
                const lt = (Number(line.quantity)||0)*(Number(line.unit_price)||0)
                return(
                  <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 68px 110px 78px 104px 34px',gap:8,marginBottom:8,padding:'10px 12px',background:i%2===0?'#fafafa':'#fff',borderRadius:10,border:`1px solid ${C.border}`,alignItems:'center'}}>
                    <input style={{...inp,background:'transparent',border:`1.5px solid ${C.border}`}} placeholder="Description de la prestation" value={line.description} onChange={e=>updLine(i,'description',e.target.value)}/>
                    <input style={{...inp,textAlign:'center',background:'transparent',border:`1.5px solid ${C.border}`}} type="number" min="0.01" step="0.01" value={line.quantity} onChange={e=>updLine(i,'quantity',e.target.value)}/>
                    <input style={{...inp,textAlign:'right',background:'transparent',border:`1.5px solid ${C.border}`}} type="number" min="0" step="0.01" value={line.unit_price} onChange={e=>updLine(i,'unit_price',e.target.value)}/>
                    <select style={{...inp,textAlign:'center',background:'transparent',border:`1.5px solid ${C.border}`}} value={line.vat_rate} onChange={e=>updLine(i,'vat_rate',e.target.value)}>
                      {VAT_RATES.map(r=><option key={r} value={r}>{r}%</option>)}
                    </select>
                    <p style={{textAlign:'right',fontSize:13,fontWeight:700,color:C.text}}>{fmt(lt)}</p>
                    <button type="button" onClick={()=>setForm(f=>({...f,lines:f.lines.filter((_,j)=>j!==i)}))}
                      disabled={form.lines.length===1}
                      style={{background:'transparent',border:'none',cursor:'pointer',color:'#ef4444',padding:6,borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',opacity:form.lines.length===1?0.25:1}}>
                      {Ic.trash}
                    </button>
                  </div>
                )
              })}
              <button type="button" onClick={()=>setForm(f=>({...f,lines:[...f.lines,{...EMPTY_LINE}]}))}
                style={{display:'flex',alignItems:'center',justifyContent:'center',gap:7,width:'100%',padding:'10px 0',border:`1.5px dashed ${C.blue}`,borderRadius:10,background:'transparent',color:C.blue,fontSize:13,fontWeight:600,cursor:'pointer',marginTop:8}}>
                {Ic.plus} Ajouter une ligne
              </button>
              <div style={{marginTop:20,display:'flex',justifyContent:'flex-end'}}>
                <div style={{background:C.bg,borderRadius:12,padding:'14px 18px',border:`1px solid ${C.border}`,minWidth:260}}>
                  {[{l:'Sous-total HTVA',v:fmt(totals.subtotal)},{l:'TVA',v:fmt(totals.vat_amount)}].map((t,i)=>(
                    <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:`1px solid ${C.border}`}}>
                      <span style={{fontSize:13,color:C.slate}}>{t.l}</span>
                      <span style={{fontSize:13,fontWeight:600,color:C.text}}>{t.v}</span>
                    </div>
                  ))}
                  <div style={{display:'flex',justifyContent:'space-between',padding:'10px 0 0'}}>
                    <span style={{fontSize:14,fontWeight:700,color:C.text}}>Total TTC</span>
                    <span style={{fontSize:20,fontWeight:800,color:C.blue}}>{fmt(totals.total_amount)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab==='notes'&&(
            <div style={{padding:24,display:'flex',flexDirection:'column',gap:16,flex:1,overflowY:'auto'}}>
              <div>
                <label style={lbl}>Notes / Mentions légales</label>
                <textarea style={{...inp,minHeight:110,resize:'vertical',lineHeight:1.6}}
                  placeholder="Conditions générales, délais, pénalités de retard…"
                  value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/>
              </div>
              <div style={{background:'#eff6ff',borderRadius:12,padding:'14px 16px',border:`1.5px solid #bfdbfe`}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                  <span style={{color:C.blue}}>{Ic.bank}</span>
                  <p style={{fontSize:12,fontWeight:700,color:'#1e40af'}}>Coordonnées bancaires (ajoutées automatiquement dans le PDF)</p>
                </div>
                <p style={{fontSize:12,color:'#1d4ed8'}}>IBAN : {COMPANY.iban} &nbsp;•&nbsp; BIC : {COMPANY.bic}</p>
              </div>
            </div>
          )}

          <div style={{padding:'14px 24px',borderTop:`1px solid ${C.border}`,display:'flex',gap:10,flexShrink:0,background:'#fff',borderRadius:'0 0 14px 14px'}}>
            <button type="button" onClick={onClose} style={{flex:1,padding:'10px 0',borderRadius:10,border:`1.5px solid ${C.border}`,background:'#fff',fontSize:13,fontWeight:600,color:C.slate,cursor:'pointer'}}>Annuler</button>
            <button type="submit" disabled={saving} style={{flex:2,padding:'10px 0',borderRadius:10,border:'none',background:saving?'#93c5fd':`linear-gradient(135deg,${C.primary},${C.blue})`,fontSize:13,fontWeight:700,color:'#fff',cursor:saving?'not-allowed':'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
              {saving
                ? <><div style={{width:14,height:14,border:'2px solid #fff',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/> Enregistrement…</>
                : <>{Ic.check} {initial?'Mettre à jour la facture':'Créer la facture'}</>
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── MODAL : Import facture fournisseur ───────────────────────────────────────
function ImportModal({ open, onClose, onSave, clients, projects }:{
  open:boolean; onClose:()=>void
  onSave:(d:Omit<ExternalInvoice,'id'|'created_at'>)=>Promise<void>
  clients:Client[]; projects:Project[]
}) {
  const fileRef = useRef<HTMLInputElement>(null)

  const getEmptyForm = () => ({
    type: 'incoming' as const,
    file_name: '', file_url: '',
    supplier_name: '', supplier_id: '',
    client_id: '', project_id: '',
    amount_ht: 0, vat_amount: 0, total_amount: 0,
    issue_date: today(), due_date: due30(),
    category: 'Prestation',
    notes: '',
    status: 'pending' as ExternalInvoice['status'],
  })

  const [form,   setForm]   = useState(getEmptyForm())
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const [file,   setFile]   = useState<File|null>(null)

  useEffect(() => {
    if (open) {
      setForm(getEmptyForm())
      setError('')
      setFile(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  const sf = (k: keyof ReturnType<typeof getEmptyForm>, v: string | number) =>
    setForm(p => ({ ...p, [k]: v }))

  function onAmountHT(v: string) {
    const ht  = parseFloat(v) || 0
    const tva = Math.round(ht * 0.21 * 100) / 100
    setForm(p => ({ ...p, amount_ht: ht, vat_amount: tva, total_amount: Math.round((ht + tva) * 100) / 100 }))
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const fl = e.target.files?.[0]
    if (fl) { setFile(fl); setForm(p => ({ ...p, file_name: fl.name })) }
    // Reset input so same file can be re-selected
    e.target.value = ''
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.supplier_name.trim()) {
      setError('Le nom du fournisseur est obligatoire.')
      return
    }
    if (!form.amount_ht && !form.total_amount) {
      setError('Veuillez saisir au moins un montant.')
      return
    }
    if (!form.issue_date) {
      setError('La date de la facture est obligatoire.')
      return
    }

    setSaving(true)
    setError('')

    try {
      let fileUrl  = ''
      let fileName = form.file_name

      if (file) {
        const safeName = `${Date.now()}-${file.name.replace(/[^a-z0-9.\-_]/gi, '_')}`
        const uploadRes = await fetch('/api/storage/upload', {
          method:  'POST',
          headers: {
            'x-file-name':   safeName,
            'x-bucket':      'invoices',
            'Content-Type':  file.type || 'application/octet-stream',
          },
          body: file,
        })
        if (!uploadRes.ok) {
          let msg = "Erreur lors de l'upload du fichier."
          try { const err = await uploadRes.json(); msg = err.error || msg } catch {}
          setError(msg)
          setSaving(false)
          return
        }
        const { url } = await uploadRes.json()
        fileUrl  = url
        fileName = file.name
      }

      await onSave({ ...form, file_url: fileUrl, file_name: fileName })
    } catch (err) {
      console.error('ImportModal submit error:', err)
      setError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde. Veuillez réessayer.')
    } finally {
      setSaving(false)
    }
  }

  const hdrBg = 'linear-gradient(135deg,#1e3a5f 0%,#334155 100%)'

  return (
    <div style={{position:'fixed',inset:0,zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div style={{position:'absolute',inset:0,background:'rgba(15,23,42,0.55)',backdropFilter:'blur(6px)'}} onClick={onClose}/>
      <div style={{...card,position:'relative',width:'100%',maxWidth:660,maxHeight:'94vh',overflowY:'auto',zIndex:1}}>

        {/* Header */}
        <div style={{background:hdrBg,padding:'20px 22px 18px',borderRadius:'14px 14px 0 0',flexShrink:0}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{display:'flex',alignItems:'center',gap:12}}>
              <div style={{width:36,height:36,borderRadius:10,background:'rgba(255,255,255,0.12)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',flexShrink:0}}>{Ic.fileIn}</div>
              <div>
                <h2 style={{fontSize:16,fontWeight:800,color:'#fff'}}>Importer une facture fournisseur</h2>
                <p style={{fontSize:11,color:'rgba(255,255,255,0.6)',marginTop:2}}>Joindre le document et saisir les données comptables</p>
              </div>
            </div>
            <button onClick={onClose} style={{background:'rgba(255,255,255,0.12)',border:'none',borderRadius:9,padding:8,cursor:'pointer',color:'#fff',display:'flex',flexShrink:0}}>{Ic.x}</button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={submit} style={{padding:22,display:'flex',flexDirection:'column',gap:15}}>
          {error && (
            <div style={{padding:'10px 14px',background:'#fef2f2',border:`1.5px solid #fecaca`,borderRadius:10,fontSize:13,color:'#dc2626',display:'flex',alignItems:'center',gap:8}}>
              {Ic.warn} {error}
            </div>
          )}

          {/* Zone de dépôt fichier */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileRef.current?.click()}
            onKeyDown={e => e.key === 'Enter' && fileRef.current?.click()}
            style={{
              border: `2px dashed ${file ? C.blue : C.border}`,
              borderRadius: 12, padding: '20px 0', textAlign: 'center',
              cursor: 'pointer',
              background: file ? '#eff6ff' : C.bg,
              transition: 'all 0.15s',
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              style={{ display: 'none' }}
              onChange={handleFile}
            />
            <div style={{color: file ? C.blue : '#94a3b8', marginBottom:8, display:'flex', justifyContent:'center'}}>
              {file ? Ic.attach : Ic.upload}
            </div>
            {file ? (
              <>
                <p style={{fontSize:13,fontWeight:700,color:C.blue}}>{file.name}</p>
                <p style={{fontSize:11,color:C.slate,marginTop:3}}>{(file.size/1024).toFixed(0)} Ko — Cliquer pour changer</p>
              </>
            ) : (
              <>
                <p style={{fontSize:13,fontWeight:600,color:C.slate}}>Glisser ou cliquer pour joindre le document</p>
                <p style={{fontSize:11,color:'#94a3b8',marginTop:3}}>PDF, JPG, PNG — max 10 Mo (optionnel)</p>
              </>
            )}
          </div>

          {/* Fournisseur */}
          <div>
            <label style={lbl}>Nom du fournisseur <span style={{color:'#ef4444'}}>*</span></label>
            <input
              style={inp}
              value={form.supplier_name}
              onChange={e => sf('supplier_name', e.target.value)}
              placeholder="Ex : Fournisseur SARL, Amazon, Microsoft…"
            />
          </div>

          {/* Montants */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
            <div>
              <label style={lbl}>Montant HT (€) <span style={{color:'#ef4444'}}>*</span></label>
              <input
                style={{...inp,textAlign:'right'}}
                type="number" min="0" step="0.01"
                value={form.amount_ht || ''}
                onChange={e => onAmountHT(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div>
              <label style={lbl}>TVA (€)</label>
              <input
                style={{...inp,textAlign:'right'}}
                type="number" min="0" step="0.01"
                value={form.vat_amount || ''}
                onChange={e => {
                  const tva = parseFloat(e.target.value) || 0
                  setForm(p => ({ ...p, vat_amount: tva, total_amount: Math.round((p.amount_ht + tva)*100)/100 }))
                }}
                placeholder="21% auto"
              />
            </div>
            <div>
              <label style={lbl}>Total TTC (€)</label>
              <input
                style={{...inp,textAlign:'right',fontWeight:700,color:C.primary}}
                type="number" min="0" step="0.01"
                value={form.total_amount || ''}
                onChange={e => sf('total_amount', parseFloat(e.target.value)||0)}
                placeholder="0.00"
              />
            </div>
          </div>

          {/* Dates et catégorie */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
            <div>
              <label style={lbl}>Date de facture <span style={{color:'#ef4444'}}>*</span></label>
              <input type="date" style={inp} value={form.issue_date} onChange={e=>sf('issue_date',e.target.value)}/>
            </div>
            <div>
              <label style={lbl}>Date d'échéance</label>
              <input type="date" style={inp} value={form.due_date} onChange={e=>sf('due_date',e.target.value)}/>
            </div>
            <div>
              <label style={lbl}>Catégorie</label>
              <select style={inp} value={form.category} onChange={e=>sf('category',e.target.value)}>
                {EXT_CATEGORIES.map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Client / Projet */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div>
              <label style={lbl}>Client associé (optionnel)</label>
              <select style={inp} value={form.client_id} onChange={e=>sf('client_id',e.target.value)}>
                <option value="">— Aucun client —</option>
                {clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Projet associé (optionnel)</label>
              <select style={inp} value={form.project_id} onChange={e=>sf('project_id',e.target.value)}>
                <option value="">— Aucun projet —</option>
                {projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>

          {/* Statut */}
          <div>
            <label style={lbl}>Statut</label>
            <select style={inp} value={form.status} onChange={e=>sf('status',e.target.value as ExternalInvoice['status'])}>
              <option value="pending">En attente</option>
              <option value="paid">Payée</option>
              <option value="contested">Contestée</option>
            </select>
          </div>

          {/* Notes */}
          <div>
            <label style={lbl}>Notes internes</label>
            <textarea
              style={{...inp,minHeight:72,resize:'vertical',lineHeight:1.6}}
              placeholder="Référence interne, numéro de commande, remarques comptables…"
              value={form.notes}
              onChange={e=>sf('notes',e.target.value)}
            />
          </div>

          {/* Récapitulatif montant */}
          {form.total_amount > 0 && (
            <div style={{background:'#eff6ff',border:`1.5px solid #bfdbfe`,borderRadius:12,padding:'12px 16px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span style={{fontSize:13,color:'#1e40af',fontWeight:600}}>Montant total à comptabiliser</span>
              <span style={{fontSize:20,fontWeight:800,color:C.primary}}>{fmt(form.total_amount)}</span>
            </div>
          )}

          {/* Boutons */}
          <div style={{display:'flex',gap:10,marginTop:4}}>
            <button
              type="button"
              onClick={onClose}
              style={{flex:1,padding:'10px 0',borderRadius:10,border:`1.5px solid ${C.border}`,background:'#fff',fontSize:13,fontWeight:600,color:C.slate,cursor:'pointer'}}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{flex:2,padding:'10px 0',borderRadius:10,border:'none',background:saving?'#93c5fd':`linear-gradient(135deg,${C.primary},${C.blue})`,fontSize:13,fontWeight:700,color:'#fff',cursor:saving?'not-allowed':'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:8}}
            >
              {saving
                ? <><div style={{width:14,height:14,border:'2px solid #fff',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/> Enregistrement…</>
                : <>{Ic.check} Enregistrer la facture</>
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Drawer détail facture émise ──────────────────────────────────────────────
function OutgoingDrawer({ invoice, clients, projects, onClose, onEdit, onDelete, onStatusChange }:{
  invoice:Invoice|null; clients:Client[]; projects:Project[]
  onClose:()=>void; onEdit:()=>void; onDelete:()=>void
  onStatusChange:(id:string,s:Invoice['status'])=>void
}) {
  if (!invoice) return null
  const st  = STATUS_OUT[invoice.status]
  const cli = clients.find(c=>c.id===invoice.client_id)
  const prj = projects.find(p=>p.id===invoice.project_id)
  const safeLines = Array.isArray(invoice.lines) ? invoice.lines : []
  const subtotal    = invoice.subtotal    ?? safeLines.reduce((s,l)=>s+(Number(l.quantity)||0)*(Number(l.unit_price)||0),0)
  const vat_amount  = invoice.vat_amount  ?? safeLines.reduce((s,l)=>s+(Number(l.quantity)||0)*(Number(l.unit_price)||0)*((Number(l.vat_rate)||0)/100),0)

  return (
    <div style={{position:'fixed',inset:0,zIndex:190,display:'flex',justifyContent:'flex-end'}}>
      <div style={{position:'absolute',inset:0,background:'rgba(15,23,42,0.35)',backdropFilter:'blur(3px)'}} onClick={onClose}/>
      <div style={{...card,position:'relative',width:400,height:'100%',borderRadius:'20px 0 0 20px',display:'flex',flexDirection:'column',overflowY:'auto',zIndex:1}}>
        <div style={{background:'linear-gradient(135deg,#1e3a5f,#2563eb)',padding:'20px 20px 22px',borderRadius:'20px 0 0 0',flexShrink:0}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
            <div>
              <p style={{fontSize:11,color:'rgba(255,255,255,0.6)',marginBottom:3,textTransform:'uppercase',letterSpacing:'0.05em'}}>Facture émise</p>
              <h3 style={{fontSize:20,fontWeight:800,color:'#fff',fontFamily:'monospace'}}>{invoice.invoice_number}</h3>
            </div>
            <button onClick={onClose} style={{background:'rgba(255,255,255,0.12)',border:'none',borderRadius:8,padding:7,cursor:'pointer',color:'#fff',display:'flex'}}>{Ic.x}</button>
          </div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{display:'inline-flex',alignItems:'center',gap:6,padding:'4px 12px',borderRadius:20,background:'rgba(255,255,255,0.15)'}}>
              <span style={{width:7,height:7,borderRadius:'50%',background:st.dot}}/>
              <span style={{fontSize:12,fontWeight:600,color:'#fff'}}>{st.label}</span>
            </div>
            <span style={{fontSize:22,fontWeight:800,color:'#fff'}}>{fmt(invoice.total_amount||0)}</span>
          </div>
        </div>

        <div style={{flex:1,overflowY:'auto',padding:18}}>
          <div style={{background:C.bg,borderRadius:12,padding:14,marginBottom:14,border:`1px solid ${C.border}`}}>
            <p style={{...lbl,marginBottom:8}}>Client</p>
            <p style={{fontWeight:700,color:C.text,fontSize:14}}>{cli?.name||invoice.client_name||'—'}</p>
            {cli?.email&&<p style={{fontSize:12,color:C.slate,marginTop:3}}>{cli.email}</p>}
            {prj&&<p style={{fontSize:12,color:C.blue,marginTop:4,display:'flex',alignItems:'center',gap:5}}>{Ic.link}{prj.name}</p>}
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:14}}>
            {[
              {l:'Émission',  v:fmtD(invoice.issue_date)},
              {l:'Échéance',  v:fmtD(invoice.due_date)},
              {l:'HTVA',      v:fmt(subtotal)},
              {l:'TVA',       v:fmt(vat_amount)}
            ].map((d,i)=>(
              <div key={i} style={{background:C.bg,borderRadius:10,padding:'10px 12px',border:`1px solid ${C.border}`}}>
                <p style={{fontSize:10,color:'#94a3b8',marginBottom:3,textTransform:'uppercase',letterSpacing:'0.04em'}}>{d.l}</p>
                <p style={{fontSize:13,fontWeight:600,color:C.text}}>{d.v}</p>
              </div>
            ))}
          </div>

          <div style={{background:C.bg,borderRadius:12,padding:14,marginBottom:14,border:`1px solid ${C.border}`}}>
            <p style={{...lbl,marginBottom:10}}>Lignes ({safeLines.length})</p>
            {safeLines.map((l,i)=>(
              <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',padding:'7px 0',borderBottom:i<safeLines.length-1?`1px solid ${C.border}`:'none'}}>
                <div style={{flex:1,marginRight:8}}>
                  <p style={{fontSize:13,fontWeight:500,color:'#1e293b'}}>{l.description}</p>
                  <p style={{fontSize:11,color:'#94a3b8',marginTop:2}}>{l.quantity} × {fmt(l.unit_price)} · TVA {l.vat_rate}%</p>
                </div>
                <p style={{fontSize:13,fontWeight:700,color:C.text,flexShrink:0}}>{fmt((Number(l.quantity)||0)*(Number(l.unit_price)||0))}</p>
              </div>
            ))}
          </div>

          <div style={{background:C.bg,borderRadius:12,padding:14,border:`1px solid ${C.border}`,marginBottom:14}}>
            <p style={{...lbl,marginBottom:10}}>Modifier le statut</p>
            <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
              {Object.entries(STATUS_OUT).filter(([k])=>k!==invoice.status).map(([k,v])=>(
                <button key={k} onClick={()=>onStatusChange(invoice.id,k as Invoice['status'])}
                  style={{padding:'5px 12px',borderRadius:20,border:`1px solid ${v.dot}50`,background:v.bg,color:v.color,fontSize:12,fontWeight:600,cursor:'pointer'}}>
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{padding:'14px 16px',borderTop:`1px solid ${C.border}`,display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,flexShrink:0}}>
          <button onClick={()=>generatePDF(invoice,cli)} style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6,padding:'9px 0',borderRadius:10,border:`1.5px solid ${C.primary}`,background:'#fff',color:C.primary,fontSize:13,fontWeight:600,cursor:'pointer'}}>
            {Ic.pdf} Télécharger PDF
          </button>
          <button onClick={onEdit} style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6,padding:'9px 0',borderRadius:10,border:'none',background:`linear-gradient(135deg,${C.primary},${C.blue})`,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'}}>
            {Ic.edit} Modifier
          </button>
          <button onClick={onDelete} style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6,padding:'9px 0',borderRadius:10,border:'1.5px solid #fecaca',background:'#fef2f2',color:'#ef4444',fontSize:13,fontWeight:600,cursor:'pointer',gridColumn:'1/-1'}}>
            {Ic.trash} Supprimer cette facture
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Drawer détail facture reçue ──────────────────────────────────────────────
function IncomingDrawer({ invoice, clients, projects, onClose, onDelete }:{
  invoice:ExternalInvoice|null; clients:Client[]; projects:Project[]
  onClose:()=>void; onDelete:()=>void
}) {
  if (!invoice) return null
  const st  = STATUS_IN[invoice.status] || STATUS_IN.pending
  const cli = clients.find(c=>c.id===invoice.client_id)
  const prj = projects.find(p=>p.id===invoice.project_id)

  return (
    <div style={{position:'fixed',inset:0,zIndex:190,display:'flex',justifyContent:'flex-end'}}>
      <div style={{position:'absolute',inset:0,background:'rgba(15,23,42,0.35)',backdropFilter:'blur(3px)'}} onClick={onClose}/>
      <div style={{...card,position:'relative',width:400,height:'100%',borderRadius:'20px 0 0 20px',display:'flex',flexDirection:'column',overflowY:'auto',zIndex:1}}>
        <div style={{background:`linear-gradient(135deg,${C.primary},#334155)`,padding:'20px 20px 22px',borderRadius:'20px 0 0 0',flexShrink:0}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
            <div>
              <p style={{fontSize:11,color:'rgba(255,255,255,0.6)',marginBottom:3,textTransform:'uppercase',letterSpacing:'0.05em'}}>Facture fournisseur</p>
              <h3 style={{fontSize:16,fontWeight:800,color:'#fff'}}>{invoice.supplier_name}</h3>
            </div>
            <button onClick={onClose} style={{background:'rgba(255,255,255,0.12)',border:'none',borderRadius:8,padding:7,cursor:'pointer',color:'#fff',display:'flex'}}>{Ic.x}</button>
          </div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{display:'inline-flex',alignItems:'center',gap:6,padding:'4px 12px',borderRadius:20,background:'rgba(255,255,255,0.15)'}}>
              <span style={{width:7,height:7,borderRadius:'50%',background:st.dot}}/>
              <span style={{fontSize:12,fontWeight:600,color:'#fff'}}>{st.label}</span>
            </div>
            <span style={{fontSize:22,fontWeight:800,color:'#fff'}}>{fmt(invoice.total_amount||0)}</span>
          </div>
        </div>

        <div style={{flex:1,overflowY:'auto',padding:18}}>
          {invoice.file_name && (
            <div style={{background:'#eff6ff',border:`1.5px solid #bfdbfe`,borderRadius:12,padding:14,marginBottom:14}}>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:invoice.file_url?12:0}}>
                <div style={{width:36,height:36,background:'#dbeafe',borderRadius:9,display:'flex',alignItems:'center',justifyContent:'center',color:C.blue,flexShrink:0}}>{Ic.attach}</div>
                <div style={{flex:1,minWidth:0}}>
                  <p style={{fontSize:13,fontWeight:700,color:C.primary,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{invoice.file_name}</p>
                  <p style={{fontSize:11,color:'#1d4ed8',marginTop:2}}>{invoice.file_url?'Document disponible en ligne':'Référence locale'}</p>
                </div>
              </div>
              {invoice.file_url ? (
                <a href={invoice.file_url} target="_blank" rel="noopener noreferrer"
                  style={{display:'flex',alignItems:'center',justifyContent:'center',gap:7,padding:'9px 0',borderRadius:9,textDecoration:'none',background:`linear-gradient(135deg,${C.primary},${C.blue})`,color:'#fff',fontSize:13,fontWeight:700}}>
                  {Ic.eye} Ouvrir le document
                </a>
              ) : (
                <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6,padding:'8px 0',borderRadius:9,background:'#dbeafe',color:'#1d4ed8',fontSize:12,fontWeight:500}}>
                  {Ic.attach}<span>Fichier stocké localement</span>
                </div>
              )}
            </div>
          )}

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:14}}>
            {[
              {l:'Montant HT', v:fmt(invoice.amount_ht||0),    c:C.text,    bg:C.bg,    bd:C.border},
              {l:'TVA',        v:fmt(invoice.vat_amount||0),   c:C.slate,   bg:C.bg,    bd:C.border},
              {l:'Total TTC',  v:fmt(invoice.total_amount||0), c:C.primary, bg:'#eff6ff',bd:'#bfdbfe'},
            ].map((d,i)=>(
              <div key={i} style={{background:d.bg,borderRadius:10,padding:'10px 8px',border:`1.5px solid ${d.bd}`,textAlign:'center'}}>
                <p style={{fontSize:10,color:'#94a3b8',marginBottom:4,textTransform:'uppercase',letterSpacing:'0.04em'}}>{d.l}</p>
                <p style={{fontSize:13,fontWeight:800,color:d.c}}>{d.v}</p>
              </div>
            ))}
          </div>

          <div style={{background:C.bg,borderRadius:12,padding:14,marginBottom:14,border:`1px solid ${C.border}`}}>
            <p style={{...lbl,marginBottom:10}}>Détails</p>
            {[
              {l:'Fournisseur',  v:invoice.supplier_name},
              {l:'Catégorie',    v:invoice.category},
              {l:'Date facture', v:fmtD(invoice.issue_date)},
              {l:'Échéance',     v:fmtD(invoice.due_date||'')},
              {l:'Client lié',   v:cli?.name||'—'},
              {l:'Projet lié',   v:prj?.name||'—'},
            ].map((r,i,arr)=>(
              <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:i<arr.length-1?`1px solid ${C.border}`:'none'}}>
                <span style={{fontSize:12,color:'#94a3b8'}}>{r.l}</span>
                <span style={{fontSize:13,fontWeight:600,color:C.text,maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',textAlign:'right'}}>{r.v}</span>
              </div>
            ))}
          </div>

          {invoice.notes && (
            <div style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:12,padding:14}}>
              <p style={{...lbl,color:'#92400e',marginBottom:6}}>Notes</p>
              <p style={{fontSize:13,color:'#78350f',lineHeight:1.6}}>{invoice.notes}</p>
            </div>
          )}
        </div>

        <div style={{padding:'14px 16px',borderTop:`1px solid ${C.border}`,display:'flex',flexDirection:'column',gap:8,flexShrink:0}}>
          {invoice.file_url && (
            <a href={invoice.file_url} target="_blank" rel="noopener noreferrer"
              style={{display:'flex',alignItems:'center',justifyContent:'center',gap:7,padding:'10px 0',borderRadius:10,textDecoration:'none',border:`1.5px solid #bfdbfe`,background:'#eff6ff',color:C.primary,fontSize:13,fontWeight:700}}>
              {Ic.eye} Visualiser le document
            </a>
          )}
          <button onClick={onDelete}
            style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:6,padding:'10px 0',borderRadius:10,cursor:'pointer',border:'1.5px solid #fecaca',background:'#fef2f2',color:'#ef4444',fontSize:13,fontWeight:600}}>
            {Ic.trash} Supprimer cette facture
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── PAGE PRINCIPALE ──────────────────────────────────────────────────────────
export default function InvoicesPage() {
  const [tab,       setTab]       = useState<TabMode>('outgoing')
  const [invoices,  setInvoices]  = useState<Invoice[]>([])
  const [extInvs,   setExtInvs]   = useState<ExternalInvoice[]>([])
  const [clients,   setClients]   = useState<Client[]>([])
  const [projects,  setProjects]  = useState<Project[]>([])
  const [loading,   setLoading]   = useState(true)
  const [view,      setView]      = useState<'list'|'grid'>('list')

  const [search,    setSearch]    = useState('')
  const [statusF,   setStatusF]   = useState('all')
  const [clientF,   setClientF]   = useState('all')
  const [projectF,  setProjectF]  = useState('all')
  const [dateFrom,  setDateFrom]  = useState('')
  const [dateTo,    setDateTo]    = useState('')
  const [supplierF, setSupplierF] = useState('all')
  const [categoryF, setCategoryF] = useState('all')

  const [outModal,  setOutModal]  = useState(false)
  const [impModal,  setImpModal]  = useState(false)
  const [editInv,   setEditInv]   = useState<Invoice|null>(null)
  const [viewOut,   setViewOut]   = useState<Invoice|null>(null)
  const [viewIn,    setViewIn]    = useState<ExternalInvoice|null>(null)
  const [deleteId,  setDeleteId]  = useState<{id:string;type:'out'|'in'}|null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const fetchSafe = async (url: string) => {
        try {
          const r = await fetch(url)
          if (!r.ok) return {}
          const text = await r.text()
          if (!text || text.trim() === '') return {}
          return JSON.parse(text)
        } catch { return {} }
      }
      const [invD, extD, cliD, prjD] = await Promise.all([
        fetchSafe('/api/invoices'),
        fetchSafe('/api/external-invoices'),
        fetchSafe('/api/clients'),
        fetchSafe('/api/projects'),
      ])
      setInvoices((Array.isArray(invD) ? invD : invD.data ?? []).map((inv: Record<string,unknown>) => ({
        ...inv,
        lines: typeof inv.lines === 'string' ? JSON.parse(inv.lines as string) : (Array.isArray(inv.lines) ? inv.lines : []),
      })))
      setExtInvs((Array.isArray(extD) ? extD : extD.data ?? []))
      setClients((Array.isArray(cliD) ? cliD : cliD.data ?? []))
      setProjects((Array.isArray(prjD) ? prjD : prjD.data ?? []))
    } catch (e) {
      console.error('InvoicesPage load error:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ── Filtres factures émises ──
  const filteredOut = invoices.filter(inv => {
    const q   = search.toLowerCase()
    const hit = !q || inv.invoice_number?.toLowerCase().includes(q) || inv.client_name?.toLowerCase().includes(q) || inv.project_name?.toLowerCase().includes(q)
    const dOk = (!dateFrom || inv.issue_date >= dateFrom) && (!dateTo || inv.issue_date <= dateTo)
    return hit && (statusF==='all'||inv.status===statusF) && (clientF==='all'||inv.client_id===clientF) && (projectF==='all'||inv.project_id===projectF) && dOk
  })

  // ── Filtres factures reçues ──
  const availableSuppliers = [...new Set(extInvs.map(e => e.supplier_name).filter(Boolean))]
  const filteredIn = extInvs.filter(inv => {
    const q   = search.toLowerCase()
    const hit = !q || inv.supplier_name?.toLowerCase().includes(q) || inv.file_name?.toLowerCase().includes(q)
    const dOk = (!dateFrom || inv.issue_date >= dateFrom) && (!dateTo || inv.issue_date <= dateTo)
    return hit && (statusF==='all'||inv.status===statusF) && (clientF==='all'||inv.client_id===clientF) && (projectF==='all'||inv.project_id===projectF) && (supplierF==='all'||inv.supplier_name===supplierF) && (categoryF==='all'||inv.category===categoryF) && dOk
  })

  // ── KPIs factures émises ──
  const kOut = {
    total:   invoices.length,
    paid:    invoices.filter(i=>i.status==='paid').length,
    pending: invoices.filter(i=>i.status==='sent').length,
    overdue: invoices.filter(i=>i.status==='overdue').length,
    revenue: invoices.filter(i=>i.status==='paid').reduce((s,i)=>s+(i.total_amount||0),0),
    waiting: invoices.filter(i=>['sent','draft'].includes(i.status)).reduce((s,i)=>s+(i.total_amount||0),0),
  }
  // ── KPIs factures reçues ──
  const kIn = {
    total:     extInvs.length,
    pending:   extInvs.filter(i=>i.status==='pending').length,
    paid:      extInvs.filter(i=>i.status==='paid').length,
    total_ht:  extInvs.reduce((s,i)=>s+(i.amount_ht||0),0),
    total_ttc: extInvs.reduce((s,i)=>s+(i.total_amount||0),0),
  }

  async function saveOut(data: Partial<Invoice>) {
    const url    = editInv ? `/api/invoices/${editInv.id}` : '/api/invoices'
    const method = editInv ? 'PATCH' : 'POST'
    const res = await fetch(url, { method, headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) })
    if (!res.ok) {
      let msg = `Erreur ${res.status}`
      try { const j = await res.json(); msg = j?.error ?? msg } catch { /* ignore */ }
      throw new Error(msg)
    }
    setOutModal(false); setEditInv(null); load()
  }

  async function saveExt(data: Omit<ExternalInvoice,'id'|'created_at'>) {
    // Sanitize : envoyer null (pas '') pour les champs UUID optionnels
    const payload = {
      ...data,
      client_id:   data.client_id   && data.client_id.trim()   !== '' ? data.client_id   : null,
      project_id:  data.project_id  && data.project_id.trim()  !== '' ? data.project_id  : null,
      supplier_id: data.supplier_id && data.supplier_id.trim() !== '' ? data.supplier_id : null,
      file_url:    data.file_url    && data.file_url.trim()    !== '' ? data.file_url    : null,
      file_name:   data.file_name   && data.file_name.trim()   !== '' ? data.file_name   : null,
      due_date:    data.due_date    && data.due_date.trim()    !== '' ? data.due_date    : null,
      notes:       data.notes       && data.notes.trim()       !== '' ? data.notes       : null,
    }
    const res = await fetch('/api/external-invoices', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      let msg = `Erreur ${res.status}`
      try { const j = await res.json(); msg = j?.error ?? msg } catch { /* ignore */ }
      throw new Error(msg)
    }
    setImpModal(false); load()
  }

  async function delOut(id: string) {
    await fetch(`/api/invoices/${id}`,{method:'DELETE'})
    setDeleteId(null); setViewOut(null); load()
  }
  async function delIn(id: string) {
    await fetch(`/api/external-invoices/${id}`,{method:'DELETE'})
    setDeleteId(null); setViewIn(null); load()
  }

  async function changeStatus(id: string, status: Invoice['status']) {
    await fetch(`/api/invoices/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})})
    load()
  }

  function openEdit(inv: Invoice) { setEditInv(inv); setViewOut(null); setOutModal(true) }
  function resetFilters() { setSearch(''); setStatusF('all'); setClientF('all'); setProjectF('all'); setDateFrom(''); setDateTo(''); setSupplierF('all'); setCategoryF('all') }

  function exportCSV() {
    if (tab==='outgoing') {
      const rows=[
        ['N° Facture','Client','Projet','Émission','Échéance','HTVA','TVA','TTC','Statut'],
        ...filteredOut.map(i=>[i.invoice_number,i.client_name||'',i.project_name||'',fmtD(i.issue_date),fmtD(i.due_date),i.subtotal,i.vat_amount,i.total_amount,STATUS_OUT[i.status]?.label||''])
      ]
      const csv=rows.map(r=>r.map(v=>`"${v||''}"`).join(',')).join('\n')
      const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download='factures-emises.csv'; a.click()
    } else {
      const rows=[
        ['Fournisseur','Fichier','Catégorie','Date','HTVA','TVA','TTC','Statut'],
        ...filteredIn.map(i=>[i.supplier_name,i.file_name,i.category,fmtD(i.issue_date),i.amount_ht,i.vat_amount,i.total_amount,STATUS_IN[i.status]?.label||''])
      ]
      const csv=rows.map(r=>r.map(v=>`"${v||''}"`).join(',')).join('\n')
      const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download='factures-fournisseurs.csv'; a.click()
    }
  }

  const hasFilters = !!(search||statusF!=='all'||clientF!=='all'||projectF!=='all'||dateFrom||dateTo||supplierF!=='all'||categoryF!=='all')

  // ── Badge statut ──
  function StatusBadge({ s, type }: { s:string; type:'out'|'in' }) {
    const st = type==='out' ? STATUS_OUT[s] : STATUS_IN[s]
    if (!st) return null
    return (
      <div style={{display:'inline-flex',alignItems:'center',gap:5,padding:'4px 10px',borderRadius:20,background:st.bg,border:`1px solid ${st.border}`}}>
        <span style={{width:6,height:6,borderRadius:'50%',background:st.dot}}/>
        <span style={{fontSize:11,fontWeight:700,color:st.color}}>{st.label}</span>
      </div>
    )
  }

  return (
    <div style={{padding:24,maxWidth:1600,margin:'0 auto'}}>
      <style>{`
        @keyframes spin { to { transform:rotate(360deg) } }
        .tr-row:hover td { background:#f0f7ff !important; }
        .tr-row td { transition:background 0.1s; cursor:pointer; }
        .inv-card:hover { transform:translateY(-2px); box-shadow:0 8px 24px rgba(0,0,0,0.09) !important; }
        .inv-card { transition:all 0.18s; }
        select,input,textarea { font-family:inherit; }
        input:focus,select:focus,textarea:focus { outline:none; border-color:${C.blue} !important; box-shadow:0 0 0 3px rgba(37,99,235,0.1); }
        .tab-btn { transition:all 0.15s; }
        .tab-btn:hover { background:rgba(255,255,255,0.06); }
      `}</style>

      {/* ── En-tête ── */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24,flexWrap:'wrap',gap:12}}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <div style={{width:42,height:42,borderRadius:12,background:`linear-gradient(135deg,${C.primary},${C.blue})`,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff'}}>
            {Ic.invoice}
          </div>
          <div>
            <h1 style={{fontSize:21,fontWeight:800,color:C.text}}>Facturation</h1>
            <p style={{fontSize:12,color:'#94a3b8',marginTop:2}}>
              {kOut.total} facture(s) émise(s) · {kIn.total} facture(s) fournisseur(s)
            </p>
          </div>
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <button onClick={exportCSV} style={{display:'flex',alignItems:'center',gap:7,padding:'9px 14px',borderRadius:10,border:`1.5px solid ${C.border}`,background:'#fff',fontSize:13,fontWeight:600,color:C.slate,cursor:'pointer'}}>
            {Ic.export} Export CSV
          </button>
          <button onClick={()=>{setEditInv(null);setOutModal(true)}} style={{display:'flex',alignItems:'center',gap:7,padding:'9px 16px',borderRadius:10,border:'none',background:`linear-gradient(135deg,${C.primary},${C.blue})`,fontSize:13,fontWeight:700,color:'#fff',cursor:'pointer',boxShadow:`0 4px 14px rgba(30,58,95,0.30)`}}>
            {Ic.fileOut} Nouvelle facture
          </button>
          <button onClick={()=>setImpModal(true)} style={{display:'flex',alignItems:'center',gap:7,padding:'9px 16px',borderRadius:10,border:'none',background:`linear-gradient(135deg,#1e3a5f,#334155)`,fontSize:13,fontWeight:700,color:'#fff',cursor:'pointer',boxShadow:`0 4px 14px rgba(30,58,95,0.20)`}}>
            {Ic.fileIn} Importer facture
          </button>
        </div>
      </div>

      {/* ── Onglets ── */}
      <div style={{display:'flex',gap:0,marginBottom:18,background:C.bg,borderRadius:14,padding:4,width:'fit-content',border:`1px solid ${C.border}`}}>
        {([
          {key:'outgoing',label:'Factures clients',     count:kOut.total, icon:Ic.fileOut},
          {key:'incoming',label:'Factures fournisseurs',count:kIn.total,  icon:Ic.fileIn},
        ] as {key:TabMode;label:string;count:number;icon:React.ReactNode}[]).map(t=>(
          <button key={t.key} className="tab-btn" onClick={()=>{setTab(t.key);setStatusF('all');setSearch('')}} style={{
            padding:'10px 22px',border:'none',borderRadius:10,cursor:'pointer',
            background:tab===t.key?'#fff':'transparent',
            color:tab===t.key?C.primary:'#94a3b8',
            fontSize:13,fontWeight:700,
            boxShadow:tab===t.key?'0 2px 8px rgba(0,0,0,0.07)':'none',
            display:'flex',alignItems:'center',gap:8,
          }}>
            <span style={{color:tab===t.key?C.primary:'#cbd5e1'}}>{t.icon}</span>
            {t.label}
            <span style={{background:tab===t.key?`${C.primary}18`:'#f1f5f9',color:tab===t.key?C.primary:'#94a3b8',borderRadius:20,padding:'1px 8px',fontSize:11,fontWeight:700}}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* ── KPIs ── */}
      {tab==='outgoing' ? (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(155px,1fr))',gap:12,marginBottom:16}}>
          {[
            {l:'Total',       v:kOut.total,   isN:false, color:C.blue,  border:'#bfdbfe', bg:'#eff6ff'},
            {l:'Payées',      v:kOut.paid,    isN:false, color:'#10b981',border:'#a7f3d0', bg:'#ecfdf5'},
            {l:'En attente',  v:kOut.pending, isN:false, color:'#f59e0b',border:'#fde68a', bg:'#fffbeb'},
            {l:'En retard',   v:kOut.overdue, isN:false, color:'#ef4444',border:'#fecaca', bg:'#fef2f2'},
            {l:'CA encaissé', v:kOut.revenue, isN:true,  color:'#10b981',border:'#a7f3d0', bg:'#ecfdf5'},
            {l:'À encaisser', v:kOut.waiting, isN:true,  color:'#f59e0b',border:'#fde68a', bg:'#fffbeb'},
          ].map((k,i)=>(
            <div key={i} style={{background:k.bg,borderRadius:13,border:`1.5px solid ${k.border}`,padding:'13px 15px'}}>
              <p style={{fontSize:10,fontWeight:700,color:C.slate,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:5}}>{k.l}</p>
              <p style={{fontSize:k.isN?14:22,fontWeight:800,color:k.color}}>{k.isN?fmt(k.v as number):k.v}</p>
            </div>
          ))}
        </div>
      ) : (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:12,marginBottom:16}}>
          {[
            {l:'Total reçues', v:kIn.total,     isN:false, color:C.primary, border:'#bfdbfe', bg:'#eff6ff'},
            {l:'En attente',   v:kIn.pending,   isN:false, color:'#f59e0b', border:'#fde68a', bg:'#fffbeb'},
            {l:'Payées',       v:kIn.paid,      isN:false, color:'#10b981', border:'#a7f3d0', bg:'#ecfdf5'},
            {l:'Total HT',     v:kIn.total_ht,  isN:true,  color:C.primary, border:'#bfdbfe', bg:'#eff6ff'},
            {l:'Total TTC',    v:kIn.total_ttc, isN:true,  color:C.blue,    border:'#bfdbfe', bg:'#eff6ff'},
          ].map((k,i)=>(
            <div key={i} style={{background:k.bg,borderRadius:13,border:`1.5px solid ${k.border}`,padding:'13px 15px'}}>
              <p style={{fontSize:10,fontWeight:700,color:C.slate,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:5}}>{k.l}</p>
              <p style={{fontSize:k.isN?14:22,fontWeight:800,color:k.color}}>{k.isN?fmt(k.v as number):k.v}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Filtres ── */}
      <div style={{...card,padding:'14px 16px',marginBottom:16}}>
        <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center',marginBottom:10}}>
          <div style={{flex:1,minWidth:200,position:'relative'}}>
            <span style={{position:'absolute',left:11,top:'50%',transform:'translateY(-50%)',color:'#94a3b8',pointerEvents:'none'}}>{Ic.search}</span>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder={tab==='outgoing'?'N° facture, client, projet…':'Fournisseur, fichier…'}
              style={{...inp,paddingLeft:34}}/>
          </div>
          <select value={statusF} onChange={e=>setStatusF(e.target.value)} style={{...inp,width:'auto',minWidth:148}}>
            <option value="all">Tous les statuts</option>
            {Object.entries(tab==='outgoing'?STATUS_OUT:STATUS_IN).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={clientF} onChange={e=>setClientF(e.target.value)} style={{...inp,width:'auto',minWidth:160}}>
            <option value="all">Tous les clients</option>
            {clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={projectF} onChange={e=>setProjectF(e.target.value)} style={{...inp,width:'auto',minWidth:160}}>
            <option value="all">Tous les projets</option>
            {projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {tab==='incoming'&&(
            <>
              <select value={supplierF} onChange={e=>setSupplierF(e.target.value)} style={{...inp,width:'auto',minWidth:160}}>
                <option value="all">Tous les fournisseurs</option>
                {availableSuppliers.map(s=><option key={s} value={s}>{s}</option>)}
              </select>
              <select value={categoryF} onChange={e=>setCategoryF(e.target.value)} style={{...inp,width:'auto',minWidth:148}}>
                <option value="all">Toutes catégories</option>
                {EXT_CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </>
          )}
        </div>
        <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{fontSize:12,color:'#94a3b8',flexShrink:0,display:'flex',alignItems:'center',gap:4}}>{Ic.calendar} Du</span>
            <input type="date" style={{...inp,width:'auto'}} value={dateFrom} onChange={e=>setDateFrom(e.target.value)}/>
            <span style={{fontSize:12,color:'#94a3b8',flexShrink:0}}>au</span>
            <input type="date" style={{...inp,width:'auto'}} value={dateTo} onChange={e=>setDateTo(e.target.value)}/>
          </div>
          {hasFilters&&(
            <button onClick={resetFilters} style={{display:'flex',alignItems:'center',gap:6,padding:'7px 12px',borderRadius:8,border:'1.5px solid #fecaca',background:'#fef2f2',color:'#ef4444',fontSize:12,fontWeight:600,cursor:'pointer'}}>
              {Ic.x} Réinitialiser les filtres
            </button>
          )}
          <div style={{marginLeft:'auto',display:'flex',gap:6}}>
            <div style={{display:'flex',gap:3,background:'#f1f5f9',padding:4,borderRadius:10}}>
              {(['list','grid'] as const).map(v=>(
                <button key={v} onClick={()=>setView(v)} style={{padding:7,border:'none',borderRadius:7,cursor:'pointer',background:view===v?'#fff':'transparent',color:view===v?C.blue:'#94a3b8',boxShadow:view===v?'0 1px 4px rgba(0,0,0,0.10)':'none',display:'flex',transition:'all 0.15s'}}>
                  {v==='list'?Ic.list:Ic.grid}
                </button>
              ))}
            </div>
            <button onClick={load} style={{background:'#fff',border:`1.5px solid ${C.border}`,borderRadius:10,padding:'7px 12px',cursor:'pointer',color:C.slate,display:'flex',alignItems:'center',gap:5,fontSize:12}}>
              {Ic.refresh}
            </button>
          </div>
        </div>
      </div>

      {/* ── Contenu ── */}
      {loading ? (
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',padding:'80px 0'}}>
          <div style={{textAlign:'center'}}>
            <div style={{width:36,height:36,border:`3px solid ${C.blue}`,borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto 12px'}}/>
            <p style={{fontSize:13,color:'#94a3b8'}}>Chargement des données…</p>
          </div>
        </div>

      ) : tab==='outgoing' ? (
        filteredOut.length===0 ? (
          <div style={{...card,padding:60,textAlign:'center'}}>
            <div style={{width:56,height:56,background:C.bg,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px',color:'#cbd5e1'}}>{Ic.invoice}</div>
            <p style={{fontSize:15,fontWeight:700,color:'#475569'}}>Aucune facture trouvée</p>
            <p style={{fontSize:13,color:'#94a3b8',marginTop:6}}>{hasFilters?'Essayez de modifier vos filtres.':'Créez votre première facture client.'}</p>
          </div>
        ) : view==='list' ? (
          <div style={{...card,overflow:'hidden'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
              <thead>
                <tr style={{background:C.bg,borderBottom:`2px solid ${C.border}`}}>
                  {['N° Facture','Client','Projet','Émission','Échéance','HTVA','TTC','Statut','Actions'].map((h,i)=>(
                    <th key={h} style={{padding:'11px 14px',textAlign:i>=8?'center':'left',fontSize:10,fontWeight:700,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'0.05em',whiteSpace:'nowrap'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredOut.map(inv=>(
                  <tr key={inv.id} className="tr-row" style={{borderBottom:`1px solid #f8fafc`}} onClick={()=>setViewOut(inv)}>
                    <td style={{padding:'12px 14px'}}>
                      <p style={{fontWeight:800,color:C.text,fontFamily:'monospace',fontSize:13}}>{inv.invoice_number}</p>
                      <p style={{fontSize:10,color:'#94a3b8',marginTop:1}}>{new Date(inv.created_at).toLocaleDateString('fr-BE')}</p>
                    </td>
                    <td style={{padding:'12px 14px'}}>
                      <p style={{fontWeight:600,color:'#1e293b',fontSize:13}}>{inv.client_name||'—'}</p>
                    </td>
                    <td style={{padding:'12px 14px'}}>
                      <p style={{fontSize:12,color:C.blue}}>{inv.project_name||'—'}</p>
                    </td>
                    <td style={{padding:'12px 14px',color:C.slate,fontSize:12}}>{fmtD(inv.issue_date)}</td>
                    <td style={{padding:'12px 14px'}}>
                      <p style={{color:inv.status==='overdue'?'#ef4444':C.slate,fontWeight:inv.status==='overdue'?700:400,fontSize:12}}>{fmtD(inv.due_date)}</p>
                    </td>
                    <td style={{padding:'12px 14px',fontSize:12,color:C.slate}}>{fmt(inv.subtotal||0)}</td>
                    <td style={{padding:'12px 14px'}}>
                      <p style={{fontWeight:800,color:C.text,fontSize:14}}>{fmt(inv.total_amount||0)}</p>
                    </td>
                    <td style={{padding:'12px 14px'}} onClick={e=>e.stopPropagation()}>
                      <StatusBadge s={inv.status} type="out"/>
                    </td>
                    <td style={{padding:'12px 14px'}} onClick={e=>e.stopPropagation()}>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:4}}>
                        <AB onClick={()=>setViewOut(inv)} title="Voir le détail" icon={Ic.eye} hBg='#eff6ff' hCol={C.blue}/>
                        <AB onClick={()=>openEdit(inv)} title="Modifier" icon={Ic.edit} hBg='#fef9c3' hCol='#d97706'/>
                        <AB onClick={()=>{const c=clients.find(x=>x.id===inv.client_id);generatePDF(inv,c)}} title="Télécharger PDF" icon={Ic.pdf} hBg='#ecfdf5' hCol='#10b981'/>
                        <AB onClick={()=>setDeleteId({id:inv.id,type:'out'})} title="Supprimer" icon={Ic.trash} hBg='#fef2f2' hCol='#ef4444'/>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{padding:'9px 16px',borderTop:`1px solid #f8fafc`,display:'flex',justifyContent:'space-between',background:'#fafafa',fontSize:12,color:'#94a3b8'}}>
              <span>{filteredOut.length} résultat(s) sur {invoices.length}</span>
              <span>Total TTC filtré : <strong style={{color:'#10b981'}}>{fmt(filteredOut.reduce((s,i)=>s+(i.total_amount||0),0))}</strong></span>
            </div>
          </div>
        ) : (
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:14}}>
            {filteredOut.map(inv=>{
              const st=STATUS_OUT[inv.status]
              return(
                <div key={inv.id} className="inv-card" style={{background:'#fff',borderRadius:14,border:`1.5px solid ${st.border}`,boxShadow:'0 2px 8px rgba(0,0,0,0.04)',overflow:'hidden'}}>
                  <div style={{height:3,background:`linear-gradient(90deg,${C.primary},${C.blue})`}}/>
                  <div style={{padding:'16px 16px 14px'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}>
                      <div>
                        <p style={{fontWeight:800,color:C.text,fontFamily:'monospace',fontSize:14}}>{inv.invoice_number}</p>
                        <p style={{fontSize:12,color:C.slate,marginTop:2}}>{inv.client_name}</p>
                        {inv.project_name&&<p style={{fontSize:11,color:C.blue,marginTop:2}}>{inv.project_name}</p>}
                      </div>
                      <StatusBadge s={inv.status} type="out"/>
                    </div>
                    <div style={{background:`linear-gradient(135deg,${C.primary},${C.blue})`,borderRadius:11,padding:'12px 14px',textAlign:'center',marginBottom:12}}>
                      <p style={{color:'rgba(255,255,255,0.65)',fontSize:11,marginBottom:3}}>Total TTC</p>
                      <p style={{color:'#fff',fontSize:20,fontWeight:800}}>{fmt(inv.total_amount||0)}</p>
                      <p style={{color:'rgba(255,255,255,0.55)',fontSize:11,marginTop:2}}>Échéance : {fmtD(inv.due_date)}</p>
                    </div>
                    <div style={{display:'flex',gap:5,paddingTop:10,borderTop:`1px solid ${C.border}`}}>
                      <AB onClick={()=>setViewOut(inv)} title="Voir" icon={Ic.eye} hBg='#eff6ff' hCol={C.blue}/>
                      <AB onClick={()=>openEdit(inv)} title="Modifier" icon={Ic.edit} hBg='#fef9c3' hCol='#d97706'/>
                      <AB onClick={()=>{const c=clients.find(x=>x.id===inv.client_id);generatePDF(inv,c)}} title="PDF" icon={Ic.pdf} hBg='#ecfdf5' hCol='#10b981'/>
                      <AB onClick={()=>setDeleteId({id:inv.id,type:'out'})} title="Supprimer" icon={Ic.trash} hBg='#fef2f2' hCol='#ef4444'/>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )

      ) : (
        filteredIn.length===0 ? (
          <div style={{...card,padding:60,textAlign:'center'}}>
            <div style={{width:56,height:56,background:'#eff6ff',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px',color:C.blue}}>{Ic.fileIn}</div>
            <p style={{fontSize:15,fontWeight:700,color:'#475569'}}>Aucune facture fournisseur</p>
            <p style={{fontSize:13,color:'#94a3b8',marginTop:6}}>{hasFilters?'Essayez de modifier vos filtres.':'Importez votre première facture fournisseur.'}</p>
            <button onClick={()=>setImpModal(true)} style={{marginTop:20,padding:'10px 24px',borderRadius:10,border:'none',background:`linear-gradient(135deg,${C.primary},${C.blue})`,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',display:'inline-flex',alignItems:'center',gap:7}}>
              {Ic.fileIn} Importer une facture
            </button>
          </div>
        ) : view==='list' ? (
          <div style={{...card,overflow:'hidden'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
              <thead>
                <tr style={{background:C.bg,borderBottom:`2px solid ${C.border}`}}>
                  {['Fournisseur','Document','Catégorie','Date','Client lié','Projet lié','HT','TTC','Statut','Actions'].map((h,i)=>(
                    <th key={h} style={{padding:'11px 14px',textAlign:i>=9?'center':'left',fontSize:10,fontWeight:700,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'0.05em',whiteSpace:'nowrap'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredIn.map(inv=>{
                  const cli = clients.find(c=>c.id===inv.client_id)
                  const prj = projects.find(p=>p.id===inv.project_id)
                  return(
                    <tr key={inv.id} className="tr-row" style={{borderBottom:`1px solid #f8fafc`}} onClick={()=>setViewIn(inv)}>
                      <td style={{padding:'12px 14px'}}>
                        <p style={{fontWeight:700,color:C.primary,fontSize:13}}>{inv.supplier_name}</p>
                        <p style={{fontSize:10,color:'#94a3b8',marginTop:1}}>{fmtD(inv.created_at)}</p>
                      </td>
                      <td style={{padding:'12px 14px'}}>
                        {inv.file_name?(
                          <div style={{display:'flex',alignItems:'center',gap:6}}>
                            <span style={{color:C.blue}}>{Ic.attach}</span>
                            <span style={{fontSize:12,color:C.primary,maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{inv.file_name}</span>
                          </div>
                        ):<span style={{fontSize:12,color:'#cbd5e1'}}>—</span>}
                      </td>
                      <td style={{padding:'12px 14px'}}>
                        <span style={{fontSize:11,background:'#eff6ff',color:C.blue,padding:'3px 8px',borderRadius:6,fontWeight:600}}>{inv.category}</span>
                      </td>
                      <td style={{padding:'12px 14px',color:C.slate,fontSize:12}}>{fmtD(inv.issue_date)}</td>
                      <td style={{padding:'12px 14px',fontSize:12,color:'#475569'}}>{cli?.name||'—'}</td>
                      <td style={{padding:'12px 14px',fontSize:12,color:C.blue}}>{prj?.name||'—'}</td>
                      <td style={{padding:'12px 14px',fontSize:12,color:C.slate}}>{fmt(inv.amount_ht||0)}</td>
                      <td style={{padding:'12px 14px'}}>
                        <p style={{fontWeight:800,color:C.primary,fontSize:14}}>{fmt(inv.total_amount||0)}</p>
                      </td>
                      <td style={{padding:'12px 14px'}} onClick={e=>e.stopPropagation()}>
                        <StatusBadge s={inv.status} type="in"/>
                      </td>
                      <td style={{padding:'12px 14px'}} onClick={e=>e.stopPropagation()}>
                        <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:4}}>
                          <AB onClick={()=>setViewIn(inv)} title="Voir le détail" icon={Ic.eye} hBg='#eff6ff' hCol={C.blue}/>
                          <AB onClick={()=>setDeleteId({id:inv.id,type:'in'})} title="Supprimer" icon={Ic.trash} hBg='#fef2f2' hCol='#ef4444'/>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div style={{padding:'9px 16px',borderTop:`1px solid #f8fafc`,display:'flex',justifyContent:'space-between',background:'#fafafa',fontSize:12,color:'#94a3b8'}}>
              <span>{filteredIn.length} résultat(s) sur {extInvs.length}</span>
              <span>Total TTC filtré : <strong style={{color:C.primary}}>{fmt(filteredIn.reduce((s,i)=>s+(i.total_amount||0),0))}</strong></span>
            </div>
          </div>
        ) : (
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:14}}>
            {filteredIn.map(inv=>{
              const st=STATUS_IN[inv.status]||STATUS_IN.pending
              const cli=clients.find(c=>c.id===inv.client_id)
              return(
                <div key={inv.id} className="inv-card" style={{background:'#fff',borderRadius:14,border:`1.5px solid ${st.border}`,boxShadow:'0 2px 8px rgba(0,0,0,0.04)',overflow:'hidden'}}>
                  <div style={{height:3,background:`linear-gradient(90deg,${C.primary},${C.blue})`}}/>
                  <div style={{padding:'16px 16px 14px'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
                      <div>
                        <p style={{fontWeight:800,color:C.primary,fontSize:14}}>{inv.supplier_name}</p>
                        <span style={{fontSize:11,background:'#eff6ff',color:C.blue,padding:'2px 7px',borderRadius:5,fontWeight:600,display:'inline-block',marginTop:4}}>{inv.category}</span>
                      </div>
                      <StatusBadge s={inv.status} type="in"/>
                    </div>
                    {inv.file_name&&<p style={{fontSize:12,color:C.blue,display:'flex',alignItems:'center',gap:5,marginBottom:8}}>{Ic.attach}{inv.file_name}</p>}
                    <div style={{background:`linear-gradient(135deg,${C.primary},${C.blue})`,borderRadius:11,padding:'12px 14px',textAlign:'center',marginBottom:12}}>
                      <p style={{color:'rgba(255,255,255,0.65)',fontSize:11,marginBottom:3}}>Total TTC</p>
                      <p style={{color:'#fff',fontSize:20,fontWeight:800}}>{fmt(inv.total_amount||0)}</p>
                      <p style={{color:'rgba(255,255,255,0.55)',fontSize:11,marginTop:2}}>HT : {fmt(inv.amount_ht||0)}</p>
                    </div>
                    {cli&&<p style={{fontSize:12,color:C.slate,marginBottom:10,display:'flex',alignItems:'center',gap:5}}>{Ic.link}{cli.name}</p>}
                    <div style={{display:'flex',gap:5,paddingTop:10,borderTop:`1px solid ${C.border}`}}>
                      <AB onClick={()=>setViewIn(inv)} title="Voir le détail" icon={Ic.eye} hBg='#eff6ff' hCol={C.blue}/>
                      <AB onClick={()=>setDeleteId({id:inv.id,type:'in'})} title="Supprimer" icon={Ic.trash} hBg='#fef2f2' hCol='#ef4444'/>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}

      {/* ── Modal suppression ── */}
      {deleteId&&(
        <div style={{position:'fixed',inset:0,zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
          <div style={{position:'absolute',inset:0,background:'rgba(15,23,42,0.5)',backdropFilter:'blur(6px)'}} onClick={()=>setDeleteId(null)}/>
          <div style={{...card,position:'relative',width:'100%',maxWidth:380,padding:28,textAlign:'center',zIndex:1}}>
            <div style={{width:52,height:52,background:'#fef2f2',border:'2px solid #fecaca',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px',color:'#ef4444'}}>{Ic.trash}</div>
            <h3 style={{fontSize:16,fontWeight:700,color:C.text,marginBottom:8}}>Supprimer cette facture ?</h3>
            <p style={{fontSize:13,color:'#94a3b8',marginBottom:22,lineHeight:1.6}}>Cette action est définitive et irréversible.</p>
            <div style={{display:'flex',gap:10}}>
              <button onClick={()=>setDeleteId(null)} style={{flex:1,padding:'10px 0',borderRadius:10,border:`1.5px solid ${C.border}`,background:'#fff',fontSize:13,fontWeight:600,color:C.slate,cursor:'pointer'}}>Annuler</button>
              <button onClick={()=>deleteId.type==='out'?delOut(deleteId.id):delIn(deleteId.id)} style={{flex:1,padding:'10px 0',borderRadius:10,border:'none',background:'#ef4444',fontSize:13,fontWeight:700,color:'#fff',cursor:'pointer'}}>Supprimer</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modals & Drawers ── */}
      <OutgoingModal
        open={outModal} onClose={()=>{setOutModal(false);setEditInv(null)}}
        onSave={saveOut} initial={editInv} clients={clients} projects={projects}
      />
      <ImportModal
        open={impModal} onClose={()=>setImpModal(false)}
        onSave={saveExt} clients={clients} projects={projects}
      />
      <OutgoingDrawer
        invoice={viewOut} clients={clients} projects={projects}
        onClose={()=>setViewOut(null)}
        onEdit={()=>{ if(viewOut) openEdit(viewOut) }}
        onDelete={()=>{ if(viewOut) setDeleteId({id:viewOut.id,type:'out'}) }}
        onStatusChange={changeStatus}
      />
      <IncomingDrawer
        invoice={viewIn} clients={clients} projects={projects}
        onClose={()=>setViewIn(null)}
        onDelete={()=>{ if(viewIn) setDeleteId({id:viewIn.id,type:'in'}) }}
      />
    </div>
  )
}
