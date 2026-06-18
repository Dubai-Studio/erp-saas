'use client';
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react';
import React from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/* ─────────────────────────────────────────────
   TYPES
───────────────────────────────────────────── */
interface Employee {
  id: string; first_name: string; last_name: string; email: string; phone: string;
  position: string; department: string; salary: number; hire_date: string;
  status: 'active' | 'inactive' | 'on_leave'; contract_type: string; created_at: string;
  payment_method?: string; payment_day?: number; payment_frequency?: string;
  iban?: string; national_id?: string; address?: string; emergency_contact?: string;
}

interface PayAdjustment {
  id: string; employee_id: string;
  type: 'advance' | 'bonus' | 'deduction' | 'correction' | 'salaire' | 'avance' | 'prime' | 'retenue' | 'acompte' | 'indemnite';
  amount: number; reason: string; month: string; created_at: string;
}

interface PaySlipData {
  employee: Employee; month: string; year: number;
  gross: number; adjustments: PayAdjustment[]; totalAdj: number; net: number;
}

interface CompanySettings {
  company_name: string;
  address: string;
  city?: string;
  country?: string;
  vat_number: string;
  email: string;
  phone: string;
  iban: string;
  bic?: string;
  logo_url?: string;
}

/* ─────────────────────────────────────────────
   CONSTANTES
───────────────────────────────────────────── */
const STATUS: Record<string, { label: string; color: string; bg: string; border: string; dot: string }> = {
  active:   { label: 'Actif',    color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0', dot: '#22c55e' },
  inactive: { label: 'Inactif',  color: '#64748b', bg: '#f8fafc', border: '#e2e8f0', dot: '#94a3b8' },
  on_leave: { label: 'En congé', color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe', dot: '#3b82f6' },
};

const ADJ_TYPES: Record<string, { label: string; color: string; bg: string; sign: 1 | -1 }> = {
  salaire:    { label: 'Salaire',    color: '#0f172a', bg: '#f8fafc',  sign: -1 },
  bonus:      { label: 'Prime',      color: '#15803d', bg: '#f0fdf4',  sign: +1 },
  prime:      { label: 'Prime',      color: '#15803d', bg: '#f0fdf4',  sign: +1 },
  advance:    { label: 'Avance',     color: '#d97706', bg: '#fffbeb',  sign: -1 },
  avance:     { label: 'Avance',     color: '#d97706', bg: '#fffbeb',  sign: -1 },
  acompte:    { label: 'Acompte',    color: '#d97706', bg: '#fffbeb',  sign: -1 },
  deduction:  { label: 'Retenue',    color: '#dc2626', bg: '#fef2f2',  sign: -1 },
  retenue:    { label: 'Retenue',    color: '#dc2626', bg: '#fef2f2',  sign: -1 },
  correction: { label: 'Correction', color: '#7c3aed', bg: '#faf5ff',  sign: +1 },
  indemnite:  { label: 'Indemnité',  color: '#0891b2', bg: '#ecfeff',  sign: +1 },
};

const ADJ_TYPE_OPTIONS = [
  { value: 'salaire',    label: 'Salaire mensuel' },
  { value: 'bonus',      label: 'Prime / Bonus' },
  { value: 'advance',    label: 'Avance sur salaire' },
  { value: 'acompte',    label: 'Acompte' },
  { value: 'deduction',  label: 'Retenue' },
  { value: 'correction', label: 'Correction' },
  { value: 'indemnite',  label: 'Indemnité' },
];

const DEPARTMENTS    = ['Direction','Commercial','Technique','Finance','RH','Marketing','Logistique','Autre'];
const CONTRACT_TYPES = ['CDI','CDD','Intérimaire','Freelance','Apprentissage','Stage'];
const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

const EMPTY_EMP = {
  first_name: '', last_name: '', email: '', phone: '', position: '', department: '',
  salary: 0, hire_date: '', status: 'active' as Employee['status'], contract_type: 'CDI',
  payment_method: 'Virement', payment_day: 28, payment_frequency: 'Mensuel',
  iban: '', national_id: '', address: '', emergency_contact: '',
};

const EMPTY_ADJ = { type: 'bonus' as PayAdjustment['type'], amount: 0, reason: '', month: '' };

/* ─────────────────────────────────────────────
   STYLES
───────────────────────────────────────────── */
const card: React.CSSProperties = {
  background: '#fff', borderRadius: 16,
  boxShadow: '0 1px 3px rgba(0,0,0,0.05),0 4px 12px rgba(0,0,0,0.04)',
  border: '1px solid #f1f5f9',
};

const inp: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0',
  borderRadius: 9, fontSize: 13, color: '#1e293b', background: '#fff',
  outline: 'none', boxSizing: 'border-box',
};

const lbl: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b',
  marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em',
};

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */
const fmt  = (n: number) => new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n || 0);
const fmtP = (n: number): string => { const abs = Math.abs(n || 0); const int = Math.floor(abs).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "."); const dec = abs.toFixed(2).split(".")[1]; return (n < 0 ? "-" : "") + int + "," + dec + " EUR"; };
const fmtD = (d: string) => d ? new Date(d).toLocaleDateString("fr-BE", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const currentMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

function seniority(hire_date: string): string {
  if (!hire_date) return '—';
  const diff   = Date.now() - new Date(hire_date).getTime();
  const years  = Math.floor(diff / (365.25 * 86400000));
  const months = Math.floor((diff % (365.25 * 86400000)) / (30.44 * 86400000));
  if (years > 0) return `${years} an${years > 1 ? 's' : ''} ${months > 0 ? `${months} mois` : ''}`;
  return `${months} mois`;
}

const AVATAR_COLORS = ['#6366f1','#10b981','#f59e0b','#8b5cf6','#06b6d4','#ef4444','#ec4899','#14b8a6'];
function aColor(s: string) { let h = 0; for (const c of s) h = c.charCodeAt(0) + ((h << 5) - h); return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]; }
function initials(f: string, l: string) { return ((f?.[0] || '') + (l?.[0] || '')).toUpperCase() || '?'; }

function toArray<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      if (Array.isArray(obj[key])) return obj[key] as T[];
    }
  }
  return [];
}

async function fetchSafe(url: string): Promise<unknown> {
  try {
    const r = await fetch(url);
    if (!r.ok) return [];
    const text = await r.text();
    if (!text || text.trim() === '') return [];
    return JSON.parse(text);
  } catch { return []; }
}

/* ─────────────────────────────────────────────
   ICONS
───────────────────────────────────────────── */
const I = {
  plus:     <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  edit:     <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  trash:    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>,
  eye:      <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  x:        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  search:   <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>,
  check:    <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>,
  list:     <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
  grid:     <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>,
  mail:     <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
  phone:    <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.56 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,
  hr:       <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M21 21v-2a4 4 0 0 0-3-3.85"/></svg>,
  pdf:      <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  euro:     <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 10h12M4 14h12M19 5A9 9 0 1 1 5 19"/></svg>,
  refresh:  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>,
  export:   <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  payslip:  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><line x1="6" y1="8" x2="10" y2="8"/><line x1="6" y1="12" x2="14" y2="12"/></svg>,
  adj:      <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  calendar: <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  building: <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6M9 13h6M9 17h4"/></svg>,
  id:       <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="8" y1="10" x2="8" y2="10"/><line x1="12" y1="10" x2="16" y2="10"/><line x1="12" y1="14" x2="16" y2="14"/></svg>,
  clock:    <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  alert:    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  location: <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  wallet:   <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/><path d="M16 12h5v4h-5a2 2 0 0 1 0-4z"/></svg>,
  salary:   <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>,
};

/* ─────────────────────────────────────────────
   PDF FICHE DE SALAIRE
───────────────────────────────────────────── */
function generatePaySlip(data: PaySlipData, company: CompanySettings) {
  const { employee: e, month, year, gross, adjustments, totalAdj, net } = data;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210, M = 15;

  const companyName    = company.company_name || 'Mon Entreprise';
  const companyAddress = [company.address, company.city, company.country].filter(Boolean).join(', ') || '—';
  const companyEmail   = company.email        || '—';
  const companyPhone   = company.phone        || '—';
  const companyVat     = company.vat_number   || '—';
  const companyIban    = company.iban         || '—';

  doc.setFillColor(245, 158, 11); doc.rect(0, 0, W, 48, 'F');
  doc.setFillColor(234, 140, 0);  doc.rect(0, 42, W, 6, 'F');
  doc.setTextColor(255, 255, 255); doc.setFontSize(22); doc.setFont('helvetica', 'bold');
  doc.text(companyName, M, 18);
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(255, 240, 200);
  doc.text(
    [companyAddress, companyEmail, companyPhone, `TVA: ${companyVat}`],
    M, 26, { lineHeightFactor: 1.6 }
  );
  doc.setTextColor(255, 255, 255); doc.setFontSize(16); doc.setFont('helvetica', 'bold');
  doc.text('FICHE DE SALAIRE', W - M, 18, { align: 'right' });
  doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(255, 240, 200);
  doc.text(`${MONTHS[parseInt(month.split('-')[1]) - 1]} ${year}`, W - M, 26, { align: 'right' });
  doc.text(`Emise le ${new Date().toLocaleDateString('fr-BE')}`, W - M, 32, { align: 'right' });

  doc.setFillColor(248, 250, 252); doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.3);
  doc.roundedRect(M, 56, 85, 50, 3, 3, 'FD');
  doc.setTextColor(100, 116, 139); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
  doc.text('EMPLOYE', M + 5, 64);
  doc.setTextColor(15, 23, 42); doc.setFontSize(12); doc.setFont('helvetica', 'bold');
  doc.text(`${e.first_name} ${e.last_name}`, M + 5, 73);
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(71, 85, 105);
  const empLines = [
    e.position || '',
    e.department || '',
    `Contrat : ${e.contract_type || '—'}`,
    e.national_id ? `N° national : ${e.national_id}` : '',
    `Embauche le : ${fmtD(e.hire_date)}`,
  ].filter(Boolean);
  doc.text(empLines, M + 5, 80, { lineHeightFactor: 1.7 });

  doc.setFillColor(255, 251, 235); doc.setDrawColor(253, 230, 138);
  doc.roundedRect(W / 2 + 2, 56, W / 2 - M - 2, 50, 3, 3, 'FD');
  doc.setTextColor(100, 116, 139); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
  doc.text('DETAILS DE PAIEMENT', W / 2 + 7, 64);
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(71, 85, 105);
  doc.text(
    [
      `Salaire brut : ${fmtP(Number(gross))}`,
      `IBAN : ${e.iban || companyIban}`,
      `Periode : ${MONTHS[parseInt(month.split('-')[1]) - 1]} ${year}`,
    ],
    W / 2 + 7, 73, { lineHeightFactor: 1.8 }
  );

  const tableBody: (string | number)[][] = [
    ['Salaire brut mensuel', '1', fmtP(Number(gross)), fmtP(Number(gross))],
  ];
  adjustments.forEach(adj => {
    const t = ADJ_TYPES[adj.type] ?? { label: adj.type, sign: 1 };
    const sign = t.sign > 0 ? '+' : '-';
    tableBody.push([
      `${t.label} — ${adj.reason}`, '1',
      `${sign} ${fmtP(Math.abs(adj.amount))}`,
      `${sign} ${fmtP(Math.abs(adj.amount))}`,
    ]);
  });

  autoTable(doc, {
    startY: 115,
    head: [['Designation', 'Qte', 'Montant', 'Total']],
    body: tableBody,
    headStyles: { fillColor: [245, 158, 11], textColor: 255, fontSize: 9, fontStyle: 'bold', cellPadding: 5 },
    bodyStyles: { fontSize: 9, cellPadding: 4, textColor: [30, 41, 59] },
    alternateRowStyles: { fillColor: [255, 251, 235] },
    columnStyles: {
      0: { cellWidth: 85 }, 1: { halign: 'center', cellWidth: 15 },
      2: { halign: 'right', cellWidth: 45 }, 3: { halign: 'right', cellWidth: 40 },
    },
    margin: { left: M, right: M },
    tableLineColor: [226, 232, 240], tableLineWidth: 0.2,
  });

  const fY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  const txW = 80, txX = W - M - txW;
  doc.setFillColor(248, 250, 252); doc.setDrawColor(226, 232, 240);
  doc.roundedRect(txX, fY, txW, 44, 3, 3, 'FD');
  [
    { l: 'Salaire brut',  v: fmtP(Number(gross)),                                         col: [71, 85, 105]  as [number, number, number] },
    { l: 'Ajustements',   v: (totalAdj >= 0 ? '+' : '') + fmtP(totalAdj),                 col: (totalAdj >= 0 ? [21, 128, 61] : [220, 38, 38]) as [number, number, number] },
  ].forEach((r, i) => {
    const y = fY + 10 + i * 10;
    doc.setFontSize(9); doc.setTextColor(100, 116, 139); doc.setFont('helvetica', 'normal');
    doc.text(r.l, txX + 6, y);
    doc.setTextColor(...r.col); doc.setFont('helvetica', 'bold');
    doc.text(r.v, txX + txW - 6, y, { align: 'right' });
  });
  doc.setFillColor(245, 158, 11); doc.roundedRect(txX, fY + 28, txW, 16, 2, 2, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text('NET A PAYER', txX + 6, fY + 38);
  doc.text(fmtP(net), txX + txW - 6, fY + 38, { align: 'right' });

  const bY = Math.min(fY + 58, 220);
  doc.setFillColor(255, 251, 235); doc.setDrawColor(253, 230, 138);
  doc.roundedRect(M, bY, W - M * 2, 18, 3, 3, 'FD');
  doc.setTextColor(146, 64, 14); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
  doc.text('Virement bancaire', M + 5, bY + 7);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(120, 53, 15);
  doc.text(
    `IBAN : ${e.iban || companyIban}  •  Communication : SALAIRE ${MONTHS[parseInt(month.split('-')[1]) - 1].toUpperCase()} ${year}`,
    M + 5, bY + 13
  );

  const sY = Math.min(bY + 26, 238);
  doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.3);
  doc.line(M, sY + 20, M + 70, sY + 20);
  doc.line(W - M - 70, sY + 20, W - M, sY + 20);
  doc.setTextColor(148, 163, 184); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
  doc.text('Signature employeur', M, sY + 25);
  doc.text('Signature employe', W - M - 70, sY + 25);

  doc.setFillColor(245, 158, 11); doc.rect(0, 282, W, 15, 'F');
  doc.setTextColor(255, 255, 255); doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
  doc.text(
    `${companyName}  •  ${companyVat}  •  ${companyEmail}  •  Document genere le ${new Date().toLocaleDateString('fr-BE')}`,
    W / 2, 290.5, { align: 'center' }
  );

  doc.save(`Fiche-Salaire-${e.last_name}-${month}.pdf`);
}

/* ─────────────────────────────────────────────
   MODAL EMPLOYÉ
───────────────────────────────────────────── */
function EmployeeModal({ open, onClose, onSave, initial }: {
  open: boolean; onClose: () => void;
  onSave: (d: typeof EMPTY_EMP) => Promise<void>;
  initial?: Employee | null;
}) {
  const [form,   setForm]   = useState({ ...EMPTY_EMP });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');
  const [tab,    setTab]    = useState<'info' | 'contract' | 'extra'>('info');

  useEffect(() => {
    setForm(initial ? {
      first_name: initial.first_name || '', last_name: initial.last_name || '',
      email: initial.email || '', phone: initial.phone || '',
      position: initial.position || '', department: initial.department || '',
      salary: initial.salary || 0, hire_date: initial.hire_date?.split('T')[0] || '',
      status: initial.status || 'active', contract_type: initial.contract_type || 'CDI',
      payment_method: initial.payment_method || 'Virement',
      payment_day: initial.payment_day ?? 28,
      payment_frequency: initial.payment_frequency || 'Mensuel',
      iban: initial.iban || '', national_id: initial.national_id || '',
      address: initial.address || '', emergency_contact: initial.emergency_contact || '',
    } : { ...EMPTY_EMP });
    setError(''); setTab('info');
  }, [initial, open]);

  if (!open) return null;

  const f = (k: keyof typeof EMPTY_EMP, v: string | number) => setForm(p => ({ ...p, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.first_name.trim() || !form.last_name.trim()) { setError('Prenom et nom obligatoires.'); return; }
    setSaving(true); setError('');
    try { await onSave(form); }
    catch (err) { setError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde.'); }
    finally { setSaving(false); }
  }

  const TS = (t: string): React.CSSProperties => ({
    padding: '10px 18px', border: 'none', background: 'transparent',
    fontSize: 13, fontWeight: 600, cursor: 'pointer',
    color: tab === t ? '#fff' : 'rgba(255,255,255,0.55)',
    borderBottom: tab === t ? '2px solid #fff' : '2px solid transparent',
    transition: 'all 0.15s',
  });

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(6px)' }} onClick={onClose} />
      <div style={{ ...card, position: 'relative', width: '100%', maxWidth: 680, maxHeight: '93vh', overflowY: 'auto', zIndex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ background: 'linear-gradient(135deg,#d97706 0%,#f59e0b 100%)', padding: '22px 24px 0', borderRadius: '16px 16px 0 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>{initial ? `${initial.first_name} ${initial.last_name}` : 'Nouvel employe'}</h2>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 3 }}>Ressources Humaines · Next-ERP</p>
            </div>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, padding: 8, cursor: 'pointer', color: '#fff', display: 'flex' }}>{I.x}</button>
          </div>
          <div style={{ display: 'flex', gap: 2 }}>
            {(['info', 'contract', 'extra'] as const).map(t => (
              <button key={t} style={TS(t)} onClick={() => setTab(t)}>
                {t === 'info' ? 'Informations' : t === 'contract' ? 'Contrat & Salaire' : 'Donnees RH'}
              </button>
            ))}
          </div>
        </div>
        <form onSubmit={submit} style={{ flex: 1, overflowY: 'auto' }}>
          {error && (
            <div style={{ margin: '14px 24px 0', padding: '10px 14px', background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 10, fontSize: 13, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 8 }}>
              {I.alert}{error}
            </div>
          )}
          {tab === 'info' && (
            <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div><label style={lbl}>Prenom <span style={{ color: '#ef4444' }}>*</span></label><input style={inp} value={form.first_name} onChange={e => f('first_name', e.target.value)} placeholder="Jean" /></div>
              <div><label style={lbl}>Nom <span style={{ color: '#ef4444' }}>*</span></label><input style={inp} value={form.last_name} onChange={e => f('last_name', e.target.value)} placeholder="Dupont" /></div>
              <div><label style={lbl}>Email</label><input style={inp} type="email" value={form.email} onChange={e => f('email', e.target.value)} placeholder="jean@acme.be" /></div>
              <div><label style={lbl}>Telephone</label><input style={inp} value={form.phone} onChange={e => f('phone', e.target.value)} placeholder="+32 470 00 00 00" /></div>
              <div style={{ gridColumn: '1/-1' }}><label style={lbl}>Adresse</label><input style={inp} value={form.address || ''} onChange={e => f('address', e.target.value)} placeholder="Rue de la Loi 1, 1000 Bruxelles" /></div>
              <div><label style={lbl}>Poste / Fonction</label><input style={inp} value={form.position} onChange={e => f('position', e.target.value)} placeholder="Developpeur Senior" /></div>
              <div>
                <label style={lbl}>Departement</label>
                <select style={{ ...inp, width: '100%' }} value={form.department} onChange={e => f('department', e.target.value)}>
                  <option value="">— Selectionner —</option>
                  {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Statut</label>
                <select style={{ ...inp, width: '100%' }} value={form.status} onChange={e => f('status', e.target.value as Employee['status'])}>
                  {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            </div>
          )}
          {tab === 'contract' && (
            <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={lbl}>Type de contrat</label>
                <select style={{ ...inp, width: '100%' }} value={form.contract_type} onChange={e => f('contract_type', e.target.value)}>
                  {CONTRACT_TYPES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div><label style={lbl}>Date d&apos;embauche</label><input style={inp} type="date" value={form.hire_date} onChange={e => f('hire_date', e.target.value)} /></div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={lbl}>Salaire mensuel brut (EUR)</label>
                <input style={{ ...inp, fontWeight: 700, fontSize: 15 }} type="number" min="0" step="50" value={form.salary || ''} onChange={e => f('salary', +e.target.value)} placeholder="0" />
                {(form.salary || 0) > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 10 }}>
                    {[
                      { l: 'Annuel brut', v: fmt((form.salary || 0) * 12) },
                      { l: 'Net estime/mois', v: fmt((form.salary || 0) * 0.75) },
                      { l: 'Charges patron', v: fmt((form.salary || 0) * 0.35) },
                    ].map((k, i) => (
                      <div key={i} style={{ textAlign: 'center', padding: '10px 0', background: '#fffbeb', borderRadius: 10, border: '1px solid #fde68a' }}>
                        <p style={{ fontSize: 10, color: '#92400e', marginBottom: 3 }}>{k.l}</p>
                        <p style={{ fontSize: 13, fontWeight: 800, color: '#d97706' }}>{k.v}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ gridColumn: '1/-1', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 4 }}>
                <div>
                  <label style={lbl}>Mode de paiement</label>
                  <select style={{ ...inp, width: '100%' }} value={form.payment_method || 'Virement'} onChange={e => f('payment_method', e.target.value)}>
                    {['Virement','Cheque','Especes','Neopay'].map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div><label style={lbl}>Jour de versement (1-31)</label><input style={inp} type="number" min="1" max="31" value={form.payment_day || 28} onChange={e => f('payment_day', +e.target.value)} placeholder="28" /></div>
                <div>
                  <label style={lbl}>Frequence</label>
                  <select style={{ ...inp, width: '100%' }} value={form.payment_frequency || 'Mensuel'} onChange={e => f('payment_frequency', e.target.value)}>
                    {['Mensuel','Hebdomadaire','Bimensuel'].map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ gridColumn: '1/-1' }}><label style={lbl}>IBAN (virement salaire)</label><input style={inp} value={form.iban || ''} onChange={e => f('iban', e.target.value)} placeholder="BE00 0000 0000 0000" /></div>
              <div style={{ gridColumn: '1/-1', background: '#fffbeb', borderRadius: 12, padding: 14, border: '1.5px solid #fde68a' }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>{I.alert} Note RH</p>
                <p style={{ fontSize: 12, color: '#78350f', lineHeight: 1.6 }}>Le salaire brut sert de base pour les fiches de paie. Les cotisations sociales (ONSS ~13.07%) et le precompte professionnel sont a calculer selon la legislation belge en vigueur.</p>
              </div>
            </div>
          )}
          {tab === 'extra' && (
            <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div><label style={lbl}>N° national / Matricule</label><input style={inp} value={form.national_id || ''} onChange={e => f('national_id', e.target.value)} placeholder="XX.XX.XX-XXX.XX" /></div>
              <div><label style={lbl}>Contact d&apos;urgence</label><input style={inp} value={form.emergency_contact || ''} onChange={e => f('emergency_contact', e.target.value)} placeholder="Nom · +32 470 00 00 00" /></div>
            </div>
          )}
          <div style={{ padding: '14px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 10, flexShrink: 0 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#fff', fontSize: 13, fontWeight: 600, color: '#64748b', cursor: 'pointer' }}>Annuler</button>
            <button type="submit" disabled={saving} style={{ flex: 2, padding: '10px 0', borderRadius: 10, border: 'none', background: saving ? '#fcd34d' : 'linear-gradient(135deg,#d97706,#f59e0b)', fontSize: 13, fontWeight: 700, color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {saving ? <><div style={{ width: 14, height: 14, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />Enregistrement…</> : <>{I.check} {initial ? 'Mettre a jour' : 'Creer'}</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   MODAL AJUSTEMENT (+ SALAIRE)
───────────────────────────────────────────── */
function AdjustmentModal({ open, onClose, onSave, employee, defaultType }: {
  open: boolean; onClose: () => void;
  onSave: (d: typeof EMPTY_ADJ & { employee_id: string }) => Promise<void>;
  employee: Employee | null;
  defaultType?: string;
}) {
  const [form,   setForm]   = useState({ ...EMPTY_ADJ, month: currentMonth() });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  useEffect(() => {
    if (open) {
      const type = (defaultType ?? 'bonus') as PayAdjustment['type'];
      const isSalaire = type === 'salaire';
      setForm({
        type,
        amount: isSalaire ? (employee?.salary ?? 0) : 0,
        reason: isSalaire ? `Salaire ${currentMonth()}` : '',
        month: currentMonth(),
      });
      setError('');
    }
  }, [open, defaultType, employee]);

  if (!open || !employee) return null;

  const adjT = ADJ_TYPES[form.type] ?? { label: form.type, color: '#0f172a', bg: '#f8fafc', sign: 1 as 1 | -1 };
  const finalAmount = adjT.sign * (form.amount || 0);
  const isSalaire = form.type === 'salaire';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.amount) { setError('Montant obligatoire.'); return; }
    if (!isSalaire && !form.reason.trim()) { setError('Motif obligatoire.'); return; }
    setSaving(true); setError('');
    try { await onSave({ ...form, employee_id: employee!.id }); }
    catch (err) { setError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde.'); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(6px)' }} onClick={onClose} />
      <div style={{ ...card, position: 'relative', width: '100%', maxWidth: 500, zIndex: 1 }}>
        <div style={{ background: isSalaire ? 'linear-gradient(135deg,#0f172a,#1e293b)' : 'linear-gradient(135deg,#4f46e5,#7c3aed)', padding: '20px 22px 18px', borderRadius: '16px 16px 0 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: 7 }}>
                {isSalaire ? <>{I.salary} Paiement du salaire</> : <>{I.adj} Ajustement de paie</>}
              </h2>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 3 }}>{employee.first_name} {employee.last_name}</p>
            </div>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, padding: 8, cursor: 'pointer', color: '#fff', display: 'flex' }}>{I.x}</button>
          </div>
        </div>

        <form onSubmit={submit} style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 10, fontSize: 13, color: '#dc2626' }}>{error}</div>}

          {isSalaire && (
            <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
              {I.check}
              <div>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#15803d' }}>Paiement salaire mensuel</p>
                <p style={{ fontSize: 11, color: '#166534' }}>Montant pre-rempli depuis le dossier employe. Modifiez si besoin.</p>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Type</label>
              <select style={{ ...inp, width: '100%' }} value={form.type} onChange={e => {
                const t = e.target.value as PayAdjustment['type'];
                setForm(p => ({ ...p, type: t, amount: t === 'salaire' ? (employee?.salary ?? 0) : p.amount, reason: t === 'salaire' ? `Salaire ${p.month}` : p.reason }));
              }}>
                {ADJ_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Mois concerne</label>
              <input style={inp} type="month" value={form.month} onChange={e => setForm(p => ({ ...p, month: e.target.value, reason: p.type === 'salaire' ? `Salaire ${e.target.value}` : p.reason }))} />
            </div>
          </div>

          <div>
            <label style={lbl}>Montant (EUR) <span style={{ color: '#ef4444' }}>*</span></label>
            <input style={{ ...inp, fontWeight: 700, fontSize: 15 }} type="number" min="0" step="0.01" value={form.amount || ''} onChange={e => setForm(p => ({ ...p, amount: parseFloat(e.target.value) || 0 }))} placeholder="0.00" />
          </div>

          <div>
            <label style={lbl}>Motif {!isSalaire && <span style={{ color: '#ef4444' }}>*</span>}</label>
            <input style={inp} value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} placeholder={isSalaire ? `Salaire ${form.month}` : 'Ex: Prime de rendement Q1...'} />
          </div>

          {(form.amount || 0) > 0 && (
            <div style={{ background: adjT.bg, borderRadius: 12, padding: 14, border: `1.5px solid ${adjT.color}30`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: adjT.color, textTransform: 'uppercase', marginBottom: 2 }}>{adjT.label}</p>
                <p style={{ fontSize: 12, color: '#64748b' }}>{form.reason || 'Sans motif'}</p>
              </div>
              <p style={{ fontSize: 20, fontWeight: 800, color: adjT.color }}>{finalAmount >= 0 ? '+' : ''}{fmt(finalAmount)}</p>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#fff', fontSize: 13, fontWeight: 600, color: '#64748b', cursor: 'pointer' }}>Annuler</button>
            <button type="submit" disabled={saving} style={{ flex: 2, padding: '10px 0', borderRadius: 10, border: 'none', background: isSalaire ? 'linear-gradient(135deg,#0f172a,#1e293b)' : 'linear-gradient(135deg,#4f46e5,#7c3aed)', fontSize: 13, fontWeight: 700, color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {saving ? <><div style={{ width: 14, height: 14, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />Enregistrement…</> : <>{I.check} {isSalaire ? 'Confirmer le paiement' : 'Enregistrer'}</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   DRAWER DÉTAIL EMPLOYÉ
───────────────────────────────────────────── */
function EmployeeDrawer({ employee, adjustments, onClose, onEdit, onDelete, onAdjust, onPaySalary, onPaySlip }: {
  employee: Employee | null; adjustments: PayAdjustment[];
  onClose: () => void; onEdit: () => void; onDelete: () => void;
  onAdjust: () => void; onPaySalary: () => void;
  onPaySlip: (month: string) => void;
}) {
  const [selMonth, setSelMonth] = useState(currentMonth());
  if (!employee) return null;

  const col   = aColor(`${employee.first_name}${employee.last_name}`);
  const st    = STATUS[employee.status];
  const myAdj = adjustments.filter(a => a.employee_id === employee.id && a.month === selMonth);
  const salaireThisMonth = myAdj.find(a => a.type === 'salaire');

  const totalAdj = myAdj.reduce((s, a) => {
    const t = ADJ_TYPES[a.type] ?? { sign: 1 };
    return s + t.sign * a.amount;
  }, 0);
  const net = (employee.salary || 0) + totalAdj;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 190, display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.35)', backdropFilter: 'blur(3px)' }} onClick={onClose} />
      <div style={{ ...card, position: 'relative', width: 440, height: '100%', borderRadius: '20px 0 0 20px', display: 'flex', flexDirection: 'column', overflowY: 'auto', zIndex: 1 }}>

        <div style={{ background: 'linear-gradient(135deg,#d97706,#f59e0b)', padding: '20px 20px 22px', borderRadius: '20px 0 0 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: col, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 20, fontWeight: 800, flexShrink: 0 }}>
                {initials(employee.first_name, employee.last_name)}
              </div>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>{employee.first_name} {employee.last_name}</h3>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 3 }}>{employee.position || '—'}</p>
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, padding: 7, cursor: 'pointer', color: '#fff', display: 'flex' }}>{I.x}</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, background: 'rgba(255,255,255,0.18)' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.dot }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{st.label}</span>
            </div>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', background: 'rgba(255,255,255,0.15)', padding: '3px 10px', borderRadius: 20 }}>{employee.contract_type}</span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', background: 'rgba(255,255,255,0.15)', padding: '3px 10px', borderRadius: 20 }}>{employee.department || '—'}</span>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>

          <div style={{ background: '#fffbeb', borderRadius: 14, padding: 16, border: '1.5px solid #fde68a' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Remuneration</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { l: 'Salaire brut',   v: fmt(employee.salary || 0),         c: '#92400e' },
                { l: 'Net estime',     v: fmt((employee.salary || 0) * 0.75), c: '#15803d' },
                { l: 'Annuel brut',    v: fmt((employee.salary || 0) * 12),   c: '#1d4ed8' },
                { l: 'Charges patron', v: fmt((employee.salary || 0) * 0.35), c: '#dc2626' },
              ].map((k, i) => (
                <div key={i} style={{ textAlign: 'center', padding: '10px 6px', background: '#fff', borderRadius: 10, border: '1px solid #fde68a' }}>
                  <p style={{ fontSize: 9, color: '#94a3b8', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{k.l}</p>
                  <p style={{ fontSize: 12, fontWeight: 800, color: k.c }}>{k.v}</p>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: salaireThisMonth ? '#f0fdf4' : '#fafafa', borderRadius: 14, padding: 16, border: `1.5px solid ${salaireThisMonth ? '#bbf7d0' : '#e2e8f0'}` }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
              Salaire du mois
            </p>
            {salaireThisMonth ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, background: '#dcfce7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#15803d', flexShrink: 0 }}>{I.check}</div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#15803d' }}>Salaire verse — {fmt(salaireThisMonth.amount)}</p>
                  <p style={{ fontSize: 11, color: '#166534' }}>Enregistre le {fmtD(salaireThisMonth.created_at)}</p>
                </div>
              </div>
            ) : (
              <button onClick={onPaySalary} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px 0', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#0f172a,#334155)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {I.wallet} Payer le salaire de {MONTHS[parseInt(currentMonth().split('-')[1]) - 1]} — {fmt(employee.salary || 0)}
              </button>
            )}
          </div>

          <div style={{ background: '#f8fafc', borderRadius: 14, padding: 16, border: '1px solid #f1f5f9' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Fiche de salaire</p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
              <input type="month" value={selMonth} onChange={e => setSelMonth(e.target.value)} style={{ ...inp, flex: 1 }} />
              <button onClick={() => onPaySlip(selMonth)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,#d97706,#f59e0b)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {I.pdf} PDF
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              {[
                { l: 'Brut',        v: fmt(employee.salary || 0),                      c: '#0f172a' },
                { l: 'Ajustements', v: (totalAdj >= 0 ? '+' : '') + fmt(totalAdj),     c: totalAdj >= 0 ? '#15803d' : '#dc2626' },
                { l: 'Net a payer', v: fmt(net),                                        c: '#d97706' },
              ].map((k, i) => (
                <div key={i} style={{ textAlign: 'center', padding: '8px 4px', background: '#fff', borderRadius: 9, border: '1px solid #e2e8f0' }}>
                  <p style={{ fontSize: 9, color: '#94a3b8', marginBottom: 2 }}>{k.l}</p>
                  <p style={{ fontSize: 12, fontWeight: 800, color: k.c }}>{k.v}</p>
                </div>
              ))}
            </div>
          </div>

          {myAdj.length > 0 && (
            <div style={{ background: '#f8fafc', borderRadius: 14, padding: 16, border: '1px solid #f1f5f9' }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                Ajustements — {MONTHS[parseInt(selMonth.split('-')[1]) - 1]} {selMonth.split('-')[0]}
              </p>
              {myAdj.map((a, i) => {
                const t = ADJ_TYPES[a.type] ?? { label: a.type, color: '#64748b', bg: '#f8fafc', sign: 1 as 1 | -1 };
                const sign = t.sign >= 0 ? '+' : '-';
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < myAdj.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                    <div>
                      <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, background: t.bg, color: t.color, fontSize: 10, fontWeight: 700, marginBottom: 2 }}>{t.label}</span>
                      <p style={{ fontSize: 12, color: '#64748b' }}>{a.reason}</p>
                    </div>
                    <p style={{ fontSize: 13, fontWeight: 800, color: t.color, flexShrink: 0 }}>{sign}{fmt(Math.abs(a.amount))}</p>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ background: '#f8fafc', borderRadius: 14, padding: 16, border: '1px solid #f1f5f9' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Informations</p>
            {[
              { l: 'Email',           v: employee.email || '—',             i: I.mail },
              { l: 'Telephone',       v: employee.phone || '—',             i: I.phone },
              { l: 'Adresse',         v: employee.address || '—',           i: I.location },
              { l: 'IBAN',            v: employee.iban || '—',              i: I.euro },
              { l: 'N° national',     v: employee.national_id || '—',       i: I.id },
              { l: 'Embauche le',     v: fmtD(employee.hire_date),          i: I.calendar },
              { l: 'Anciennete',      v: seniority(employee.hire_date),     i: I.clock },
              { l: 'Contact urgence', v: employee.emergency_contact || '—', i: I.phone },
            ].map((r, i, arr) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: i < arr.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                <span style={{ fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>{r.i}{r.l}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>{r.v}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: '12px 16px', borderTop: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
          <button onClick={onAdjust} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '10px 0', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            {I.adj} Avance / Prime / Retenue
          </button>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button onClick={onEdit} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 0', borderRadius: 10, border: '1.5px solid #fde68a', background: '#fffbeb', color: '#d97706', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              {I.edit} Modifier
            </button>
            <button onClick={onDelete} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 0', borderRadius: 10, border: '1.5px solid #fecaca', background: '#fef2f2', color: '#ef4444', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              {I.trash} Supprimer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   PAGE PRINCIPALE
───────────────────────────────────────────── */
export default function EmployeesPage() {
  const [employees,      setEmployees]      = useState<Employee[]>([]);
  const [adjustments,    setAdjustments]    = useState<PayAdjustment[]>([]);
  const [company,        setCompany]        = useState<CompanySettings | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [view,           setView]           = useState<'list' | 'grid'>('grid');
  const [search,         setSearch]         = useState('');
  const [statusF,        setStatusF]        = useState('all');
  const [deptF,          setDeptF]          = useState('all');
  const [contractF,      setContractF]      = useState('all');
  const [sortBy,         setSortBy]         = useState<'name' | 'salary' | 'hire_date'>('name');
  const [empModal,       setEmpModal]       = useState(false);
  const [adjModal,       setAdjModal]       = useState(false);
  const [adjDefaultType, setAdjDefaultType] = useState<string>('bonus');
  const [editE,          setEditE]          = useState<Employee | null>(null);
  const [viewE,          setViewE]          = useState<Employee | null>(null);
  const [adjTarget,      setAdjTarget]      = useState<Employee | null>(null);
  const [deleteId,       setDeleteId]       = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [empRaw, adjRaw, companyRaw] = await Promise.all([
        fetchSafe('/api/employees'),
        fetchSafe('/api/pay-adjustments'),
        fetch('/api/settings').then(r => r.ok ? r.json() : null).catch(() => null),
      ]);
      setEmployees(toArray<Employee>(empRaw));
      setAdjustments(toArray<PayAdjustment>(adjRaw));
      if (companyRaw && !companyRaw.error) setCompany(companyRaw);
    } catch (e) {
      console.error('HR load error:', e);
      setEmployees([]); setAdjustments([]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = (Array.isArray(employees) ? employees : [])
    .filter(e => {
      const q    = search.toLowerCase();
      const name = `${e.first_name} ${e.last_name}`.toLowerCase();
      return (
        (name.includes(q) || e.email?.toLowerCase().includes(q) || e.position?.toLowerCase().includes(q) || e.department?.toLowerCase().includes(q)) &&
        (statusF   === 'all' || e.status        === statusF) &&
        (deptF     === 'all' || e.department    === deptF) &&
        (contractF === 'all' || e.contract_type === contractF)
      );
    })
    .sort((a, b) => {
      if (sortBy === 'salary')    return (b.salary || 0) - (a.salary || 0);
      if (sortBy === 'hire_date') return (b.hire_date || '').localeCompare(a.hire_date || '');
      return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`);
    });

  const depts = [...new Set((Array.isArray(employees) ? employees : []).map(e => e.department).filter(Boolean))];

  const activeEmps = (Array.isArray(employees) ? employees : []).filter(e => e.status === 'active');
  const kpi = {
    total:    employees.length,
    active:   activeEmps.length,
    onLeave:  (Array.isArray(employees) ? employees : []).filter(e => e.status === 'on_leave').length,
    inactive: (Array.isArray(employees) ? employees : []).filter(e => e.status === 'inactive').length,
    masse:    activeEmps.reduce((s, e) => s + (e.salary || 0), 0),
    masseAnn: activeEmps.reduce((s, e) => s + (e.salary || 0), 0) * 12,
    avgSalary: activeEmps.filter(e => (e.salary || 0) > 0).length
      ? Math.round(activeEmps.filter(e => (e.salary || 0) > 0).reduce((s, e) => s + (e.salary || 0), 0) / activeEmps.filter(e => (e.salary || 0) > 0).length)
      : 0,
    salairesPaies: (Array.isArray(adjustments) ? adjustments : [])
      .filter(a => a.type === 'salaire' && a.month === currentMonth())
      .reduce((s, a) => s + a.amount, 0),
  };

  const hasFilters = !!(search || statusF !== 'all' || deptF !== 'all' || contractF !== 'all');

  async function saveEmployee(form: typeof EMPTY_EMP) {
    const url    = editE ? `/api/employees/${editE.id}` : '/api/employees';
    const method = editE ? 'PATCH' : 'POST';
    const payload = {
      first_name: form.first_name.trim(), last_name: form.last_name.trim(),
      email: form.email?.trim() || null, phone: form.phone?.trim() || null,
      position: form.position?.trim() || null, department: form.department?.trim() || null,
      hire_date: form.hire_date || null, salary: Number(form.salary) || 0,
      status: form.status || 'active', contract_type: form.contract_type || 'CDI',
      payment_method: form.payment_method || 'Virement',
      payment_day: Number(form.payment_day) || 28,
      payment_frequency: form.payment_frequency || 'Mensuel',
      iban: form.iban?.trim() || null, national_id: form.national_id?.trim() || null,
      address: form.address?.trim() || null, emergency_contact: form.emergency_contact?.trim() || null,
    };
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) {
      let msg = `Erreur ${res.status}`;
      try { const j = await res.json(); msg = j?.error ?? msg; } catch { /* ignore */ }
      throw new Error(msg);
    }
    setEmpModal(false); setEditE(null); load();
  }

  async function saveAdjustment(form: typeof EMPTY_ADJ & { employee_id: string }) {
    const res = await fetch('/api/pay-adjustments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    if (!res.ok) {
      let msg = `Erreur ${res.status}`;
      try { const j = await res.json(); msg = j?.error ?? msg; } catch { /* ignore */ }
      throw new Error(msg);
    }
    setAdjModal(false); setAdjTarget(null); load();
  }

  async function del(id: string) {
    await fetch(`/api/employees/${id}`, { method: 'DELETE' });
    setDeleteId(null); setViewE(null); load();
  }

  function openEdit(e: Employee)   { setEditE(e); setViewE(null); setEmpModal(true); }
  function openDelete(e: Employee) { setDeleteId(e.id); setViewE(null); }
  function openAdjust(e: Employee, type = 'bonus') { setAdjTarget(e); setAdjDefaultType(type); setViewE(null); setAdjModal(true); }
  function openPaySalary(e: Employee) { openAdjust(e, 'salaire'); }

  function handlePaySlip(employee: Employee, month: string) {
    const myAdj    = (Array.isArray(adjustments) ? adjustments : []).filter(a => a.employee_id === employee.id && a.month === month);
    const totalAdj = myAdj.reduce((s, a) => { const t = ADJ_TYPES[a.type] ?? { sign: 1 }; return s + t.sign * a.amount; }, 0);
    const [yr]     = month.split('-');

    const companyData: CompanySettings = company ?? {
      company_name: 'Mon Entreprise',
      address:      '—',
      vat_number:   '—',
      email:        '—',
      phone:        '—',
      iban:         '—',
    };

    generatePaySlip(
      {
        employee,
        month,
        year:        parseInt(yr),
        gross:       Number(employee.salary) || 0,
        adjustments: myAdj,
        totalAdj,
        net:         (Number(employee.salary) || 0) + totalAdj,
      },
      companyData,
    );
  }

  function exportCSV() {
    const rows = [
      ['Prenom','Nom','Email','Telephone','Poste','Departement','Contrat','Salaire brut','Statut','Embauche','Anciennete'],
      ...filtered.map(e => [e.first_name, e.last_name, e.email || '', e.phone || '', e.position || '', e.department || '', e.contract_type || '', e.salary, STATUS[e.status]?.label || '', fmtD(e.hire_date), seniority(e.hire_date)]),
    ];
    const csv = rows.map(r => r.map(v => `"${v || ''}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'employes.csv'; a.click();
  }

  /* ════════════ RENDER ════════════ */
  return (
    <div style={{ padding: 24, maxWidth: 1600, margin: '0 auto' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        .rh-tr:hover td { background: #fffbeb !important; }
        .rh-tr td { transition: background 0.1s; }
        .ec { transition: all 0.18s; }
        .ec:hover { transform: translateY(-3px); box-shadow: 0 8px 28px rgba(0,0,0,0.10) !important; }
        .ab { opacity: 0; transition: opacity 0.15s; }
        tr:hover .ab { opacity: 1; }
        select, input { font-family: inherit; }
        input:focus, select:focus { outline: none; border-color: #f59e0b !important; box-shadow: 0 0 0 3px rgba(245,158,11,0.1); }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ color: '#f59e0b' }}>{I.hr}</span> Ressources Humaines
          </h1>
          <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>
            {kpi.total} employe(s) · Masse salariale : <strong style={{ color: '#f59e0b' }}>{fmt(kpi.masse)}/mois</strong>
            {kpi.salairesPaies > 0 && <> · Salaires verses ce mois : <strong style={{ color: '#15803d' }}>{fmt(kpi.salairesPaies)}</strong></>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={exportCSV} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#fff', fontSize: 13, fontWeight: 600, color: '#64748b', cursor: 'pointer' }}>
            {I.export} Export CSV
          </button>
          <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#fff', fontSize: 13, color: '#64748b', cursor: 'pointer' }}>
            {I.refresh}
          </button>
          <button onClick={() => { setEditE(null); setEmpModal(true); }} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#d97706,#f59e0b)', fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', boxShadow: '0 4px 14px rgba(245,158,11,0.35)' }}>
            {I.plus} Nouvel employe
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12, marginBottom: 18 }}>
        {[
          { l: 'Total',           v: kpi.total,         isN: false, color: '#6366f1', border: '#c7d2fe', bg: '#eef2ff' },
          { l: 'Actifs',          v: kpi.active,        isN: false, color: '#10b981', border: '#a7f3d0', bg: '#ecfdf5' },
          { l: 'En conge',        v: kpi.onLeave,       isN: false, color: '#3b82f6', border: '#bfdbfe', bg: '#eff6ff' },
          { l: 'Inactifs',        v: kpi.inactive,      isN: false, color: '#64748b', border: '#e2e8f0', bg: '#f8fafc' },
          { l: 'Masse /mois',     v: kpi.masse,         isN: true,  color: '#f59e0b', border: '#fde68a', bg: '#fffbeb' },
          { l: 'Masse annuelle',  v: kpi.masseAnn,      isN: true,  color: '#d97706', border: '#fde68a', bg: '#fffbeb' },
          { l: 'Salaire moyen',   v: kpi.avgSalary,     isN: true,  color: '#7c3aed', border: '#e9d5ff', bg: '#faf5ff' },
          { l: 'Salaires verses', v: kpi.salairesPaies, isN: true,  color: '#15803d', border: '#a7f3d0', bg: '#f0fdf4' },
        ].map((k, i) => (
          <div key={i} style={{ background: k.bg, borderRadius: 13, border: `1.5px solid ${k.border}`, padding: '12px 14px' }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{k.l}</p>
            <p style={{ fontSize: k.isN ? 13 : 20, fontWeight: 800, color: k.color }}>{k.isN ? fmt(k.v as number) : k.v}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ ...card, padding: '12px 14px', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
            <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }}>{I.search}</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nom, email, poste, departement…" style={{ ...inp, paddingLeft: 34 }} />
          </div>
          <select value={statusF}   onChange={e => setStatusF(e.target.value)}   style={{ ...inp, width: 'auto', minWidth: 145 }}>
            <option value="all">Tous les statuts</option>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={deptF}     onChange={e => setDeptF(e.target.value)}     style={{ ...inp, width: 'auto', minWidth: 155 }}>
            <option value="all">Tous les depts</option>
            {depts.map(d => <option key={d}>{d}</option>)}
          </select>
          <select value={contractF} onChange={e => setContractF(e.target.value)} style={{ ...inp, width: 'auto', minWidth: 145 }}>
            <option value="all">Tous contrats</option>
            {CONTRACT_TYPES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={sortBy}    onChange={e => setSortBy(e.target.value as typeof sortBy)} style={{ ...inp, width: 'auto', minWidth: 150 }}>
            <option value="name">Trier : Nom</option>
            <option value="salary">Trier : Salaire</option>
            <option value="hire_date">Trier : Anciennete</option>
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {hasFilters && (
            <button onClick={() => { setSearch(''); setStatusF('all'); setDeptF('all'); setContractF('all'); }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, border: '1.5px solid #fecaca', background: '#fef2f2', color: '#ef4444', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              {I.x} Reinitialiser
            </button>
          )}
          <span style={{ fontSize: 12, color: '#94a3b8' }}>{filtered.length} resultat(s)</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 3, background: '#f1f5f9', padding: 4, borderRadius: 10 }}>
            {(['list', 'grid'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                style={{ padding: 7, border: 'none', borderRadius: 7, cursor: 'pointer', background: view === v ? '#fff' : 'transparent', color: view === v ? '#f59e0b' : '#94a3b8', boxShadow: view === v ? '0 1px 4px rgba(0,0,0,0.10)' : 'none', display: 'flex', transition: 'all 0.15s' }}>
                {v === 'list' ? I.list : I.grid}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 36, height: 36, border: '3px solid #f59e0b', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
            <p style={{ fontSize: 13, color: '#94a3b8' }}>Chargement…</p>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ ...card, padding: 60, textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, background: '#fffbeb', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', color: '#f59e0b' }}>{I.hr}</div>
          <p style={{ fontSize: 15, fontWeight: 700, color: '#475569' }}>Aucun employe trouve</p>
          <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 6 }}>{hasFilters ? 'Modifiez vos filtres' : 'Ajoutez votre premier employe'}</p>
          {!hasFilters && <button onClick={() => setEmpModal(true)} style={{ marginTop: 20, padding: '10px 24px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#d97706,#f59e0b)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}>{I.plus} Nouvel employe</button>}
        </div>
      ) : view === 'list' ? (
        <div style={{ ...card, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #f1f5f9' }}>
                {['Employe','Contact','Poste / Dept','Contrat','Salaire brut','Anciennete','Statut','Actions'].map((h, i) => (
                  <th key={h} style={{ padding: '11px 14px', textAlign: i === 7 ? 'center' : 'left', fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(e => {
                const st  = STATUS[e.status];
                const col = aColor(`${e.first_name}${e.last_name}`);
                return (
                  <tr key={e.id} className="rh-tr" style={{ borderBottom: '1px solid #f8fafc', cursor: 'pointer' }} onClick={() => setViewE(e)}>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 38, height: 38, borderRadius: 10, background: col, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>
                          {initials(e.first_name, e.last_name)}
                        </div>
                        <div>
                          <p style={{ fontWeight: 700, color: '#0f172a', fontSize: 13 }}>{e.first_name} {e.last_name}</p>
                          {e.national_id && <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>{e.national_id}</p>}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      {e.email && <p style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#64748b', fontSize: 12, marginBottom: 2 }}>{I.mail}{e.email}</p>}
                      {e.phone && <p style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#64748b', fontSize: 12 }}>{I.phone}{e.phone}</p>}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <p style={{ fontWeight: 600, color: '#1e293b', fontSize: 13 }}>{e.position || '—'}</p>
                      {e.department && <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{e.department}</p>}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ padding: '3px 10px', background: '#f1f5f9', borderRadius: 20, fontSize: 11, fontWeight: 700, color: '#475569' }}>{e.contract_type || '—'}</span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <p style={{ fontWeight: 800, color: '#0f172a', fontSize: 13 }}>{e.salary ? fmt(e.salary) : '—'}</p>
                      {e.salary > 0 && <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>≈{fmt(e.salary * 0.75)} net</p>}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <p style={{ fontSize: 12, color: '#64748b' }}>{seniority(e.hire_date)}</p>
                      <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>{fmtD(e.hire_date)}</p>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, background: st.bg, border: `1px solid ${st.border}` }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.dot }} />
                        <span style={{ fontSize: 11, fontWeight: 700, color: st.color }}>{st.label}</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px' }} onClick={ev => ev.stopPropagation()}>
                      <div className="ab" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                        {[
                          { title: 'Voir',       icon: I.eye,     hBg: '#eef2ff', hCol: '#6366f1', fn: () => setViewE(e) },
                          { title: 'Salaire',    icon: I.salary,  hBg: '#f0fdf4', hCol: '#15803d', fn: () => openPaySalary(e) },
                          { title: 'Ajustement', icon: I.adj,     hBg: '#faf5ff', hCol: '#7c3aed', fn: () => openAdjust(e) },
                          { title: 'Fiche paie', icon: I.payslip, hBg: '#fffbeb', hCol: '#d97706', fn: () => handlePaySlip(e, currentMonth()) },
                          { title: 'Modifier',   icon: I.edit,    hBg: '#fef9c3', hCol: '#d97706', fn: () => openEdit(e) },
                          { title: 'Supprimer',  icon: I.trash,   hBg: '#fef2f2', hCol: '#ef4444', fn: () => openDelete(e) },
                        ].map((b, bi) => (
                          <button key={bi} title={b.title} onClick={b.fn}
                            style={{ height: 30, width: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: 'none', cursor: 'pointer', background: b.hBg, color: b.hCol, transition: 'all 0.15s', flexShrink: 0 }}
                            onMouseEnter={ev => { const el = ev.currentTarget as HTMLElement; el.style.opacity = '0.8'; el.style.transform = 'scale(1.1)'; }}
                            onMouseLeave={ev => { const el = ev.currentTarget as HTMLElement; el.style.opacity = '1'; el.style.transform = 'scale(1)'; }}>
                            {b.icon}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ padding: '9px 16px', borderTop: '1px solid #f8fafc', display: 'flex', justifyContent: 'space-between', background: '#fafafa', fontSize: 12, color: '#94a3b8' }}>
            <span>{filtered.length} resultat(s) sur {employees.length}</span>
            <span>Masse filtree : <strong style={{ color: '#f59e0b' }}>{fmt(filtered.reduce((s, e) => s + (e.salary || 0), 0))}/mois</strong></span>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 16 }}>
          {filtered.map(e => {
            const st  = STATUS[e.status];
            const col = aColor(`${e.first_name}${e.last_name}`);
            const myAdjCount = (Array.isArray(adjustments) ? adjustments : []).filter(a => a.employee_id === e.id).length;
            const salaireVerse = (Array.isArray(adjustments) ? adjustments : []).some(a => a.employee_id === e.id && a.type === 'salaire' && a.month === currentMonth());
            return (
              <div key={e.id} className="ec" style={{ ...card, overflow: 'hidden', cursor: 'pointer' }} onClick={() => setViewE(e)}>
                <div style={{ height: 4, background: e.status === 'active' ? 'linear-gradient(90deg,#d97706,#f59e0b)' : e.status === 'on_leave' ? 'linear-gradient(90deg,#2563eb,#3b82f6)' : 'linear-gradient(90deg,#94a3b8,#64748b)' }} />
                <div style={{ padding: '16px 16px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                    <div style={{ width: 50, height: 50, borderRadius: 14, background: col, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18, fontWeight: 800, flexShrink: 0 }}>
                      {initials(e.first_name, e.last_name)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontWeight: 800, color: '#0f172a', fontSize: 14 }}>{e.first_name} {e.last_name}</p>
                      <p style={{ fontSize: 12, color: '#64748b', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.position || '—'}</p>
                      <div style={{ display: 'flex', gap: 5, marginTop: 6, flexWrap: 'wrap' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, background: st.bg, border: `1px solid ${st.border}` }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: st.dot }} />
                          <span style={{ fontSize: 10, fontWeight: 700, color: st.color }}>{st.label}</span>
                        </div>
                        <span style={{ padding: '2px 8px', background: '#f1f5f9', borderRadius: 20, fontSize: 10, fontWeight: 700, color: '#475569' }}>{e.contract_type}</span>
                        {salaireVerse && (
                          <span style={{ padding: '2px 8px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 20, fontSize: 10, fontWeight: 700, color: '#15803d', display: 'flex', alignItems: 'center', gap: 3 }}>
                            {I.check} Verse
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, marginBottom: 12 }}>
                    {e.email      && <p style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{I.mail}{e.email}</p>}
                    {e.department && <p style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#64748b' }}>{I.building}{e.department}</p>}
                    {e.hire_date  && <p style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#94a3b8' }}>{I.clock}{seniority(e.hire_date)}</p>}
                  </div>

                  {e.salary > 0 && (
                    <div style={{ background: 'linear-gradient(135deg,#d97706,#f59e0b)', borderRadius: 12, padding: '10px 14px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', marginBottom: 2 }}>Salaire brut/mois</p>
                        <p style={{ fontSize: 17, fontWeight: 800, color: '#fff' }}>{fmt(e.salary)}</p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', marginBottom: 2 }}>Net estime</p>
                        <p style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>{fmt(e.salary * 0.75)}</p>
                      </div>
                    </div>
                  )}

                  {myAdjCount > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: '#faf5ff', borderRadius: 8, border: '1px solid #e9d5ff', marginBottom: 10 }}>
                      <span style={{ color: '#7c3aed' }}>{I.adj}</span>
                      <span style={{ fontSize: 11, color: '#7c3aed', fontWeight: 600 }}>{myAdjCount} ajustement(s)</span>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 5, paddingTop: 10, borderTop: '1px solid #f1f5f9' }} onClick={ev => ev.stopPropagation()}>
                    {[
                      { label: 'Voir',    icon: I.eye,     hBg: '#eef2ff', hCol: '#6366f1', fn: () => setViewE(e) },
                      { label: 'Salaire', icon: I.salary,  hBg: '#f0fdf4', hCol: '#15803d', fn: () => openPaySalary(e) },
                      { label: 'Prime',   icon: I.adj,     hBg: '#faf5ff', hCol: '#7c3aed', fn: () => openAdjust(e) },
                      { label: 'Fiche',   icon: I.payslip, hBg: '#fffbeb', hCol: '#d97706', fn: () => handlePaySlip(e, currentMonth()) },
                    ].map((b, bi) => (
                      <button key={bi} onClick={b.fn}
                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '7px 0', borderRadius: 8, border: 'none', background: '#f8fafc', fontSize: 11, fontWeight: 600, color: '#64748b', cursor: 'pointer', transition: 'all 0.15s' }}
                        onMouseEnter={ev => { (ev.currentTarget as HTMLElement).style.background = b.hBg; (ev.currentTarget as HTMLElement).style.color = b.hCol; }}
                        onMouseLeave={ev => { (ev.currentTarget as HTMLElement).style.background = '#f8fafc'; (ev.currentTarget as HTMLElement).style.color = '#64748b'; }}>
                        {b.icon} {b.label}
                      </button>
                    ))}
                    <button onClick={() => openEdit(e)}
                      style={{ width: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: 'none', background: '#f8fafc', color: '#94a3b8', cursor: 'pointer', transition: 'all 0.15s' }}
                      onMouseEnter={ev => { (ev.currentTarget as HTMLElement).style.background = '#fef9c3'; (ev.currentTarget as HTMLElement).style.color = '#d97706'; }}
                      onMouseLeave={ev => { (ev.currentTarget as HTMLElement).style.background = '#f8fafc'; (ev.currentTarget as HTMLElement).style.color = '#94a3b8'; }}>
                      {I.edit}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirm Delete */}
      {deleteId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(6px)' }} onClick={() => setDeleteId(null)} />
          <div style={{ ...card, position: 'relative', width: '100%', maxWidth: 380, padding: 28, textAlign: 'center', zIndex: 1 }}>
            <div style={{ width: 52, height: 52, background: '#fef2f2', border: '2px solid #fecaca', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', color: '#ef4444' }}>{I.trash}</div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>Supprimer cet employe ?</h3>
            <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 22, lineHeight: 1.6 }}>Cette action est irreversible et supprimera egalement ses ajustements de paie.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDeleteId(null)} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#fff', fontSize: 13, fontWeight: 600, color: '#64748b', cursor: 'pointer' }}>Annuler</button>
              <button onClick={() => del(deleteId)}     style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', background: '#ef4444', fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer' }}>Supprimer</button>
            </div>
          </div>
        </div>
      )}

      {/* Modals & Drawer */}
      <EmployeeModal open={empModal} onClose={() => { setEmpModal(false); setEditE(null); }} onSave={saveEmployee} initial={editE} />
      <AdjustmentModal open={adjModal} onClose={() => { setAdjModal(false); setAdjTarget(null); }} onSave={saveAdjustment} employee={adjTarget} defaultType={adjDefaultType} />
      <EmployeeDrawer
        employee={viewE} adjustments={Array.isArray(adjustments) ? adjustments : []}
        onClose={() => setViewE(null)}
        onEdit={() => { if (viewE) openEdit(viewE); }}
        onDelete={() => { if (viewE) openDelete(viewE); }}
        onAdjust={() => { if (viewE) openAdjust(viewE); }}
        onPaySalary={() => { if (viewE) openPaySalary(viewE); }}
        onPaySlip={(month) => { if (viewE) handlePaySlip(viewE, month); }}
      />
    </div>
  );
}
