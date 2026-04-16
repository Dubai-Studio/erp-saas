'use client'
import { useState, useEffect, useCallback } from 'react'
import jsPDF from 'jspdf'

// ─── Types ───────────────────────────────────────────────────────────────────
interface StockItem {
  id: string
  name: string
  reference: string
  category: string
  quantity: number
  min_quantity: number
  unit_price: number
  selling_price: number
  supplier: string
  supplier_ref?: string
  location: string
  unit: string
  status: 'in_stock' | 'low_stock' | 'out_of_stock'
  vat_rate: number
  total_value: number
  last_restock?: string
  expiry_date?: string
  notes?: string
  created_at: string
}

interface StockMovement {
  id: string
  stock_item_id: string
  item_name: string
  type: 'in' | 'out' | 'adjustment' | 'return' | 'loss'
  quantity: number
  unit_price: number
  reason: string
  date: string
  created_at: string
}

interface StockValuation {
  totalItems: number
  totalQuantity: number
  totalCostValue: number
  totalSellingValue: number
  potentialMargin: number
  marginPct: number
  lowStockCount: number
  outOfStockCount: number
  vatAmount: number
}

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS: Record<string, { label: string; color: string; bg: string; border: string; dot: string }> = {
  in_stock:     { label: 'En stock',     color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', dot: '#22c55e' },
  low_stock:    { label: 'Stock faible', color: '#d97706', bg: '#fffbeb', border: '#fde68a', dot: '#f59e0b' },
  out_of_stock: { label: 'Rupture',      color: '#dc2626', bg: '#fef2f2', border: '#fecaca', dot: '#ef4444' },
}

const CATEGORIES = [
  'Matières premières', 'Produits finis', 'Consommables', 'Emballages',
  'Outillage', 'Équipements', 'Fournitures bureau', 'Pièces détachées',
  'Produits chimiques', 'Marchandises', 'Autre',
]

const UNITS = ['pcs', 'kg', 'g', 'L', 'mL', 'm', 'cm', 'm²', 'm³', 'boîte', 'carton', 'palette', 'rouleau', 'lot']

const VAT_RATES = [0, 6, 12, 21]

const MOVEMENT_TYPES: Record<string, { label: string; color: string; bg: string; sign: 1 | -1 | 0 }> = {
  in:         { label: 'Entrée',      color: '#16a34a', bg: '#f0fdf4', sign:  1 },
  out:        { label: 'Sortie',      color: '#dc2626', bg: '#fef2f2', sign: -1 },
  adjustment: { label: 'Ajustement', color: '#7c3aed', bg: '#f5f3ff', sign:  0 },
  return:     { label: 'Retour',     color: '#2563eb', bg: '#eff6ff', sign:  1 },
  loss:       { label: 'Perte',      color: '#9f1239', bg: '#fff1f2', sign: -1 },
}

const COMPANY = { name: 'Wasalak SPRL', address: 'Bruxelles, Belgique', vat: 'BE 0000.000.000' }

const EMPTY: Omit<StockItem, 'id' | 'created_at'> = {
  name: '', reference: '', category: CATEGORIES[0], quantity: 0,
  min_quantity: 0, unit_price: 0, selling_price: 0, supplier: '',
  supplier_ref: '', location: '', unit: 'pcs', status: 'in_stock',
  vat_rate: 21, total_value: 0, last_restock: '', expiry_date: '', notes: '',
}

const EMPTY_MOV: Omit<StockMovement, 'id' | 'created_at' | 'item_name'> = {
  stock_item_id: '', type: 'in', quantity: 1, unit_price: 0, reason: '', date: '',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt    = (v: number) => new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' }).format(v || 0)
const fmtD   = (d?: string) => d ? new Date(d).toLocaleDateString('fr-BE') : '—'
const todayStr   = () => new Date().toISOString().split('T')[0]
const autoStatus = (qty: number, min: number): StockItem['status'] =>
  qty <= 0 ? 'out_of_stock' : qty <= min ? 'low_stock' : 'in_stock'
const marginColor = (pct: number) => pct >= 30 ? '#16a34a' : pct >= 15 ? '#d97706' : '#dc2626'
const stockPct    = (qty: number, min: number) =>
  min > 0 ? Math.min(100, Math.round((qty / (min * 3)) * 100)) : 100

async function fetchSafe<T>(url: string): Promise<T[]> {
  try {
    const r = await fetch(url)
    if (!r.ok) return []
    const j = await r.json()
    return Array.isArray(j) ? j : j.data ?? j.items ?? []
  } catch { return [] }
}

// ─── SVG Icons ───────────────────────────────────────────────────────────────
const I: Record<string, JSX.Element> = {
  plus:      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>,
  edit:      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>,
  trash:     <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>,
  eye:       <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  x:         <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>,
  search:    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>,
  list:      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
  grid:      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>,
  pdf:       <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  export:    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  refresh:   <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>,
  package:   <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
  move:      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>,
  alert:     <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  chart:     <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  euro:      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 10h12M4 14h12M19.5 8A7 7 0 1 0 19.5 16"/></svg>,
  tag:       <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>,
  sort:      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="9" y2="18"/></svg>,
  warehouse: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  restock:   <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8"/><polyline points="7.5 4.21 12 6.81 16.5 4.21"/><polyline points="7.5 19.79 7.5 14.6 3 12"/><polyline points="21 12 16.5 14.6 16.5 19.79"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
  calendar:  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  supplier:  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>,
  barcode:   <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 5v14M7 5v14M13 5v14M17 5v14M21 5v14M11 5v6M11 14v4"/></svg>,
}

// ─── Shared Styles ────────────────────────────────────────────────────────────
const card  = { background:'#fff', borderRadius:12, border:'1px solid #e2e8f0', padding:24 }
const inp   = { width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid #e2e8f0', fontSize:14, outline:'none', boxSizing:'border-box' as const, background:'#f8fafc' }
const lbl   = { fontSize:13, fontWeight:600, color:'#374151', marginBottom:4, display:'block' as const }
const btn   = (c = '#2563eb') => ({ background:c, color:'#fff', border:'none', borderRadius:8, padding:'9px 16px', fontSize:13, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:6 })
const btnGh = { background:'transparent', color:'#64748b', border:'1px solid #e2e8f0', borderRadius:8, padding:'8px 14px', fontSize:13, fontWeight:500, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }

// ─── PDF Report Generator ─────────────────────────────────────────────────────
async function generateStockPDF(items: StockItem[], valuation: StockValuation) {
  const { default: autoTable } = await import('jspdf-autotable')
  const W = 297
  const now = new Date().toLocaleDateString('fr-BE')

  doc.setFillColor(37, 99, 235)
  doc.rect(0, 0, W, 28, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16); doc.setFont('helvetica', 'bold')
  doc.text('RAPPORT DE STOCK', 14, 12)
  doc.setFontSize(9); doc.setFont('helvetica', 'normal')
  doc.text(`${COMPANY.name} — TVA: ${COMPANY.vat}`, 14, 20)
  doc.text(`Généré le ${now}`, W - 14, 20, { align: 'right' })

  const kpis = [
    { l: 'Articles',          v: String(valuation.totalItems) },
    { l: 'Qté totale',        v: String(valuation.totalQuantity) },
    { l: 'Valeur coût',       v: fmt(valuation.totalCostValue) },
    { l: 'Valeur vente',      v: fmt(valuation.totalSellingValue) },
    { l: 'Marge potentielle', v: `${valuation.marginPct.toFixed(1)}%` },
    { l: 'Alertes stock',     v: String(valuation.lowStockCount + valuation.outOfStockCount) },
  ]
  kpis.forEach((k, i) => {
    const x = 14 + i * 44; const y = 34
    doc.setFillColor(248, 250, 252); doc.setDrawColor(226, 232, 240)
    doc.roundedRect(x, y, 40, 18, 2, 2, 'FD')
    doc.setFontSize(7); doc.setTextColor(100, 116, 139); doc.setFont('helvetica', 'normal')
    doc.text(k.l, x + 20, y + 6, { align: 'center' })
    doc.setFontSize(9); doc.setTextColor(15, 23, 42); doc.setFont('helvetica', 'bold')
    doc.text(k.v, x + 20, y + 13, { align: 'center' })
  })

  autoTable(doc, {
    startY: 58,
    head: [['Réf.','Article','Catégorie','Qté','Unité','Prix achat HT','Prix vente HT','TVA %','Val. coût','Val. vente','Marge','Statut','Emplacement']],
    body: items.map(it => {
      const cost   = (it.quantity || 0) * (it.unit_price || 0)
      const sell   = (it.quantity || 0) * (it.selling_price || 0)
      const margin = sell - cost
      const marginP = sell > 0 ? ((margin / sell) * 100).toFixed(1) + '%' : '—'
      return [
        it.reference || '—', it.name, it.category,
        it.quantity, it.unit,
        fmt(it.unit_price), fmt(it.selling_price),
        `${it.vat_rate ?? 21}%`,
        fmt(cost), fmt(sell), marginP,
        STATUS[it.status]?.label ?? it.status,
        it.location || '—',
      ]
    }),
    styles: { fontSize: 7, cellPadding: 2.5 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 0: { cellWidth: 18 }, 1: { cellWidth: 34 }, 2: { cellWidth: 24 } },
  })

  const pages = (doc as any).internal.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFontSize(7); doc.setTextColor(148, 163, 184)
    doc.text(`${COMPANY.name} — Rapport confidentiel`, 14, 205)
    doc.text(`Page ${p} / ${pages}`, W - 14, 205, { align: 'right' })
  }
  doc.save(`rapport-stock-${todayStr()}.pdf`)
}

// ─── Movement PDF ─────────────────────────────────────────────────────────────
async function generateMovementPDF(movements: StockMovement[]) {
  const { default: autoTable } = await import('jspdf-autotable')
  const W = 210
  const now = new Date().toLocaleDateString('fr-BE')

  doc.setFillColor(37, 99, 235); doc.rect(0, 0, W, 28, 'F')
  doc.setTextColor(255, 255, 255); doc.setFontSize(15); doc.setFont('helvetica', 'bold')
  doc.text('JOURNAL DES MOUVEMENTS DE STOCK', 14, 12)
  doc.setFontSize(9); doc.setFont('helvetica', 'normal')
  doc.text(COMPANY.name, 14, 20)
  doc.text(`Édité le ${now}`, W - 14, 20, { align: 'right' })

  autoTable(doc, {
    startY: 34,
    head: [['Date','Article','Type','Quantité','P.U.','Valeur','Motif']],
    body: movements.map(m => [
      fmtD(m.date || m.created_at),
      m.item_name,
      MOVEMENT_TYPES[m.type]?.label ?? m.type,
      (MOVEMENT_TYPES[m.type]?.sign === -1 ? '-' : '+') + m.quantity,
      fmt(m.unit_price),
      fmt(m.quantity * m.unit_price),
      m.reason || '—',
    ]),
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  })

  const pages = (doc as any).internal.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFontSize(7); doc.setTextColor(148, 163, 184)
    doc.text(COMPANY.name, 14, 290)
    doc.text(`Page ${p} / ${pages}`, W - 14, 290, { align: 'right' })
  }
  doc.save(`journal-mouvements-${todayStr()}.pdf`)
}

// ─── CSV Export ───────────────────────────────────────────────────────────────
function exportCSV(items: StockItem[]) {
  const headers = [
    'Référence','Nom','Catégorie','Quantité','Unité',
    'Prix achat HT','Prix vente HT','TVA %',
    'Valeur coût','Valeur vente','Marge €','Marge %',
    'Fournisseur','Emplacement','Statut','Dernière réception','Date expiration',
  ]
  const rows = items.map(it => {
    const cost    = (it.quantity || 0) * (it.unit_price || 0)
    const sell    = (it.quantity || 0) * (it.selling_price || 0)
    const margin  = sell - cost
    const marginP = sell > 0 ? ((margin / sell) * 100).toFixed(2) : '0'
    return [
      it.reference, it.name, it.category, it.quantity, it.unit,
      it.unit_price, it.selling_price, it.vat_rate ?? 21,
      cost.toFixed(2), sell.toFixed(2), margin.toFixed(2), marginP,
      it.supplier, it.location, STATUS[it.status]?.label ?? it.status,
      it.last_restock || '', it.expiry_date || '',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
  })
  const blob = new Blob(['\uFEFF' + [headers.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `stock-${todayStr()}.csv`
  a.click()
}

// ─── Valuation Calculator ─────────────────────────────────────────────────────
function calcValuation(items: StockItem[]): StockValuation {
  const totalItems        = items.length
  const totalQuantity     = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0)
  const totalCostValue    = items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0)
  const totalSellingValue = items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.selling_price) || 0), 0)
  const potentialMargin   = totalSellingValue - totalCostValue
  const marginPct         = totalSellingValue > 0 ? (potentialMargin / totalSellingValue) * 100 : 0
  const lowStockCount     = items.filter(i => i.status === 'low_stock').length
  const outOfStockCount   = items.filter(i => i.status === 'out_of_stock').length
  const vatAmount         = items.reduce((s, i) => {
    const cost = (Number(i.quantity) || 0) * (Number(i.unit_price) || 0)
    return s + cost * ((Number(i.vat_rate) || 21) / 100)
  }, 0)
  return { totalItems, totalQuantity, totalCostValue, totalSellingValue, potentialMargin, marginPct, lowStockCount, outOfStockCount, vatAmount }
}

// ─── Stock Item Modal ─────────────────────────────────────────────────────────
function StockModal({ item, onSave, onClose }: {
  item: Partial<StockItem> | null
  onSave: (data: Partial<StockItem>) => Promise<void>
  onClose: () => void
}) {
  const isEdit = !!item?.id
  const [form, setForm]   = useState<Partial<StockItem>>(item ?? { ...EMPTY })
  const [tab, setTab]     = useState<'info' | 'pricing' | 'extra'>('info')
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const set = (k: keyof StockItem, v: unknown) => {
    setForm(f => {
      const next = { ...f, [k]: v }
      if (k === 'quantity' || k === 'min_quantity') {
        const qty = Number(k === 'quantity' ? v : f.quantity) || 0
        const min = Number(k === 'min_quantity' ? v : f.min_quantity) || 0
        next.status = autoStatus(qty, min)
      }
      if (k === 'quantity' || k === 'unit_price') {
        const qty = Number(k === 'quantity' ? v : f.quantity) || 0
        const up  = Number(k === 'unit_price'  ? v : f.unit_price)  || 0
        next.total_value = qty * up
      }
      return next
    })
    setErrors(e => ({ ...e, [k]: '' }))
  }

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.name?.trim())      e.name      = 'Nom requis'
    // reference optionnelle
    if ((form.quantity  ?? -1) < 0) e.quantity  = 'Quantité invalide'
    if ((form.unit_price ?? -1) < 0) e.unit_price = 'Prix invalide'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const submit = async () => {
    if (!validate()) return
    setSaving(true)
    try { await onSave(form) } finally { setSaving(false) }
  }

  const tabs: { key: typeof tab; label: string }[] = [
    { key: 'info',    label: 'Informations' },
    { key: 'pricing', label: 'Tarification' },
    { key: 'extra',   label: 'Extra / Notes' },
  ]

  const inputStyle = (k: string) => ({ ...inp, borderColor: errors[k] ? '#ef4444' : '#e2e8f0' })

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:640, maxHeight:'92vh', overflow:'hidden', display:'flex', flexDirection:'column', boxShadow:'0 25px 60px rgba(0,0,0,.2)' }}>

        {/* Header */}
        <div style={{ padding:'20px 24px', borderBottom:'1px solid #e2e8f0', display:'flex', alignItems:'center', justifyContent:'space-between', background:'linear-gradient(135deg,#2563eb,#1d4ed8)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ color:'#fff' }}>{I.package}</span>
            <div>
              <div style={{ fontWeight:700, fontSize:16, color:'#fff' }}>{isEdit ? "Modifier l'article" : 'Nouvel article'}</div>
              {isEdit && <div style={{ fontSize:12, color:'#bfdbfe' }}>Réf. {item?.reference}</div>}
            </div>
          </div>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,.15)', border:'none', borderRadius:8, padding:8, cursor:'pointer', color:'#fff', display:'flex' }}>{I.x}</button>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', borderBottom:'1px solid #e2e8f0', padding:'0 24px' }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{ padding:'12px 16px', border:'none', background:'none', cursor:'pointer', fontSize:13, fontWeight:600, color: tab === t.key ? '#2563eb' : '#64748b', borderBottom: tab === t.key ? '2px solid #2563eb' : '2px solid transparent' }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ padding:24, overflowY:'auto', flex:1 }}>

          {/* Tab: Info */}
          {tab === 'info' && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
              <div style={{ gridColumn:'1/-1' }}>
                <label style={lbl}>Nom de l&apos;article *</label>
                <input style={inputStyle('name')} value={form.name ?? ''} onChange={e => set('name', e.target.value)} placeholder="Ex: Vis M8x20 inox" />
                {errors.name && <span style={{ color:'#ef4444', fontSize:12 }}>{errors.name}</span>}
              </div>
              <div>
                <label style={lbl}>Référence *</label>
                <input style={inputStyle('reference')} value={form.reference ?? ''} onChange={e => set('reference', e.target.value)} placeholder="VIS-M8-001" />
                {errors.reference && <span style={{ color:'#ef4444', fontSize:12 }}>{errors.reference}</span>}
              </div>
              <div>
                <label style={lbl}>Catégorie</label>
                <select style={inp} value={form.category ?? CATEGORIES[0]} onChange={e => set('category', e.target.value)}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Quantité *</label>
                <input style={inputStyle('quantity')} type="number" min="0" value={form.quantity ?? 0} onChange={e => set('quantity', Number(e.target.value))} />
                {errors.quantity && <span style={{ color:'#ef4444', fontSize:12 }}>{errors.quantity}</span>}
              </div>
              <div>
                <label style={lbl}>Quantité min. alerte</label>
                <input style={inp} type="number" min="0" value={form.min_quantity ?? 0} onChange={e => set('min_quantity', Number(e.target.value))} />
              </div>
              <div>
                <label style={lbl}>Unité</label>
                <select style={inp} value={form.unit ?? 'pcs'} onChange={e => set('unit', e.target.value)}>
                  {UNITS.map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Emplacement</label>
                <input style={inp} value={form.location ?? ''} onChange={e => set('location', e.target.value)} placeholder="Étagère A-12" />
              </div>
              <div>
                <label style={lbl}>Statut</label>
                <div style={{ ...inp, background: STATUS[form.status ?? 'in_stock']?.bg, color: STATUS[form.status ?? 'in_stock']?.color, fontWeight:600, display:'flex', alignItems:'center', gap:6 }}>
                  <span style={{ width:8, height:8, borderRadius:'50%', background: STATUS[form.status ?? 'in_stock']?.dot, display:'inline-block' }} />
                  {STATUS[form.status ?? 'in_stock']?.label}
                </div>
              </div>
            </div>
          )}

          {/* Tab: Pricing */}
          {tab === 'pricing' && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
              <div>
                <label style={lbl}>Prix d&apos;achat HT (€) *</label>
                <input style={inputStyle('unit_price')} type="number" min="0" step="0.01" value={form.unit_price ?? 0} onChange={e => set('unit_price', Number(e.target.value))} />
                {errors.unit_price && <span style={{ color:'#ef4444', fontSize:12 }}>{errors.unit_price}</span>}
              </div>
              <div>
                <label style={lbl}>Prix de vente HT (€)</label>
                <input style={inp} type="number" min="0" step="0.01" value={form.selling_price ?? 0} onChange={e => set('selling_price', Number(e.target.value))} />
              </div>
              <div>
                <label style={lbl}>Taux TVA (%)</label>
                <select style={inp} value={form.vat_rate ?? 21} onChange={e => set('vat_rate', Number(e.target.value))}>
                  {VAT_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Valeur totale stock (auto)</label>
                <div style={{ ...inp, background:'#f0fdf4', color:'#15803d', fontWeight:700 }}>
                  {fmt((form.quantity || 0) * (form.unit_price || 0))}
                </div>
              </div>

              {(form.selling_price ?? 0) > 0 && (form.unit_price ?? 0) > 0 && (() => {
                const sp   = Number(form.selling_price) || 0
                const up   = Number(form.unit_price)    || 0
                const marg = sp - up
                const pct  = sp > 0 ? (marg / sp) * 100 : 0
                return (
                  <div style={{ gridColumn:'1/-1', background:'#f8fafc', borderRadius:10, padding:16, border:'1px solid #e2e8f0' }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'#374151', marginBottom:10 }}>Aperçu marges à l&apos;unité</div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
                      {[
                        { l:'Marge unitaire', v: fmt(marg),               c: marginColor(pct) },
                        { l:'Taux de marge',  v: `${pct.toFixed(1)}%`,    c: marginColor(pct) },
                        { l:'Prix TTC vente', v: fmt(sp * (1 + (Number(form.vat_rate) || 21) / 100)), c:'#2563eb' },
                      ].map(k => (
                        <div key={k.l} style={{ textAlign:'center', padding:'8px 0' }}>
                          <div style={{ fontSize:11, color:'#6b7280' }}>{k.l}</div>
                          <div style={{ fontSize:16, fontWeight:700, color: k.c }}>{k.v}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}

              <div>
                <label style={lbl}>Fournisseur</label>
                <input style={inp} value={form.supplier ?? ''} onChange={e => set('supplier', e.target.value)} placeholder="Nom du fournisseur" />
              </div>
              <div>
                <label style={lbl}>Réf. fournisseur</label>
                <input style={inp} value={form.supplier_ref ?? ''} onChange={e => set('supplier_ref', e.target.value)} placeholder="SUP-REF-001" />
              </div>
            </div>
          )}

          {/* Tab: Extra */}
          {tab === 'extra' && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
              <div>
                <label style={lbl}>Dernière réception</label>
                <input style={inp} type="date" value={form.last_restock ?? ''} onChange={e => set('last_restock', e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Date d&apos;expiration</label>
                <input style={inp} type="date" value={form.expiry_date ?? ''} onChange={e => set('expiry_date', e.target.value)} />
              </div>
              <div style={{ gridColumn:'1/-1' }}>
                <label style={lbl}>Notes internes</label>
                <textarea style={{ ...inp, minHeight:100, resize:'vertical' }} value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} placeholder="Informations complémentaires..." />
              </div>
              {form.expiry_date && new Date(form.expiry_date) < new Date(Date.now() + 30 * 864e5) && (
                <div style={{ gridColumn:'1/-1', background:'#fffbeb', border:'1px solid #fde68a', borderRadius:8, padding:12, display:'flex', gap:8, alignItems:'center' }}>
                  <span style={{ color:'#d97706' }}>{I.alert}</span>
                  <span style={{ fontSize:13, color:'#92400e' }}>Attention : cet article expire dans moins de 30 jours.</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:'16px 24px', borderTop:'1px solid #e2e8f0', display:'flex', justifyContent:'space-between', alignItems:'center', background:'#f8fafc' }}>
          <button onClick={onClose} style={btnGh}>Annuler</button>
          <button onClick={submit} disabled={saving} style={btn(saving ? '#93c5fd' : '#2563eb')}>
            {saving ? 'Enregistrement…' : isEdit ? 'Mettre à jour' : "Créer l'article"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Movement Modal ───────────────────────────────────────────────────────────
function MovementModal({ items, onSave, onClose }: {
  items: StockItem[]
  onSave: (data: Omit<StockMovement, 'id' | 'created_at'>) => Promise<void>
  onClose: () => void
}) {
  const [form, setForm]   = useState({ ...EMPTY_MOV, date: todayStr() })
  const [saving, setSaving] = useState(false)

  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }))
  const selectedItem = items.find(i => i.id === form.stock_item_id)
  const mv       = MOVEMENT_TYPES[form.type]
  const totalVal = (Number(form.quantity) || 0) * (Number(form.unit_price) || selectedItem?.unit_price || 0)

  const submit = async () => {
    if (!form.stock_item_id || form.quantity <= 0) return
    setSaving(true)
    try {
      await onSave({
        ...form,
        item_name:  selectedItem?.name ?? '',
        unit_price: Number(form.unit_price) || selectedItem?.unit_price || 0,
      })
    } finally { setSaving(false) }
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:1100, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:500, boxShadow:'0 25px 60px rgba(0,0,0,.2)' }}>
        <div style={{ padding:'20px 24px', borderBottom:'1px solid #e2e8f0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontWeight:700, fontSize:15, display:'flex', alignItems:'center', gap:8 }}>{I.move} Enregistrer un mouvement</div>
          <button onClick={onClose} style={{ ...btnGh, padding:6 }}>{I.x}</button>
        </div>

        <div style={{ padding:24, display:'grid', gap:16 }}>
          <div>
            <label style={lbl}>Article *</label>
            <select style={inp} value={form.stock_item_id} onChange={e => set('stock_item_id', e.target.value)}>
              <option value="">— Sélectionner —</option>
              {items.map(i => <option key={i.id} value={i.id}>{i.name} ({i.reference}) — {i.quantity} {i.unit}</option>)}
            </select>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div>
              <label style={lbl}>Type de mouvement</label>
              <select style={{ ...inp, background: mv.bg, color: mv.color, fontWeight:600 }} value={form.type} onChange={e => set('type', e.target.value)}>
                {Object.entries(MOVEMENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Quantité *</label>
              <input style={inp} type="number" min="1" value={form.quantity} onChange={e => set('quantity', Number(e.target.value))} />
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div>
              <label style={lbl}>Prix unitaire (€)</label>
              <input style={inp} type="number" min="0" step="0.01" placeholder={String(selectedItem?.unit_price ?? 0)} value={form.unit_price || ''} onChange={e => set('unit_price', e.target.value)} />
            </div>
            <div>
              <label style={lbl}>Date</label>
              <input style={inp} type="date" value={form.date} onChange={e => set('date', e.target.value)} />
            </div>
          </div>

          <div>
            <label style={lbl}>Motif / Description</label>
            <input style={inp} value={form.reason} onChange={e => set('reason', e.target.value)} placeholder="Ex: Livraison fournisseur, commande client..." />
          </div>

          {form.stock_item_id && form.quantity > 0 && (
            <div style={{ background: mv.bg, border:`1px solid ${mv.color}30`, borderRadius:10, padding:14 }}>
              <div style={{ fontSize:12, color: mv.color, fontWeight:700, marginBottom:8 }}>Aperçu du mouvement</div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:13 }}>
                <span style={{ color:'#374151' }}>Quantité {mv.sign === -1 ? 'retirée' : 'ajoutée'}</span>
                <span style={{ fontWeight:700, color: mv.color }}>{mv.sign === -1 ? '-' : '+'}{form.quantity} {selectedItem?.unit}</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginTop:4 }}>
                <span style={{ color:'#374151' }}>Valeur de mouvement</span>
                <span style={{ fontWeight:700, color: mv.color }}>{fmt(totalVal)}</span>
              </div>
              {selectedItem && (
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginTop:4 }}>
                  <span style={{ color:'#374151' }}>Stock résultant</span>
                  <span style={{ fontWeight:700 }}>
                    {form.type === 'adjustment'
                      ? form.quantity
                      : Math.max(0, selectedItem.quantity + (mv.sign === -1 ? -form.quantity : form.quantity))
                    } {selectedItem.unit}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ padding:'16px 24px', borderTop:'1px solid #e2e8f0', display:'flex', justifyContent:'space-between' }}>
          <button onClick={onClose} style={btnGh}>Annuler</button>
          <button onClick={submit} disabled={saving || !form.stock_item_id} style={btn(saving || !form.stock_item_id ? '#93c5fd' : '#2563eb')}>
            {saving ? 'Enregistrement…' : 'Enregistrer le mouvement'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Stock Drawer ─────────────────────────────────────────────────────────────
function StockDrawer({ item, movements, onEdit, onClose }: {
  item: StockItem
  movements: StockMovement[]
  onEdit: () => void
  onClose: () => void
}) {
  const cost          = (item.quantity || 0) * (item.unit_price || 0)
  const sell          = (item.quantity || 0) * (item.selling_price || 0)
  const margin        = sell - cost
  const marginP       = sell > 0 ? (margin / sell) * 100 : 0
  const pct           = stockPct(item.quantity, item.min_quantity)
  const st            = STATUS[item.status] ?? STATUS.in_stock
  const itemMovements = movements.filter(m => m.product_id === item.id).slice(0, 10)
  const vatAmt        = cost * ((item.vat_rate ?? 21) / 100)

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.35)', zIndex:900, display:'flex', justifyContent:'flex-end' }}>
      <div style={{ width:'min(520px,100vw)', background:'#fff', height:'100%', overflowY:'auto', boxShadow:'-8px 0 40px rgba(0,0,0,.15)', display:'flex', flexDirection:'column' }}>

        {/* Header */}
        <div style={{ padding:'20px 24px', background:'linear-gradient(135deg,#2563eb,#1d4ed8)', position:'sticky', top:0, zIndex:10 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div>
              <div style={{ fontSize:18, fontWeight:800, color:'#fff' }}>{item.name}</div>
              <div style={{ fontSize:13, color:'#bfdbfe', marginTop:2 }}>Réf. {item.reference}</div>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={onEdit}  style={{ background:'rgba(255,255,255,.2)', border:'none', borderRadius:8, padding:8, cursor:'pointer', color:'#fff', display:'flex' }}>{I.edit}</button>
              <button onClick={onClose} style={{ background:'rgba(255,255,255,.2)', border:'none', borderRadius:8, padding:8, cursor:'pointer', color:'#fff', display:'flex' }}>{I.x}</button>
            </div>
          </div>
          <div style={{ marginTop:12, display:'flex', gap:8, flexWrap:'wrap' }}>
            <span style={{ background: st.bg, color: st.color, border:`1px solid ${st.border}`, borderRadius:20, padding:'3px 10px', fontSize:12, fontWeight:600 }}>{st.label}</span>
            <span style={{ background:'rgba(255,255,255,.15)', color:'#fff', borderRadius:20, padding:'3px 10px', fontSize:12 }}>{item.category}</span>
          </div>
        </div>

        <div style={{ padding:24, flex:1 }}>
          {/* Stock level bar */}
          <div style={{ ...card, marginBottom:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
              <span style={{ fontSize:13, fontWeight:600, color:'#374151' }}>Niveau de stock</span>
              <span style={{ fontSize:13, fontWeight:700, color: st.color }}>{item.quantity} {item.unit}</span>
            </div>
            <div style={{ height:8, background:'#f1f5f9', borderRadius:4, overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${pct}%`, background: pct > 50 ? '#22c55e' : pct > 25 ? '#f59e0b' : '#ef4444', borderRadius:4, transition:'width .3s' }} />
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#94a3b8', marginTop:4 }}>
              <span>0</span>
              <span>Min: {item.min_quantity} {item.unit}</span>
            </div>
          </div>

          {/* Financial KPIs */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
            {[
              { l:'Valeur coût stock',  v: fmt(cost),                                                              c:'#2563eb' },
              { l:'Valeur vente stock', v: fmt(sell),                                                              c:'#16a34a' },
              { l:'Marge potentielle',  v: fmt(margin),                                                            c: marginColor(marginP) },
              { l:'Taux de marge',      v: `${marginP.toFixed(1)}%`,                                               c: marginColor(marginP) },
              { l:'TVA sur stock',      v: fmt(vatAmt),                                                            c:'#7c3aed' },
              { l:'P.U. achat HT',      v: fmt(item.unit_price),                                                   c:'#374151' },
              { l:'P.U. vente HT',      v: fmt(item.selling_price),                                                c:'#374151' },
              { l:'P.U. vente TTC',     v: fmt(item.selling_price * (1 + (item.vat_rate ?? 21) / 100)),            c:'#374151' },
            ].map(k => (
              <div key={k.l} style={{ background:'#f8fafc', borderRadius:8, padding:'10px 14px', border:'1px solid #e2e8f0' }}>
                <div style={{ fontSize:11, color:'#6b7280', marginBottom:2 }}>{k.l}</div>
                <div style={{ fontSize:15, fontWeight:700, color: k.c }}>{k.v}</div>
              </div>
            ))}
          </div>

          {/* Details */}
          <div style={{ ...card, marginBottom:16 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#374151', marginBottom:12 }}>Détails article</div>
            {[
              { l:'Fournisseur',        v: item.supplier      || '—' },
              { l:'Réf. fourn.',        v: item.supplier_ref  || '—' },
              { l:'Emplacement',        v: item.location      || '—' },
              { l:'TVA applicable',     v: `${item.vat_rate ?? 21}%` },
              { l:'Dernière réception', v: fmtD(item.last_restock) },
              { l:"Date d'expiration",  v: fmtD(item.expiry_date) },
              { l:'Créé le',            v: fmtD(item.created_at) },
            ].map(r => (
              <div key={r.l} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid #f1f5f9', fontSize:13 }}>
                <span style={{ color:'#6b7280' }}>{r.l}</span>
                <span style={{ fontWeight:600, color:'#1e293b' }}>{r.v}</span>
              </div>
            ))}
            {item.notes && (
              <div style={{ marginTop:10, padding:10, background:'#f8fafc', borderRadius:8, fontSize:12, color:'#4b5563' }}>
                <span style={{ fontWeight:600 }}>Notes: </span>{item.notes}
              </div>
            )}
          </div>

          {/* Recent movements */}
          {itemMovements.length > 0 && (
            <div style={{ ...card }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#374151', marginBottom:12 }}>Derniers mouvements</div>
              {itemMovements.map(m => {
                const mt = MOVEMENT_TYPES[m.type] ?? MOVEMENT_TYPES.in
                return (
                  <div key={m.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid #f1f5f9' }}>
                    <div>
                      <span style={{ background: mt.bg, color: mt.color, borderRadius:6, padding:'2px 8px', fontSize:11, fontWeight:600 }}>{mt.label}</span>
                      <span style={{ fontSize:12, color:'#6b7280', marginLeft:8 }}>{m.reason || '—'}</span>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontSize:13, fontWeight:700, color: mt.color }}>{mt.sign === -1 ? '-' : '+'}{m.quantity}</div>
                      <div style={{ fontSize:11, color:'#94a3b8' }}>{fmtD(m.date || m.created_at)}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function StockPage() {
  const [items,      setItems]      = useState<StockItem[]>([])
  const [movements,  setMovements]  = useState<StockMovement[]>([])
  const [loading,    setLoading]    = useState(true)
  const [view,       setView]       = useState<'list' | 'grid'>('list')

  const [search,     setSearch]     = useState('')
  const [statusF,    setStatusF]    = useState('')
  const [catF,       setCatF]       = useState('')
  const [supplierF,  setSupplierF]  = useState('')
  const [sortBy,     setSortBy]     = useState<'name' | 'quantity' | 'unit_price' | 'total_value'>('name')

  const [showModal,    setShowModal]    = useState(false)
  const [showMovModal, setShowMovModal] = useState(false)
  const [editItem,     setEditItem]     = useState<StockItem | null>(null)
  const [drawerItem,   setDrawerItem]   = useState<StockItem | null>(null)
  const [delTarget,    setDelTarget]    = useState<StockItem | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [its, movs] = await Promise.all([
      fetchSafe<StockItem>('/api/stock'),
      fetchSafe<StockMovement>('/api/stock-movements'),
    ])
    const enriched = its.map(i => ({
      ...i,
      status:        autoStatus(Number(i.quantity) || 0, Number(i.min_quantity) || 0),
      total_value:   (Number(i.quantity) || 0) * (Number(i.unit_price) || 0),
      selling_price: Number(i.selling_price) || 0,
      vat_rate:      Number(i.vat_rate) ?? 21,
    }))
    setItems(enriched)
    setMovements(movs)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const saveItem = async (data: Partial<StockItem>) => {
    const method = data.id ? 'PUT' : 'POST'
    const url    = data.id ? `/api/stock/${data.id}` : '/api/stock'
    const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    if (!res.ok) throw new Error('Erreur sauvegarde')
    setShowModal(false); setEditItem(null); load()
  }

const saveMovement = async (data: Omit<StockMovement, 'id' | 'created_at'>) => {
    const payload = {
      product_id: data.stock_item_id,
      type:       data.type,
      quantity:   data.quantity,
      unit_price: data.unit_price,
      reason:     data.reason,
      date:       data.date || new Date().toISOString().split('T')[0],
    }
    const res = await fetch('/api/stock-movements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    if (!res.ok) throw new Error('Erreur mouvement')
    setShowMovModal(false); load()
  }


  const del = async (id: string) => {
    await fetch(`/api/stock/${id}`, { method: 'DELETE' })
    setDelTarget(null); load()
  }

  const suppliers = Array.from(new Set(items.map(i => i.supplier).filter(Boolean)))

  const filtered = items
    .filter(i =>
      (!search     || [i.name, i.reference, i.supplier, i.location].some(f => f?.toLowerCase().includes(search.toLowerCase()))) &&
      (!statusF    || i.status === statusF) &&
      (!catF       || i.category === catF) &&
      (!supplierF  || i.supplier === supplierF)
    )
    .sort((a, b) => {
      if (sortBy === 'name')        return a.name.localeCompare(b.name)
      if (sortBy === 'quantity')    return (b.quantity || 0) - (a.quantity || 0)
      if (sortBy === 'unit_price')  return (b.unit_price || 0) - (a.unit_price || 0)
      if (sortBy === 'total_value') return ((b.quantity || 0) * (b.unit_price || 0)) - ((a.quantity || 0) * (a.unit_price || 0))
      return 0
    })

  const valuation = calcValuation(filtered)
  const openCreate = () => { setEditItem(null); setShowModal(true) }
  const openEdit   = (i: StockItem) => { setEditItem(i); setShowModal(true) }

  return (
    <div style={{ minHeight:'100vh', background:'#f8fafc', fontFamily:'Inter,system-ui,sans-serif' }}>
      <div style={{ maxWidth:1400, margin:'0 auto', padding:'24px 20px' }}>

        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:24, flexWrap:'wrap', gap:12 }}>
          <div>
            <h1 style={{ fontSize:26, fontWeight:800, color:'#0f172a', margin:0, display:'flex', alignItems:'center', gap:10 }}>
              {I.warehouse} Gestion des Stocks
            </h1>
            <p style={{ margin:'4px 0 0', fontSize:14, color:'#64748b' }}>Inventaire, valorisation et mouvements comptables</p>
          </div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            <button onClick={load}                                  style={btnGh}>{I.refresh} Actualiser</button>
            <button onClick={() => exportCSV(filtered)}             style={btnGh}>{I.export}  CSV</button>
            <button onClick={() => generateStockPDF(filtered, valuation)} style={btnGh}>{I.pdf} Rapport PDF</button>
            <button onClick={() => generateMovementPDF(movements)}  style={btnGh}>{I.move}    Journal PDF</button>
            <button onClick={() => setShowMovModal(true)}           style={btn('#7c3aed')}>{I.move} Mouvement</button>
            <button onClick={openCreate}                            style={btn()}>{I.plus}     Nouvel article</button>
          </div>
        </div>

        {/* KPI Strip */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:14, marginBottom:24 }}>
          {[
            { l:'Articles',          v: valuation.totalItems,                                     c:'#2563eb', icon: I.package  },
            { l:'Unités en stock',   v: valuation.totalQuantity,                                  c:'#0891b2', icon: I.barcode  },
            { l:'Valeur coût HT',    v: fmt(valuation.totalCostValue),                            c:'#16a34a', icon: I.euro     },
            { l:'Valeur vente HT',   v: fmt(valuation.totalSellingValue),                         c:'#7c3aed', icon: I.chart    },
            { l:'Marge potentielle', v: `${valuation.marginPct.toFixed(1)}%`,                     c: marginColor(valuation.marginPct), icon: I.euro },
            { l:'TVA sur stock',     v: fmt(valuation.vatAmount),                                 c:'#d97706', icon: I.tag      },
            { l:'Alertes stock',     v: valuation.lowStockCount + valuation.outOfStockCount,      c:'#dc2626', icon: I.alert    },
          ].map(k => (
            <div key={k.l} style={{ background:'#fff', borderRadius:12, border:'1px solid #e2e8f0', padding:'16px 18px', display:'flex', flexDirection:'column', gap:6 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontSize:12, color:'#64748b', fontWeight:500 }}>{k.l}</span>
                <span style={{ color: k.c, opacity:.7 }}>{k.icon}</span>
              </div>
              <div style={{ fontSize:20, fontWeight:800, color: k.c }}>{k.v}</div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div style={{ ...card, marginBottom:20, padding:'16px 20px' }}>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
            <div style={{ position:'relative', flex:'1 1 220px' }}>
              <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#94a3b8', pointerEvents:'none' }}>{I.search}</span>
              <input style={{ ...inp, paddingLeft:34 }} value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher article, réf., fournisseur..." />
            </div>
            <select style={{ ...inp, flex:'0 0 160px' }} value={statusF} onChange={e => setStatusF(e.target.value)}>
              <option value="">Tous statuts</option>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select style={{ ...inp, flex:'0 0 180px' }} value={catF} onChange={e => setCatF(e.target.value)}>
              <option value="">Toutes catégories</option>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
            <select style={{ ...inp, flex:'0 0 180px' }} value={supplierF} onChange={e => setSupplierF(e.target.value)}>
              <option value="">Tous fournisseurs</option>
              {suppliers.map(s => <option key={s}>{s}</option>)}
            </select>
            <select style={{ ...inp, flex:'0 0 160px' }} value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}>
              <option value="name">Trier: Nom</option>
              <option value="quantity">Trier: Quantité</option>
              <option value="unit_price">Trier: Prix achat</option>
              <option value="total_value">Trier: Valeur stock</option>
            </select>
            <div style={{ display:'flex', gap:4, marginLeft:'auto' }}>
              {(['list', 'grid'] as const).map(v => (
                <button key={v} onClick={() => setView(v)} style={{ ...btnGh, padding:'8px 12px', background: view === v ? '#eff6ff' : 'transparent', color: view === v ? '#2563eb' : '#64748b', borderColor: view === v ? '#bfdbfe' : '#e2e8f0' }}>
                  {v === 'list' ? I.list : I.grid}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ textAlign:'center', padding:60, color:'#64748b' }}>
            <div style={{ width:40, height:40, border:'3px solid #e2e8f0', borderTopColor:'#2563eb', borderRadius:'50%', animation:'spin 1s linear infinite', margin:'0 auto 12px' }} />
            Chargement du stock…
          </div>
        )}

        {/* List View */}
        {!loading && view === 'list' && (
          <div style={{ ...card, overflow:'hidden', padding:0 }}>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ background:'#f8fafc' }}>
                    {['Référence','Article','Catégorie','Qté','P.U. achat','P.U. vente','Valeur stock','Marge','TVA','Statut','Emplacement','Actions'].map(h => (
                      <th key={h} style={{ padding:'11px 14px', textAlign:'left', fontSize:12, fontWeight:700, color:'#475569', borderBottom:'1px solid #e2e8f0', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={12} style={{ padding:40, textAlign:'center', color:'#94a3b8' }}>Aucun article trouvé</td></tr>
                  ) : filtered.map(item => {
                    const st  = STATUS[item.status] ?? STATUS.in_stock
                    const cv  = (item.quantity || 0) * (item.unit_price || 0)
                    const sv  = (item.quantity || 0) * (item.selling_price || 0)
                    const mg  = sv - cv
                    const mp  = sv > 0 ? (mg / sv) * 100 : 0
                    const pct = stockPct(item.quantity, item.min_quantity)
                    return (
                      <tr key={item.id} style={{ borderBottom:'1px solid #f1f5f9' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                          onMouseLeave={e => (e.currentTarget.style.background = '')}>
                        <td style={{ padding:'10px 14px', fontSize:12, color:'#7c3aed', fontWeight:600 }}>{item.reference}</td>
                        <td style={{ padding:'10px 14px' }}>
                          <div style={{ fontWeight:600, fontSize:13, color:'#1e293b' }}>{item.name}</div>
                          {item.supplier && <div style={{ fontSize:11, color:'#94a3b8' }}>{item.supplier}</div>}
                        </td>
                        <td style={{ padding:'10px 14px', fontSize:12, color:'#64748b' }}>{item.category}</td>
                        <td style={{ padding:'10px 14px' }}>
                          <div style={{ fontSize:13, fontWeight:700, color:'#1e293b' }}>{item.quantity} {item.unit}</div>
                          <div style={{ height:4, background:'#f1f5f9', borderRadius:2, marginTop:4, width:60 }}>
                            <div style={{ height:'100%', width:`${pct}%`, background: pct > 50 ? '#22c55e' : pct > 25 ? '#f59e0b' : '#ef4444', borderRadius:2 }} />
                          </div>
                        </td>
                        <td style={{ padding:'10px 14px', fontSize:13, color:'#374151' }}>{fmt(item.unit_price)}</td>
                        <td style={{ padding:'10px 14px', fontSize:13, color:'#374151' }}>{fmt(item.selling_price)}</td>
                        <td style={{ padding:'10px 14px', fontSize:13, fontWeight:700, color:'#2563eb' }}>{fmt(cv)}</td>
                        <td style={{ padding:'10px 14px' }}>
                          <span style={{ fontSize:12, fontWeight:700, color: marginColor(mp) }}>{mp.toFixed(1)}%</span>
                        </td>
                        <td style={{ padding:'10px 14px', fontSize:12, color:'#64748b' }}>{item.vat_rate ?? 21}%</td>
                        <td style={{ padding:'10px 14px' }}>
                          <span style={{ background: st.bg, color: st.color, border:`1px solid ${st.border}`, borderRadius:20, padding:'3px 10px', fontSize:11, fontWeight:600, whiteSpace:'nowrap' }}>
                            <span style={{ width:6, height:6, borderRadius:'50%', background: st.dot, display:'inline-block', marginRight:5 }} />
                            {st.label}
                          </span>
                        </td>
                        <td style={{ padding:'10px 14px', fontSize:12, color:'#64748b' }}>{item.location || '—'}</td>
                        <td style={{ padding:'10px 14px' }}>
                          <div style={{ display:'flex', gap:4 }}>
                            <button onClick={() => setDrawerItem(item)} style={{ ...btnGh, padding:'5px 8px' }} title="Voir">{I.eye}</button>
                            <button onClick={() => openEdit(item)}      style={{ ...btnGh, padding:'5px 8px' }} title="Modifier">{I.edit}</button>
                            <button onClick={() => setDelTarget(item)}  style={{ background:'transparent', color:'#ef4444', border:'1px solid #fecaca', borderRadius:8, padding:'5px 8px', cursor:'pointer', display:'flex' }} title="Supprimer">{I.trash}</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Grid View */}
        {!loading && view === 'grid' && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:16 }}>
            {filtered.length === 0 ? (
              <div style={{ gridColumn:'1/-1', textAlign:'center', padding:60, color:'#94a3b8' }}>Aucun article trouvé</div>
            ) : filtered.map(item => {
              const st  = STATUS[item.status] ?? STATUS.in_stock
              const cv  = (item.quantity || 0) * (item.unit_price || 0)
              const sv  = (item.quantity || 0) * (item.selling_price || 0)
              const mp  = sv > 0 ? ((sv - cv) / sv) * 100 : 0
              const pct = stockPct(item.quantity, item.min_quantity)
              return (
                <div key={item.id}
                     style={{ background:'#fff', borderRadius:14, border:`1px solid ${st.border}`, overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,.06)', transition:'box-shadow .2s' }}
                     onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,.12)')}
                     onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,.06)')}>
                  <div style={{ height:4, background: st.dot }} />
                  <div style={{ padding:16 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                      <div>
                        <div style={{ fontWeight:700, fontSize:14, color:'#1e293b' }}>{item.name}</div>
                        <div style={{ fontSize:11, color:'#94a3b8' }}>Réf. {item.reference}</div>
                      </div>
                      <span style={{ background: st.bg, color: st.color, borderRadius:20, padding:'2px 8px', fontSize:11, fontWeight:600 }}>{st.label}</span>
                    </div>

                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:12 }}>
                      {[
                        { l:'Stock',     v:`${item.quantity} ${item.unit}` },
                        { l:'Catégorie', v: item.category },
                        { l:'Val. coût', v: fmt(cv) },
                        { l:'Marge',     v:`${mp.toFixed(1)}%` },
                      ].map(k => (
                        <div key={k.l} style={{ background:'#f8fafc', borderRadius:8, padding:'6px 10px' }}>
                          <div style={{ fontSize:10, color:'#94a3b8' }}>{k.l}</div>
                          <div style={{ fontSize:12, fontWeight:700, color:'#1e293b' }}>{k.v}</div>
                        </div>
                      ))}
                    </div>

                    <div style={{ marginBottom:12 }}>
                      <div style={{ height:5, background:'#f1f5f9', borderRadius:3 }}>
                        <div style={{ height:'100%', width:`${pct}%`, background: pct > 50 ? '#22c55e' : pct > 25 ? '#f59e0b' : '#ef4444', borderRadius:3, transition:'width .3s' }} />
                      </div>
                    </div>

                    {item.supplier && (
                      <div style={{ fontSize:11, color:'#94a3b8', marginBottom:10, display:'flex', alignItems:'center', gap:4 }}>
                        {I.supplier} {item.supplier}
                      </div>
                    )}

                    <div style={{ display:'flex', gap:6 }}>
                      <button onClick={() => setDrawerItem(item)} style={{ ...btnGh, flex:1, justifyContent:'center', padding:'7px 0', fontSize:12 }}>{I.eye} Voir</button>
                      <button onClick={() => openEdit(item)}      style={{ ...btn(), flex:1, justifyContent:'center', padding:'7px 0', fontSize:12 }}>{I.edit} Modifier</button>
                      <button onClick={() => setDelTarget(item)}  style={{ background:'transparent', color:'#ef4444', border:'1px solid #fecaca', borderRadius:8, padding:'7px 10px', cursor:'pointer', display:'flex' }}>{I.trash}</button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modals */}
      {showModal && (
        <StockModal
          item={editItem ?? { ...EMPTY }}
          onSave={saveItem}
          onClose={() => { setShowModal(false); setEditItem(null) }}
        />
      )}
      {showMovModal && (
        <MovementModal
          items={items}
          onSave={saveMovement}
          onClose={() => setShowMovModal(false)}
        />
      )}
      {drawerItem && (
        <StockDrawer
          item={drawerItem}
          movements={movements}
          onEdit={() => { openEdit(drawerItem); setDrawerItem(null) }}
          onClose={() => setDrawerItem(null)}
        />
      )}

      {/* Delete Confirm */}
      {delTarget && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:1200, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'#fff', borderRadius:16, padding:32, maxWidth:400, width:'100%', textAlign:'center', boxShadow:'0 25px 60px rgba(0,0,0,.2)' }}>
            <div style={{ width:56, height:56, background:'#fef2f2', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px', color:'#ef4444' }}>{I.trash}</div>
            <div style={{ fontSize:17, fontWeight:700, color:'#1e293b', marginBottom:8 }}>Supprimer l&apos;article ?</div>
            <div style={{ fontSize:14, color:'#64748b', marginBottom:24 }}>
              <strong>{delTarget.name}</strong> sera définitivement supprimé.
            </div>
            <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
              <button onClick={() => setDelTarget(null)}    style={btnGh}>Annuler</button>
              <button onClick={() => del(delTarget.id)} style={btn('#dc2626')}>Supprimer</button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}





