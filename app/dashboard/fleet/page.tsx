'use client'
import { useState, useEffect, useCallback } from 'react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Vehicle {
  id: string
  name: string
  plate: string
  brand: string
  model: string
  year: number
  category: string
  fuel_type: string
  status: 'active' | 'maintenance' | 'inactive' | 'sold'
  driver: string
  driver_id?: string
  mileage: number
  purchase_date: string
  purchase_price: number
  current_value: number
  insurance_expiry: string
  technical_control_expiry: string
  vignette_expiry: string
  oil_change_km: number
  next_service_km: number
  fuel_card?: string
  location?: string
  notes?: string
  created_at: string
}

interface VehicleExpense {
  id: string
  vehicle_id: string
  vehicle_name: string
  plate: string
  type: 'fuel' | 'maintenance' | 'insurance' | 'tax' | 'repair' | 'parking' | 'fine' | 'other'
  amount: number
  vat_rate: number
  description: string
  date: string
  km?: number
  invoice_ref?: string
  created_at: string
}

interface FleetKPI {
  totalVehicles: number
  activeVehicles: number
  maintenanceVehicles: number
  totalValue: number
  totalExpenses: number
  monthlyExpenses: number
  expiringDocuments: number
  avgMileage: number
}

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS: Record<string, { label: string; color: string; bg: string; border: string; dot: string }> = {
  active:      { label: 'Actif',        color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', dot: '#22c55e' },
  maintenance: { label: 'Maintenance',  color: '#d97706', bg: '#fffbeb', border: '#fde68a', dot: '#f59e0b' },
  inactive:    { label: 'Inactif',      color: '#64748b', bg: '#f8fafc', border: '#e2e8f0', dot: '#94a3b8' },
  sold:        { label: 'Vendu',        color: '#dc2626', bg: '#fef2f2', border: '#fecaca', dot: '#ef4444' },
}

const CATEGORIES = ['Voiture de société', 'Utilitaire', 'Camion', 'Moto', 'Van', 'Minibus', 'Autre']
const FUEL_TYPES = ['Diesel', 'Essence', 'Hybride', 'Électrique', 'GPL', 'Hydrogène']
const VAT_RATES  = [0, 6, 12, 21]

const EXPENSE_TYPES: Record<string, { label: string; color: string; bg: string }> = {
  fuel:        { label: 'Carburant',    color: '#2563eb', bg: '#eff6ff' },
  maintenance: { label: 'Entretien',    color: '#d97706', bg: '#fffbeb' },
  insurance:   { label: 'Assurance',    color: '#7c3aed', bg: '#f5f3ff' },
  tax:         { label: 'Taxe / Vignette', color: '#0891b2', bg: '#ecfeff' },
  repair:      { label: 'Réparation',   color: '#dc2626', bg: '#fef2f2' },
  parking:     { label: 'Parking',      color: '#16a34a', bg: '#f0fdf4' },
  fine:        { label: 'Amende',       color: '#9f1239', bg: '#fff1f2' },
  other:       { label: 'Autre',        color: '#64748b', bg: '#f8fafc' },
}

const COMPANY = { name: 'Wasalak SPRL', address: 'Bruxelles, Belgique', vat: 'BE 0000.000.000' }

const EMPTY_V: Omit<Vehicle, 'id' | 'created_at'> = {
  name: '', plate: '', brand: '', model: '', year: new Date().getFullYear(),
  category: CATEGORIES[0], fuel_type: FUEL_TYPES[0], status: 'active',
  driver: '', driver_id: '', mileage: 0, purchase_date: '',
  purchase_price: 0, current_value: 0, insurance_expiry: '',
  technical_control_expiry: '', vignette_expiry: '', oil_change_km: 15000,
  next_service_km: 0, fuel_card: '', location: '', notes: '',
}

const EMPTY_EXP: Omit<VehicleExpense, 'id' | 'created_at' | 'vehicle_name' | 'plate'> = {
  vehicle_id: '', type: 'fuel', amount: 0, vat_rate: 21,
  description: '', date: '', km: 0, invoice_ref: '',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt  = (v: number) =>
  new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' }).format(v || 0)
const fmtD = (d?: string) => d ? new Date(d).toLocaleDateString('fr-BE') : '—'
const todayStr = () => new Date().toISOString().split('T')[0]

const daysUntil = (d?: string): number => {
  if (!d) return 9999
  return Math.ceil((new Date(d).getTime() - Date.now()) / 864e5)
}

const expiryColor = (days: number) =>
  days < 0 ? '#dc2626' : days <= 30 ? '#d97706' : days <= 90 ? '#d97706' : '#16a34a'

const expiryBg = (days: number) =>
  days < 0 ? '#fef2f2' : days <= 30 ? '#fffbeb' : '#f0fdf4'

const depreciation = (purchase: number, current: number) =>
  purchase > 0 ? ((purchase - current) / purchase) * 100 : 0

async function fetchSafe<T>(url: string): Promise<T[]> {
  try {
    const r = await fetch(url)
    if (!r.ok) return []
    const j = await r.json()
    return Array.isArray(j) ? j : j.data ?? j.items ?? []
  } catch { return [] }
}

// ─── Alert helper ─────────────────────────────────────────────────────────────
function getVehicleAlerts(v: Vehicle): { label: string; days: number; type: string }[] {
  const alerts = []
  const checks = [
    { label: 'Assurance',          date: v.insurance_expiry,           type: 'insurance' },
    { label: 'Contrôle technique', date: v.technical_control_expiry,   type: 'ct' },
    { label: 'Vignette',           date: v.vignette_expiry,            type: 'vignette' },
  ]
  for (const c of checks) {
    const d = daysUntil(c.date)
    if (d <= 90) alerts.push({ label: c.label, days: d, type: c.type })
  }
  if (v.next_service_km > 0 && v.mileage >= v.next_service_km - 1000)
    alerts.push({ label: 'Révision km', days: 0, type: 'service' })
  return alerts
}

// ─── SVG Icons ────────────────────────────────────────────────────────────────
const I: Record<string, JSX.Element> = {
  plus:     <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>,
  edit:     <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>,
  trash:    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>,
  eye:      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  x:        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>,
  search:   <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>,
  list:     <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
  grid:     <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>,
  pdf:      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  export:   <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  refresh:  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>,
  car:      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v9a2 2 0 0 1-2 2h-2"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/><path d="M14 2v5h5"/></svg>,
  alert:    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  euro:     <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 10h12M4 14h12M19.5 8A7 7 0 1 0 19.5 16"/></svg>,
  chart:    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  calendar: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  driver:   <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  fuel:     <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 22V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v7h1a2 2 0 0 1 2 2v3a1 1 0 0 0 1 1 1 1 0 0 0 1-1V9l-3-3"/><path d="M9 11V5"/><line x1="3" y1="11" x2="15" y2="11"/></svg>,
  tool:     <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>,
  shield:   <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  tag:      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>,
  gauge:    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 2a10 10 0 0 1 7.38 16.75"/><path d="M12 2a10 10 0 0 0-7.38 16.75"/><path d="M12 12l4-4"/><circle cx="12" cy="12" r="2"/></svg>,
  location: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  check:    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>,
  clock:    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
}

// ─── Shared Styles ─────────────────────────────────────────────────────────────
const card  = { background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 24 }
const inp   = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, outline: 'none', boxSizing: 'border-box' as const, background: '#f8fafc' }
const lbl   = { fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' as const }
const btn   = (c = '#2563eb') => ({ background: c, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 })
const btnGh = { background: 'transparent', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }

// ─── PDF Fleet Report ─────────────────────────────────────────────────────────
function generateFleetPDF(vehicles: Vehicle[], expenses: VehicleExpense[], kpi: FleetKPI) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const W = 297
  const now = new Date().toLocaleDateString('fr-BE')

  doc.setFillColor(37, 99, 235); doc.rect(0, 0, W, 28, 'F')
  doc.setTextColor(255, 255, 255); doc.setFontSize(16); doc.setFont('helvetica', 'bold')
  doc.text('RAPPORT DE FLOTTE VÉHICULES', 14, 12)
  doc.setFontSize(9); doc.setFont('helvetica', 'normal')
  doc.text(`${COMPANY.name} — TVA: ${COMPANY.vat}`, 14, 20)
  doc.text(`Généré le ${now}`, W - 14, 20, { align: 'right' })

  const kpis = [
    { l: 'Véhicules', v: String(kpi.totalVehicles) },
    { l: 'Actifs',    v: String(kpi.activeVehicles) },
    { l: 'Maintenance', v: String(kpi.maintenanceVehicles) },
    { l: 'Valeur parc', v: fmt(kpi.totalValue) },
    { l: 'Dépenses totales', v: fmt(kpi.totalExpenses) },
    { l: 'Alertes docs', v: String(kpi.expiringDocuments) },
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
    head: [['Immatriculation', 'Véhicule', 'Catégorie', 'Conducteur', 'Km', 'Statut', 'Assurance', 'CT', 'Vignette', 'Val. achat', 'Val. actuelle', 'Dépréciation']],
    body: vehicles.map(v => {
      const dep = depreciation(v.purchase_price, v.current_value)
      return [
        v.plate, `${v.brand} ${v.model} (${v.year})`, v.category,
        v.driver || '—', v.mileage.toLocaleString('fr-BE') + ' km',
        STATUS[v.status]?.label ?? v.status,
        fmtD(v.insurance_expiry),
        fmtD(v.technical_control_expiry),
        fmtD(v.vignette_expiry),
        fmt(v.purchase_price), fmt(v.current_value),
        `${dep.toFixed(1)}%`,
      ]
    }),
    styles: { fontSize: 7, cellPadding: 2.5 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 36 } },
  })

  // Expenses page
  doc.addPage()
  doc.setFillColor(37, 99, 235); doc.rect(0, 0, 210, 28, 'F')
  doc.setTextColor(255, 255, 255); doc.setFontSize(14); doc.setFont('helvetica', 'bold')
  doc.text('JOURNAL DES DÉPENSES FLOTTE', 14, 12)
  doc.setFontSize(9); doc.setFont('helvetica', 'normal')
  doc.text(COMPANY.name, 14, 20); doc.text(`Édité le ${now}`, 196, 20, { align: 'right' })

  autoTable(doc, {
    startY: 34,
    head: [['Date', 'Véhicule', 'Plaque', 'Type', 'Description', 'Montant HT', 'TVA %', 'Montant TTC', 'Réf. facture']],
    body: expenses.map(e => {
      const ttc = e.amount * (1 + (e.vat_rate || 21) / 100)
      return [
        fmtD(e.date || e.created_at), e.vehicle_name, e.plate,
        EXPENSE_TYPES[e.type]?.label ?? e.type, e.description || '—',
        fmt(e.amount), `${e.vat_rate ?? 21}%`, fmt(ttc), e.invoice_ref || '—',
      ]
    }),
    styles: { fontSize: 7.5, cellPadding: 2.5 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  })

  const pages = (doc as any).internal.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFontSize(7); doc.setTextColor(148, 163, 184)
    doc.text(`${COMPANY.name} — Rapport confidentiel`, 14, 205)
    doc.text(`Page ${p} / ${pages}`, W - 14, 205, { align: 'right' })
  }
  doc.save(`rapport-flotte-${todayStr()}.pdf`)
}

// ─── CSV Export ───────────────────────────────────────────────────────────────
function exportCSV(vehicles: Vehicle[]) {
  const headers = ['Immatriculation','Nom','Marque','Modèle','Année','Catégorie','Carburant','Statut','Conducteur','Kilométrage','Date achat','Prix achat','Valeur actuelle','Dépréciation %','Assurance expiry','CT expiry','Vignette expiry']
  const rows = vehicles.map(v => {
    const dep = depreciation(v.purchase_price, v.current_value)
    return [
      v.plate, v.name, v.brand, v.model, v.year, v.category, v.fuel_type,
      STATUS[v.status]?.label ?? v.status, v.driver, v.mileage,
      v.purchase_date, v.purchase_price, v.current_value, dep.toFixed(2),
      v.insurance_expiry, v.technical_control_expiry, v.vignette_expiry,
    ].map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(',')
  })
  const blob = new Blob(['\uFEFF' + [headers.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `flotte-${todayStr()}.csv`; a.click()
}

// ─── KPI Calculator ───────────────────────────────────────────────────────────
function calcKPI(vehicles: Vehicle[], expenses: VehicleExpense[]): FleetKPI {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  return {
    totalVehicles:       vehicles.length,
    activeVehicles:      vehicles.filter(v => v.status === 'active').length,
    maintenanceVehicles: vehicles.filter(v => v.status === 'maintenance').length,
    totalValue:          vehicles.reduce((s, v) => s + (Number(v.current_value) || 0), 0),
    totalExpenses:       expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0),
    monthlyExpenses:     expenses.filter(e => (e.date || e.created_at) >= monthStart).reduce((s, e) => s + (Number(e.amount) || 0), 0),
    expiringDocuments:   vehicles.filter(v => getVehicleAlerts(v).length > 0).length,
    avgMileage:          vehicles.length > 0 ? Math.round(vehicles.reduce((s, v) => s + (Number(v.mileage) || 0), 0) / vehicles.length) : 0,
  }
}

// ─── Expiry Badge ─────────────────────────────────────────────────────────────
function ExpiryBadge({ date, label }: { date?: string; label: string }) {
  if (!date) return <span style={{ fontSize: 11, color: '#94a3b8' }}>—</span>
  const d = daysUntil(date)
  const color = expiryColor(d)
  const bg    = expiryBg(d)
  const text  = d < 0 ? `${label} EXPIRÉ` : d === 0 ? `${label} aujourd'hui` : `${label}: ${d}j`
  return (
    <span style={{ background: bg, color, border: `1px solid ${color}30`, borderRadius: 6, padding: '2px 7px', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap' }}>
      {text}
    </span>
  )
}

// ─── Vehicle Modal ────────────────────────────────────────────────────────────
function VehicleModal({ vehicle, onSave, onClose }: {
  vehicle: Partial<Vehicle> | null
  onSave: (data: Partial<Vehicle>) => Promise<void>
  onClose: () => void
}) {
  const isEdit = !!vehicle?.id
  const [form, setForm]     = useState<Partial<Vehicle>>(vehicle ?? { ...EMPTY_V })
  const [tab, setTab]       = useState<'info' | 'docs' | 'finance' | 'notes'>('info')
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const set = (k: keyof Vehicle, v: unknown) => {
    setForm(f => ({ ...f, [k]: v }))
    setErrors(e => ({ ...e, [k]: '' }))
  }

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.plate?.trim())  e.plate = 'Immatriculation requise'
    if (!form.brand?.trim())  e.brand = 'Marque requise'
    if (!form.model?.trim())  e.model = 'Modèle requis'
    setErrors(e); return Object.keys(e).length === 0
  }

  const submit = async () => {
    if (!validate()) return
    setSaving(true)
    try { await onSave(form) } finally { setSaving(false) }
  }

  const is = (k: string) => ({ ...inp, borderColor: errors[k] ? '#ef4444' : '#e2e8f0' })

  const tabs = [
    { key: 'info' as const,    label: 'Véhicule' },
    { key: 'docs' as const,    label: 'Documents' },
    { key: 'finance' as const, label: 'Finance' },
    { key: 'notes' as const,   label: 'Notes' },
  ]

  // Alert previews in docs tab
  const insuranceDays = daysUntil(form.insurance_expiry)
  const ctDays        = daysUntil(form.technical_control_expiry)
  const vignetteDays  = daysUntil(form.vignette_expiry)

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 680, maxHeight: '93vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 60px rgba(0,0,0,.22)' }}>

        {/* Header */}
        <div style={{ padding: '20px 24px', background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: '#fff' }}>{I.car}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: '#fff' }}>{isEdit ? 'Modifier le véhicule' : 'Nouveau véhicule'}</div>
              {isEdit && <div style={{ fontSize: 12, color: '#bfdbfe' }}>{vehicle?.plate} — {vehicle?.brand} {vehicle?.model}</div>}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,.15)', border: 'none', borderRadius: 8, padding: 8, cursor: 'pointer', color: '#fff', display: 'flex' }}>{I.x}</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', padding: '0 24px' }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{ padding: '12px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: tab === t.key ? '#2563eb' : '#64748b', borderBottom: tab === t.key ? '2px solid #2563eb' : '2px solid transparent' }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>

          {/* ── Tab Véhicule ── */}
          {tab === 'info' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={lbl}>Immatriculation *</label>
                <input style={is('plate')} value={form.plate ?? ''} onChange={e => set('plate', e.target.value.toUpperCase())} placeholder="1-ABC-123" />
                {errors.plate && <span style={{ color: '#ef4444', fontSize: 12 }}>{errors.plate}</span>}
              </div>
              <div>
                <label style={lbl}>Nom / Libellé</label>
                <input style={inp} value={form.name ?? ''} onChange={e => set('name', e.target.value)} placeholder="Ex: Camionnette Bruxelles" />
              </div>
              <div>
                <label style={lbl}>Marque *</label>
                <input style={is('brand')} value={form.brand ?? ''} onChange={e => set('brand', e.target.value)} placeholder="Renault" />
                {errors.brand && <span style={{ color: '#ef4444', fontSize: 12 }}>{errors.brand}</span>}
              </div>
              <div>
                <label style={lbl}>Modèle *</label>
                <input style={is('model')} value={form.model ?? ''} onChange={e => set('model', e.target.value)} placeholder="Trafic" />
                {errors.model && <span style={{ color: '#ef4444', fontSize: 12 }}>{errors.model}</span>}
              </div>
              <div>
                <label style={lbl}>Année</label>
                <input style={inp} type="number" min="1990" max="2030" value={form.year ?? new Date().getFullYear()} onChange={e => set('year', Number(e.target.value))} />
              </div>
              <div>
                <label style={lbl}>Catégorie</label>
                <select style={inp} value={form.category ?? CATEGORIES[0]} onChange={e => set('category', e.target.value)}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Carburant</label>
                <select style={inp} value={form.fuel_type ?? FUEL_TYPES[0]} onChange={e => set('fuel_type', e.target.value)}>
                  {FUEL_TYPES.map(f => <option key={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Statut</label>
                <select style={{ ...inp, background: STATUS[form.status ?? 'active']?.bg, color: STATUS[form.status ?? 'active']?.color, fontWeight: 600 }} value={form.status ?? 'active'} onChange={e => set('status', e.target.value)}>
                  {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Conducteur assigné</label>
                <input style={inp} value={form.driver ?? ''} onChange={e => set('driver', e.target.value)} placeholder="Nom du conducteur" />
              </div>
              <div>
                <label style={lbl}>Kilométrage actuel</label>
                <input style={inp} type="number" min="0" value={form.mileage ?? 0} onChange={e => set('mileage', Number(e.target.value))} />
              </div>
              <div>
                <label style={lbl}>Emplacement / Dépôt</label>
                <input style={inp} value={form.location ?? ''} onChange={e => set('location', e.target.value)} placeholder="Dépôt Bruxelles" />
              </div>
              <div>
                <label style={lbl}>Carte carburant</label>
                <input style={inp} value={form.fuel_card ?? ''} onChange={e => set('fuel_card', e.target.value)} placeholder="N° carte carburant" />
              </div>
            </div>
          )}

          {/* ── Tab Documents ── */}
          {tab === 'docs' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {/* Insurance */}
              <div>
                <label style={lbl}>Expiration assurance</label>
                <input style={{ ...inp, borderColor: insuranceDays <= 30 ? '#ef4444' : '#e2e8f0' }} type="date" value={form.insurance_expiry ?? ''} onChange={e => set('insurance_expiry', e.target.value)} />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
                {form.insurance_expiry ? (
                  <div style={{ background: expiryBg(insuranceDays), border: `1px solid ${expiryColor(insuranceDays)}30`, borderRadius: 8, padding: '8px 12px', width: '100%' }}>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>Assurance</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: expiryColor(insuranceDays) }}>
                      {insuranceDays < 0 ? '🚨 EXPIRÉE' : insuranceDays === 0 ? '⚠️ Expire aujourd\'hui' : `${insuranceDays} jours restants`}
                    </div>
                  </div>
                ) : <div style={{ ...inp, color: '#94a3b8', fontSize: 13 }}>Aucune date</div>}
              </div>

              {/* CT */}
              <div>
                <label style={lbl}>Expiration contrôle technique</label>
                <input style={{ ...inp, borderColor: ctDays <= 30 ? '#ef4444' : '#e2e8f0' }} type="date" value={form.technical_control_expiry ?? ''} onChange={e => set('technical_control_expiry', e.target.value)} />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
                {form.technical_control_expiry ? (
                  <div style={{ background: expiryBg(ctDays), border: `1px solid ${expiryColor(ctDays)}30`, borderRadius: 8, padding: '8px 12px', width: '100%' }}>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>Contrôle technique</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: expiryColor(ctDays) }}>
                      {ctDays < 0 ? '🚨 EXPIRÉ' : ctDays === 0 ? '⚠️ Expire aujourd\'hui' : `${ctDays} jours restants`}
                    </div>
                  </div>
                ) : <div style={{ ...inp, color: '#94a3b8', fontSize: 13 }}>Aucune date</div>}
              </div>

              {/* Vignette */}
              <div>
                <label style={lbl}>Expiration vignette</label>
                <input style={{ ...inp, borderColor: vignetteDays <= 30 ? '#ef4444' : '#e2e8f0' }} type="date" value={form.vignette_expiry ?? ''} onChange={e => set('vignette_expiry', e.target.value)} />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
                {form.vignette_expiry ? (
                  <div style={{ background: expiryBg(vignetteDays), border: `1px solid ${expiryColor(vignetteDays)}30`, borderRadius: 8, padding: '8px 12px', width: '100%' }}>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>Vignette</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: expiryColor(vignetteDays) }}>
                      {vignetteDays < 0 ? '🚨 EXPIRÉE' : vignetteDays === 0 ? '⚠️ Expire aujourd\'hui' : `${vignetteDays} jours restants`}
                    </div>
                  </div>
                ) : <div style={{ ...inp, color: '#94a3b8', fontSize: 13 }}>Aucune date</div>}
              </div>

              {/* Service */}
              <div>
                <label style={lbl}>Km prochain service</label>
                <input style={inp} type="number" min="0" value={form.next_service_km ?? 0} onChange={e => set('next_service_km', Number(e.target.value))} />
              </div>
              <div>
                <label style={lbl}>Intervalle vidange (km)</label>
                <input style={inp} type="number" min="0" value={form.oil_change_km ?? 15000} onChange={e => set('oil_change_km', Number(e.target.value))} />
              </div>
            </div>
          )}

          {/* ── Tab Finance ── */}
          {tab === 'finance' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={lbl}>Date d&apos;achat</label>
                <input style={inp} type="date" value={form.purchase_date ?? ''} onChange={e => set('purchase_date', e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Prix d&apos;achat (€)</label>
                <input style={inp} type="number" min="0" step="100" value={form.purchase_price ?? 0} onChange={e => set('purchase_price', Number(e.target.value))} />
              </div>
              <div>
                <label style={lbl}>Valeur actuelle (€)</label>
                <input style={inp} type="number" min="0" step="100" value={form.current_value ?? 0} onChange={e => set('current_value', Number(e.target.value))} />
              </div>
              <div>
                <label style={lbl}>Dépréciation (auto)</label>
                <div style={{ ...inp, background: '#f0fdf4', color: '#15803d', fontWeight: 700 }}>
                  {depreciation(form.purchase_price ?? 0, form.current_value ?? 0).toFixed(1)}%
                </div>
              </div>
              {(form.purchase_price ?? 0) > 0 && (
                <div style={{ gridColumn: '1/-1', background: '#f8fafc', borderRadius: 10, padding: 16, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 12 }}>Analyse financière</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                    {[
                      { l: 'Prix achat',    v: fmt(form.purchase_price ?? 0), c: '#2563eb' },
                      { l: 'Valeur actuelle', v: fmt(form.current_value ?? 0), c: '#16a34a' },
                      { l: 'Perte de valeur', v: fmt((form.purchase_price ?? 0) - (form.current_value ?? 0)), c: '#dc2626' },
                    ].map(k => (
                      <div key={k.l} style={{ textAlign: 'center', padding: '8px 0' }}>
                        <div style={{ fontSize: 11, color: '#6b7280' }}>{k.l}</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: k.c }}>{k.v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Tab Notes ── */}
          {tab === 'notes' && (
            <div>
              <label style={lbl}>Notes internes</label>
              <textarea style={{ ...inp, minHeight: 160, resize: 'vertical' }} value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} placeholder="Observations, historique, informations spéciales..." />
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', background: '#f8fafc' }}>
          <button onClick={onClose} style={btnGh}>Annuler</button>
          <button onClick={submit} disabled={saving} style={btn(saving ? '#93c5fd' : '#2563eb')}>
            {saving ? 'Enregistrement…' : isEdit ? 'Mettre à jour' : 'Créer le véhicule'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Expense Modal ────────────────────────────────────────────────────────────
function ExpenseModal({ vehicles, onSave, onClose }: {
  vehicles: Vehicle[]
  onSave: (data: Omit<VehicleExpense, 'id' | 'created_at' | 'vehicle_name' | 'plate'>) => Promise<void>
  onClose: () => void
}) {
  const [form, setForm]     = useState({ ...EMPTY_EXP, date: todayStr() })
  const [saving, setSaving] = useState(false)

  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }))
  const sel = vehicles.find(v => v.id === form.vehicle_id)
  const et  = EXPENSE_TYPES[form.type]
  const ttc = (Number(form.amount) || 0) * (1 + (Number(form.vat_rate) || 21) / 100)

  const submit = async () => {
    if (!form.vehicle_id || (Number(form.amount) || 0) <= 0) return
    setSaving(true)
    try { await onSave({ ...form, amount: Number(form.amount), vat_rate: Number(form.vat_rate) || 21 }) }
    finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 520, boxShadow: '0 25px 60px rgba(0,0,0,.22)' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(135deg,#7c3aed,#6d28d9)' }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>{I.euro} Enregistrer une dépense</div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,.15)', border: 'none', borderRadius: 8, padding: 6, cursor: 'pointer', color: '#fff', display: 'flex' }}>{I.x}</button>
        </div>

        <div style={{ padding: 24, display: 'grid', gap: 16 }}>
          <div>
            <label style={lbl}>Véhicule *</label>
            <select style={inp} value={form.vehicle_id} onChange={e => set('vehicle_id', e.target.value)}>
              <option value="">— Sélectionner un véhicule —</option>
              {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate} — {v.brand} {v.model} ({v.driver || 'Sans conducteur'})</option>)}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Type de dépense</label>
              <select style={{ ...inp, background: et.bg, color: et.color, fontWeight: 600 }} value={form.type} onChange={e => set('type', e.target.value)}>
                {Object.entries(EXPENSE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Date</label>
              <input style={inp} type="date" value={form.date} onChange={e => set('date', e.target.value)} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Montant HT (€) *</label>
              <input style={inp} type="number" min="0" step="0.01" value={form.amount || ''} onChange={e => set('amount', e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label style={lbl}>TVA (%)</label>
              <select style={inp} value={form.vat_rate} onChange={e => set('vat_rate', Number(e.target.value))}>
                {VAT_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Kilométrage</label>
              <input style={inp} type="number" min="0" value={form.km || ''} onChange={e => set('km', Number(e.target.value))} placeholder="Km au compteur" />
            </div>
            <div>
              <label style={lbl}>Réf. facture</label>
              <input style={inp} value={form.invoice_ref || ''} onChange={e => set('invoice_ref', e.target.value)} placeholder="FAC-2026-0001" />
            </div>
          </div>

          <div>
            <label style={lbl}>Description</label>
            <input style={inp} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Ex: Vidange + filtres, plein carburant..." />
          </div>

          {/* Preview */}
          {form.vehicle_id && Number(form.amount) > 0 && (
            <div style={{ background: et.bg, border: `1px solid ${et.color}30`, borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 12, color: et.color, fontWeight: 700, marginBottom: 8 }}>Aperçu de la dépense</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                {[
                  { l: 'Montant HT', v: fmt(Number(form.amount) || 0) },
                  { l: `TVA ${form.vat_rate}%`, v: fmt((Number(form.amount) || 0) * (Number(form.vat_rate) / 100)) },
                  { l: 'Montant TTC', v: fmt(ttc) },
                ].map(k => (
                  <div key={k.l} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: '#6b7280' }}>{k.l}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: et.color }}>{k.v}</div>
                  </div>
                ))}
              </div>
              {sel && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 8, textAlign: 'center' }}>Véhicule: {sel.plate} — {sel.brand} {sel.model}</div>}
            </div>
          )}
        </div>

        <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between' }}>
          <button onClick={onClose} style={btnGh}>Annuler</button>
          <button onClick={submit} disabled={saving || !form.vehicle_id || !Number(form.amount)} style={btn(saving || !form.vehicle_id || !Number(form.amount) ? '#93c5fd' : '#7c3aed')}>
            {saving ? 'Enregistrement…' : 'Enregistrer la dépense'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Vehicle Drawer ───────────────────────────────────────────────────────────
function VehicleDrawer({ vehicle, expenses, onEdit, onClose }: {
  vehicle: Vehicle
  expenses: VehicleExpense[]
  onEdit: () => void
  onClose: () => void
}) {
  const st           = STATUS[vehicle.status] ?? STATUS.active
  const alerts       = getVehicleAlerts(vehicle)
  const vExpenses    = expenses.filter(e => e.vehicle_id === vehicle.id)
  const totalExp     = vExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0)
  const dep          = depreciation(vehicle.purchase_price, vehicle.current_value)
  const insD         = daysUntil(vehicle.insurance_expiry)
  const ctD          = daysUntil(vehicle.technical_control_expiry)
  const vigD         = daysUntil(vehicle.vignette_expiry)
  const kmToService  = (vehicle.next_service_km || 0) - (vehicle.mileage || 0)

  // Expenses by type
  const expByType = Object.keys(EXPENSE_TYPES).map(k => ({
    key: k,
    label: EXPENSE_TYPES[k].label,
    color: EXPENSE_TYPES[k].color,
    bg:    EXPENSE_TYPES[k].bg,
    total: vExpenses.filter(e => e.type === k).reduce((s, e) => s + (Number(e.amount) || 0), 0),
  })).filter(e => e.total > 0)

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 900, display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ width: 'min(560px,100vw)', background: '#fff', height: '100%', overflowY: 'auto', boxShadow: '-8px 0 40px rgba(0,0,0,.15)' }}>

        {/* Header */}
        <div style={{ padding: '20px 24px', background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', position: 'sticky', top: 0, zIndex: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>{vehicle.plate}</div>
              <div style={{ fontSize: 14, color: '#bfdbfe', marginTop: 2 }}>{vehicle.brand} {vehicle.model} — {vehicle.year}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onEdit}  style={{ background: 'rgba(255,255,255,.2)', border: 'none', borderRadius: 8, padding: 8, cursor: 'pointer', color: '#fff', display: 'flex' }}>{I.edit}</button>
              <button onClick={onClose} style={{ background: 'rgba(255,255,255,.2)', border: 'none', borderRadius: 8, padding: 8, cursor: 'pointer', color: '#fff', display: 'flex' }}>{I.x}</button>
            </div>
          </div>
          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ background: st.bg, color: st.color, border: `1px solid ${st.border}`, borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>{st.label}</span>
            <span style={{ background: 'rgba(255,255,255,.15)', color: '#fff', borderRadius: 20, padding: '3px 10px', fontSize: 12 }}>{vehicle.category}</span>
            <span style={{ background: 'rgba(255,255,255,.15)', color: '#fff', borderRadius: 20, padding: '3px 10px', fontSize: 12 }}>{vehicle.fuel_type}</span>
            {vehicle.driver && <span style={{ background: 'rgba(255,255,255,.15)', color: '#fff', borderRadius: 20, padding: '3px 10px', fontSize: 12 }}>{I.driver} {vehicle.driver}</span>}
          </div>
        </div>

        <div style={{ padding: 24 }}>

          {/* Alerts */}
          {alerts.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              {alerts.map((a, i) => (
                <div key={i} style={{ background: a.days < 0 ? '#fef2f2' : '#fffbeb', border: `1px solid ${a.days < 0 ? '#fecaca' : '#fde68a'}`, borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ color: a.days < 0 ? '#dc2626' : '#d97706' }}>{I.alert}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: a.days < 0 ? '#7f1d1d' : '#78350f' }}>
                    {a.label} — {a.days < 0 ? `Expiré depuis ${Math.abs(a.days)} jours` : a.days === 0 ? 'Expire aujourd\'hui' : `Expire dans ${a.days} jours`}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            {[
              { l: 'Kilométrage',     v: `${(vehicle.mileage || 0).toLocaleString('fr-BE')} km`, c: '#2563eb' },
              { l: 'Dépenses totales', v: fmt(totalExp),              c: '#dc2626' },
              { l: 'Valeur actuelle', v: fmt(vehicle.current_value),  c: '#16a34a' },
              { l: 'Dépréciation',    v: `${dep.toFixed(1)}%`,        c: dep > 50 ? '#dc2626' : '#d97706' },
            ].map(k => (
              <div key={k.l} style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 14px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>{k.l}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: k.c }}>{k.v}</div>
              </div>
            ))}
          </div>

          {/* Documents */}
          <div style={{ ...card, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 12 }}>Documents & Échéances</div>
            {[
              { l: 'Assurance',          days: insD, date: vehicle.insurance_expiry },
              { l: 'Contrôle technique', days: ctD,  date: vehicle.technical_control_expiry },
              { l: 'Vignette',           days: vigD, date: vehicle.vignette_expiry },
            ].map(r => (
              <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ fontSize: 13, color: '#374151' }}>{r.l}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#64748b' }}>{fmtD(r.date)}</span>
                  {r.date && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: expiryColor(r.days), background: expiryBg(r.days), borderRadius: 6, padding: '2px 6px' }}>
                      {r.days < 0 ? `−${Math.abs(r.days)}j` : `+${r.days}j`}
                    </span>
                  )}
                </div>
              </div>
            ))}
            {/* Service km */}
            {vehicle.next_service_km > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ fontSize: 13, color: '#374151' }}>Prochain service</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: kmToService <= 1000 ? '#dc2626' : '#16a34a' }}>
                  {vehicle.next_service_km.toLocaleString('fr-BE')} km ({kmToService <= 0 ? 'DÉPASSÉ' : `${kmToService.toLocaleString('fr-BE')} km restants`})
                </span>
              </div>
            )}
          </div>

          {/* Finance */}
          <div style={{ ...card, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 12 }}>Informations financières</div>
            {[
              { l: 'Prix d\'achat',   v: fmt(vehicle.purchase_price) },
              { l: 'Date d\'achat',   v: fmtD(vehicle.purchase_date) },
              { l: 'Valeur actuelle', v: fmt(vehicle.current_value) },
              { l: 'Perte de valeur', v: fmt((vehicle.purchase_price || 0) - (vehicle.current_value || 0)) },
              { l: 'Dépenses totales', v: fmt(totalExp) },
              { l: 'Coût total possession', v: fmt((vehicle.purchase_price || 0) - (vehicle.current_value || 0) + totalExp) },
            ].map(r => (
              <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                <span style={{ color: '#6b7280' }}>{r.l}</span>
                <span style={{ fontWeight: 600, color: '#1e293b' }}>{r.v}</span>
              </div>
            ))}
          </div>

          {/* Expenses by type */}
          {expByType.length > 0 && (
            <div style={{ ...card, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 12 }}>Dépenses par type</div>
              {expByType.sort((a, b) => b.total - a.total).map(e => (
                <div key={e.key} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: e.color, fontWeight: 600 }}>{e.label}</span>
                    <span style={{ fontWeight: 700, color: '#1e293b' }}>{fmt(e.total)}</span>
                  </div>
                  <div style={{ height: 6, background: '#f1f5f9', borderRadius: 3 }}>
                    <div style={{ height: '100%', width: `${totalExp > 0 ? (e.total / totalExp) * 100 : 0}%`, background: e.color, borderRadius: 3, transition: 'width .3s' }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Recent expenses */}
          {vExpenses.length > 0 && (
            <div style={{ ...card }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 12 }}>Dernières dépenses</div>
              {vExpenses.slice(0, 8).map(e => {
                const et = EXPENSE_TYPES[e.type] ?? EXPENSE_TYPES.other
                return (
                  <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <div>
                      <span style={{ background: et.bg, color: et.color, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>{et.label}</span>
                      <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 8 }}>{e.description || '—'}</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#dc2626' }}>−{fmt(e.amount)}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>{fmtD(e.date || e.created_at)}</div>
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

// ─── Alert Banner ─────────────────────────────────────────────────────────────
function AlertBanner({ vehicles }: { vehicles: Vehicle[] }) {
  const urgent = vehicles.flatMap(v =>
    getVehicleAlerts(v).map(a => ({ ...a, plate: v.plate, vehicleName: `${v.brand} ${v.model}` }))
  ).sort((a, b) => a.days - b.days).slice(0, 5)

  if (urgent.length === 0) return null

  return (
    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '12px 16px', marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ color: '#d97706' }}>{I.alert}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#92400e' }}>{urgent.length} alerte(s) requièrent votre attention</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {urgent.map((a, i) => (
          <span key={i} style={{ background: a.days < 0 ? '#fef2f2' : '#fffbeb', color: a.days < 0 ? '#dc2626' : '#d97706', border: `1px solid ${a.days < 0 ? '#fecaca' : '#fde68a'}`, borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 600 }}>
            {a.plate} — {a.label} {a.days < 0 ? `(expiré ${Math.abs(a.days)}j)` : a.days === 0 ? "(aujourd'hui)" : `(${a.days}j)`}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function FleetPage() {
  const [vehicles,  setVehicles]  = useState<Vehicle[]>([])
  const [expenses,  setExpenses]  = useState<VehicleExpense[]>([])
  const [loading,   setLoading]   = useState(true)
  const [view,      setView]      = useState<'list' | 'grid'>('list')
  const [tab,       setTab]       = useState<'vehicles' | 'expenses'>('vehicles')

  // Filters
  const [search,    setSearch]    = useState('')
  const [statusF,   setStatusF]   = useState('')
  const [catF,      setCatF]      = useState('')
  const [fuelF,     setFuelF]     = useState('')
  const [alertF,    setAlertF]    = useState(false)
  const [sortBy,    setSortBy]    = useState<'plate' | 'mileage' | 'value' | 'expenses'>('plate')

  // Expense filters
  const [expTypeF,  setExpTypeF]  = useState('')
  const [expVehF,   setExpVehF]   = useState('')

  // Modals
  const [showVModal,  setShowVModal]  = useState(false)
  const [showExpModal,setShowExpModal]= useState(false)
  const [editVehicle, setEditVehicle] = useState<Vehicle | null>(null)
  const [drawerV,     setDrawerV]     = useState<Vehicle | null>(null)
  const [delTarget,   setDelTarget]   = useState<Vehicle | null>(null)

  // ── Load ──
  const load = useCallback(async () => {
    setLoading(true)
    const [vs, es] = await Promise.all([
      fetchSafe<Vehicle>('/api/fleet'),
      fetchSafe<VehicleExpense>('/api/fleet-expenses'),
    ])
    setVehicles(vs)
    setExpenses(es)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ── CRUD ──
  const saveVehicle = async (data: Partial<Vehicle>) => {
    const method = data.id ? 'PUT' : 'POST'
    const url    = data.id ? `/api/fleet/${data.id}` : '/api/fleet'
    const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    if (!res.ok) throw new Error('Erreur sauvegarde')
    setShowVModal(false); setEditVehicle(null); load()
  }

  const saveExpense = async (data: Omit<VehicleExpense, 'id' | 'created_at' | 'vehicle_name' | 'plate'>) => {
    const v   = vehicles.find(x => x.id === data.vehicle_id)
    const res = await fetch('/api/fleet-expenses', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, vehicle_name: v ? `${v.brand} ${v.model}` : '', plate: v?.plate ?? '' }),
    })
    if (!res.ok) throw new Error('Erreur dépense')
    setShowExpModal(false); load()
  }

  const del = async (id: string) => {
    await fetch(`/api/fleet/${id}`, { method: 'DELETE' })
    setDelTarget(null); load()
  }

  // ── Filters ──
  const filteredV = vehicles
    .filter(v =>
      (!search  || [v.plate, v.brand, v.model, v.driver, v.name].some(f => f?.toLowerCase().includes(search.toLowerCase()))) &&
      (!statusF || v.status === statusF) &&
      (!catF    || v.category === catF) &&
      (!fuelF   || v.fuel_type === fuelF) &&
      (!alertF  || getVehicleAlerts(v).length > 0)
    )
    .sort((a, b) => {
      if (sortBy === 'plate')    return a.plate.localeCompare(b.plate)
      if (sortBy === 'mileage')  return (b.mileage || 0) - (a.mileage || 0)
      if (sortBy === 'value')    return (b.current_value || 0) - (a.current_value || 0)
      if (sortBy === 'expenses') {
        const ea = expenses.filter(e => e.vehicle_id === a.id).reduce((s, e) => s + (e.amount || 0), 0)
        const eb = expenses.filter(e => e.vehicle_id === b.id).reduce((s, e) => s + (e.amount || 0), 0)
        return eb - ea
      }
      return 0
    })

  const filteredE = expenses
    .filter(e =>
      (!expTypeF || e.type === expTypeF) &&
      (!expVehF  || e.vehicle_id === expVehF) &&
      (!search   || [e.vehicle_name, e.plate, e.description].some(f => f?.toLowerCase().includes(search.toLowerCase())))
    )
    .sort((a, b) => (b.date || b.created_at).localeCompare(a.date || a.created_at))

  const kpi = calcKPI(vehicles, expenses)

  const openCreate = () => { setEditVehicle(null); setShowVModal(true) }
  const openEdit   = (v: Vehicle) => { setEditVehicle(v); setShowVModal(true) }

  // ── Render ──
  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'Inter,system-ui,sans-serif' }}>
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: '24px 20px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
              {I.car} Gestion de la Flotte
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 14, color: '#64748b' }}>Véhicules, documents, dépenses et alertes</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={load}                              style={btnGh}>{I.refresh} Actualiser</button>
            <button onClick={() => exportCSV(filteredV)}       style={btnGh}>{I.export}  CSV</button>
            <button onClick={() => generateFleetPDF(filteredV, filteredE, kpi)} style={btnGh}>{I.pdf} Rapport PDF</button>
            <button onClick={() => setShowExpModal(true)}      style={btn('#7c3aed')}>{I.euro} Dépense</button>
            <button onClick={openCreate}                       style={btn()}>{I.plus} Nouveau véhicule</button>
          </div>
        </div>

        {/* KPI Strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(155px,1fr))', gap: 14, marginBottom: 24 }}>
          {[
            { l: 'Véhicules',       v: kpi.totalVehicles,                        c: '#2563eb', icon: I.car },
            { l: 'Actifs',          v: kpi.activeVehicles,                       c: '#16a34a', icon: I.check },
            { l: 'Maintenance',     v: kpi.maintenanceVehicles,                  c: '#d97706', icon: I.tool },
            { l: 'Valeur du parc',  v: fmt(kpi.totalValue),                      c: '#7c3aed', icon: I.euro },
            { l: 'Dépenses totales',v: fmt(kpi.totalExpenses),                   c: '#dc2626', icon: I.chart },
            { l: 'Dépenses / mois', v: fmt(kpi.monthlyExpenses),                 c: '#0891b2', icon: I.calendar },
            { l: 'Km moyen',        v: `${kpi.avgMileage.toLocaleString('fr-BE')} km`, c: '#64748b', icon: I.gauge },
            { l: 'Alertes docs',    v: kpi.expiringDocuments,                    c: '#dc2626', icon: I.alert },
          ].map(k => (
            <div key={k.l} style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '16px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>{k.l}</span>
                <span style={{ color: k.c, opacity: .7 }}>{k.icon}</span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: k.c }}>{k.v}</div>
            </div>
          ))}
        </div>

        {/* Alert Banner */}
        <AlertBanner vehicles={vehicles} />

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '2px solid #e2e8f0' }}>
          {([['vehicles', `Véhicules (${filteredV.length})`], ['expenses', `Dépenses (${filteredE.length})`]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ padding: '10px 20px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: tab === k ? '#2563eb' : '#64748b', borderBottom: tab === k ? '2px solid #2563eb' : '2px solid transparent', marginBottom: -2 }}>
              {l}
            </button>
          ))}
        </div>

        {/* Toolbar */}
        <div style={{ ...card, marginBottom: 20, padding: '14px 18px' }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: '1 1 220px' }}>
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }}>{I.search}</span>
              <input style={{ ...inp, paddingLeft: 34 }} value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher plaque, marque, conducteur..." />
            </div>

            {tab === 'vehicles' && (<>
              <select style={{ ...inp, flex: '0 0 150px' }} value={statusF} onChange={e => setStatusF(e.target.value)}>
                <option value="">Tous statuts</option>
                {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <select style={{ ...inp, flex: '0 0 160px' }} value={catF} onChange={e => setCatF(e.target.value)}>
                <option value="">Toutes catégories</option>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
              <select style={{ ...inp, flex: '0 0 140px' }} value={fuelF} onChange={e => setFuelF(e.target.value)}>
                <option value="">Tous carburants</option>
                {FUEL_TYPES.map(f => <option key={f}>{f}</option>)}
              </select>
              <button onClick={() => setAlertF(!alertF)} style={{ ...btnGh, background: alertF ? '#fffbeb' : 'transparent', color: alertF ? '#d97706' : '#64748b', borderColor: alertF ? '#fde68a' : '#e2e8f0', whiteSpace: 'nowrap' }}>
                {I.alert} {alertF ? 'Alertes actives' : 'Alertes'}
              </button>
              <select style={{ ...inp, flex: '0 0 160px' }} value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}>
                <option value="plate">Trier: Plaque</option>
                <option value="mileage">Trier: Kilométrage</option>
                <option value="value">Trier: Valeur</option>
                <option value="expenses">Trier: Dépenses</option>
              </select>
              <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
                {(['list', 'grid'] as const).map(v => (
                  <button key={v} onClick={() => setView(v)} style={{ ...btnGh, padding: '8px 12px', background: view === v ? '#eff6ff' : 'transparent', color: view === v ? '#2563eb' : '#64748b', borderColor: view === v ? '#bfdbfe' : '#e2e8f0' }}>
                    {v === 'list' ? I.list : I.grid}
                  </button>
                ))}
              </div>
            </>)}

            {tab === 'expenses' && (<>
              <select style={{ ...inp, flex: '0 0 180px' }} value={expTypeF} onChange={e => setExpTypeF(e.target.value)}>
                <option value="">Tous types</option>
                {Object.entries(EXPENSE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <select style={{ ...inp, flex: '0 0 240px' }} value={expVehF} onChange={e => setExpVehF(e.target.value)}>
                <option value="">Tous véhicules</option>
                {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate} — {v.brand} {v.model}</option>)}
              </select>
            </>)}
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>
            <div style={{ width: 40, height: 40, border: '3px solid #e2e8f0', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
            Chargement de la flotte…
          </div>
        )}

        {/* ── Vehicles List ── */}
        {!loading && tab === 'vehicles' && view === 'list' && (
          <div style={{ ...card, overflow: 'hidden', padding: 0 }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    {['Plaque', 'Véhicule', 'Catégorie', 'Conducteur', 'Kilométrage', 'Statut', 'Assurance', 'CT', 'Vignette', 'Valeur', 'Dépenses', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#475569', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredV.length === 0 ? (
                    <tr><td colSpan={12} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Aucun véhicule trouvé</td></tr>
                  ) : filteredV.map(v => {
                    const st    = STATUS[v.status] ?? STATUS.active
                    const al    = getVehicleAlerts(v)
                    const vExp  = expenses.filter(e => e.vehicle_id === v.id).reduce((s, e) => s + (e.amount || 0), 0)
                    return (
                      <tr key={v.id} style={{ borderBottom: '1px solid #f1f5f9' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                          onMouseLeave={e => (e.currentTarget.style.background = '')}>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 13, fontWeight: 800, color: '#2563eb', fontFamily: 'monospace' }}>{v.plate}</span>
                            {al.length > 0 && <span style={{ color: '#d97706' }} title={`${al.length} alerte(s)`}>{I.alert}</span>}
                          </div>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>{v.brand} {v.model}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>{v.year} — {v.fuel_type}</div>
                        </td>
                        <td style={{ padding: '10px 14px', fontSize: 12, color: '#64748b' }}>{v.category}</td>
                        <td style={{ padding: '10px 14px', fontSize: 12, color: '#374151' }}>{v.driver || '—'}</td>
                        <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{(v.mileage || 0).toLocaleString('fr-BE')} km</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ background: st.bg, color: st.color, border: `1px solid ${st.border}`, borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.dot, display: 'inline-block', marginRight: 5 }} />
                            {st.label}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px' }}><ExpiryBadge date={v.insurance_expiry} label="Ass." /></td>
                        <td style={{ padding: '10px 14px' }}><ExpiryBadge date={v.technical_control_expiry} label="CT" /></td>
                        <td style={{ padding: '10px 14px' }}><ExpiryBadge date={v.vignette_expiry} label="Vig." /></td>
                        <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#16a34a' }}>{fmt(v.current_value)}</td>
                        <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#dc2626' }}>{fmt(vExp)}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button onClick={() => setDrawerV(v)}  style={{ ...btnGh, padding: '5px 8px' }} title="Voir">{I.eye}</button>
                            <button onClick={() => openEdit(v)}    style={{ ...btnGh, padding: '5px 8px' }} title="Modifier">{I.edit}</button>
                            <button onClick={() => setDelTarget(v)} style={{ background: 'transparent', color: '#ef4444', border: '1px solid #fecaca', borderRadius: 8, padding: '5px 8px', cursor: 'pointer', display: 'flex' }} title="Supprimer">{I.trash}</button>
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

        {/* ── Vehicles Grid ── */}
        {!loading && tab === 'vehicles' && view === 'grid' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 16 }}>
            {filteredV.length === 0 ? (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 60, color: '#94a3b8' }}>Aucun véhicule trouvé</div>
            ) : filteredV.map(v => {
              const st   = STATUS[v.status] ?? STATUS.active
              const al   = getVehicleAlerts(v)
              const vExp = expenses.filter(e => e.vehicle_id === v.id).reduce((s, e) => s + (e.amount || 0), 0)
              const dep  = depreciation(v.purchase_price, v.current_value)
              return (
                <div key={v.id}
                     style={{ background: '#fff', borderRadius: 14, border: `1px solid ${al.length > 0 ? '#fde68a' : st.border}`, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.06)', transition: 'box-shadow .2s' }}
                     onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,.12)')}
                     onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,.06)')}>
                  <div style={{ height: 4, background: al.length > 0 ? '#f59e0b' : st.dot }} />
                  <div style={{ padding: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 16, color: '#2563eb', fontFamily: 'monospace' }}>{v.plate}</div>
                        <div style={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>{v.brand} {v.model}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{v.year} — {v.category}</div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                        <span style={{ background: st.bg, color: st.color, borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>{st.label}</span>
                        {al.length > 0 && <span style={{ background: '#fffbeb', color: '#d97706', borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>{I.alert} {al.length} alerte{al.length > 1 ? 's' : ''}</span>}
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                      {[
                        { l: 'Kilométrage', v: `${(v.mileage || 0).toLocaleString('fr-BE')} km` },
                        { l: 'Conducteur',  v: v.driver || '—' },
                        { l: 'Valeur',      v: fmt(v.current_value) },
                        { l: 'Dépenses',    v: fmt(vExp) },
                      ].map(k => (
                        <div key={k.l} style={{ background: '#f8fafc', borderRadius: 8, padding: '6px 10px' }}>
                          <div style={{ fontSize: 10, color: '#94a3b8' }}>{k.l}</div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>{k.v}</div>
                        </div>
                      ))}
                    </div>

                    {/* Expiry badges */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                      <ExpiryBadge date={v.insurance_expiry}          label="Ass." />
                      <ExpiryBadge date={v.technical_control_expiry}  label="CT"   />
                      <ExpiryBadge date={v.vignette_expiry}           label="Vig." />
                    </div>

                    {/* Depreciation bar */}
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8', marginBottom: 3 }}>
                        <span>Dépréciation</span><span>{dep.toFixed(1)}%</span>
                      </div>
                      <div style={{ height: 5, background: '#f1f5f9', borderRadius: 3 }}>
                        <div style={{ height: '100%', width: `${Math.min(100, dep)}%`, background: dep > 50 ? '#ef4444' : dep > 25 ? '#f59e0b' : '#22c55e', borderRadius: 3 }} />
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => setDrawerV(v)} style={{ ...btnGh, flex: 1, justifyContent: 'center', padding: '7px 0', fontSize: 12 }}>{I.eye} Voir</button>
                      <button onClick={() => openEdit(v)}   style={{ ...btn(), flex: 1, justifyContent: 'center', padding: '7px 0', fontSize: 12 }}>{I.edit} Modifier</button>
                      <button onClick={() => setDelTarget(v)} style={{ background: 'transparent', color: '#ef4444', border: '1px solid #fecaca', borderRadius: 8, padding: '7px 10px', cursor: 'pointer', display: 'flex' }}>{I.trash}</button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Expenses Tab ── */}
        {!loading && tab === 'expenses' && (
          <div style={{ ...card, overflow: 'hidden', padding: 0 }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    {['Date', 'Véhicule', 'Plaque', 'Type', 'Description', 'Montant HT', 'TVA', 'Montant TTC', 'Km', 'Réf. facture'].map(h => (
                      <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#475569', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredE.length === 0 ? (
                    <tr><td colSpan={10} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Aucune dépense enregistrée</td></tr>
                  ) : filteredE.map(e => {
                    const et  = EXPENSE_TYPES[e.type] ?? EXPENSE_TYPES.other
                    const ttc = (e.amount || 0) * (1 + (e.vat_rate || 21) / 100)
                    return (
                      <tr key={e.id} style={{ borderBottom: '1px solid #f1f5f9' }}
                          onMouseEnter={x => (x.currentTarget.style.background = '#f8fafc')}
                          onMouseLeave={x => (x.currentTarget.style.background = '')}>
                        <td style={{ padding: '10px 14px', fontSize: 12, color: '#64748b' }}>{fmtD(e.date || e.created_at)}</td>
                        <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{e.vehicle_name}</td>
                        <td style={{ padding: '10px 14px', fontSize: 12, color: '#2563eb', fontWeight: 700, fontFamily: 'monospace' }}>{e.plate}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ background: et.bg, color: et.color, borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>{et.label}</span>
                        </td>
                        <td style={{ padding: '10px 14px', fontSize: 12, color: '#374151' }}>{e.description || '—'}</td>
                        <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: '#374151' }}>{fmt(e.amount)}</td>
                        <td style={{ padding: '10px 14px', fontSize: 12, color: '#64748b' }}>{e.vat_rate ?? 21}%</td>
                        <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#dc2626' }}>{fmt(ttc)}</td>
                        <td style={{ padding: '10px 14px', fontSize: 12, color: '#64748b' }}>{e.km ? `${e.km.toLocaleString('fr-BE')} km` : '—'}</td>
                        <td style={{ padding: '10px 14px', fontSize: 11, color: '#7c3aed' }}>{e.invoice_ref || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
                {filteredE.length > 0 && (
                  <tfoot>
                    <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                      <td colSpan={5} style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#374151' }}>TOTAL ({filteredE.length} dépenses)</td>
                      <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 800, color: '#374151' }}>
                        {fmt(filteredE.reduce((s, e) => s + (e.amount || 0), 0))}
                      </td>
                      <td />
                      <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 800, color: '#dc2626' }}>
                        {fmt(filteredE.reduce((s, e) => s + (e.amount || 0) * (1 + (e.vat_rate || 21) / 100), 0))}
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showVModal && (
        <VehicleModal
          vehicle={editVehicle ?? { ...EMPTY_V }}
          onSave={saveVehicle}
          onClose={() => { setShowVModal(false); setEditVehicle(null) }}
        />
      )}
      {showExpModal && (
        <ExpenseModal
          vehicles={vehicles}
          onSave={saveExpense}
          onClose={() => setShowExpModal(false)}
        />
      )}
      {drawerV && (
        <VehicleDrawer
          vehicle={drawerV}
          expenses={expenses}
          onEdit={() => { openEdit(drawerV); setDrawerV(null) }}
          onClose={() => setDrawerV(null)}
        />
      )}

      {/* Delete Confirm */}
      {delTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 32, maxWidth: 400, width: '100%', textAlign: 'center', boxShadow: '0 25px 60px rgba(0,0,0,.2)' }}>
            <div style={{ width: 56, height: 56, background: '#fef2f2', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#ef4444' }}>{I.trash}</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>Supprimer le véhicule ?</div>
            <div style={{ fontSize: 14, color: '#64748b', marginBottom: 24 }}>
              <strong>{delTarget.plate} — {delTarget.brand} {delTarget.model}</strong> sera définitivement supprimé.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => setDelTarget(null)}  style={btnGh}>Annuler</button>
              <button onClick={() => del(delTarget.id)}   style={btn('#dc2626')}>Supprimer</button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
