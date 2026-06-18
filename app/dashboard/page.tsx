'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { createClient } from '@supabase/supabase-js'

// ─── Types ────────────────────────────────────────────────────────────────────
interface ChartPoint {
  month: string; year: number; key: string
  revenus: number; fournisseurs: number; flotte: number
  salaires: number; ajustements: number; depenses: number; resultat: number
}

interface DashboardData {
  clients:   { total: number; active: number; total_clients: number }
  invoices:  { total: number; paid: number; pending: number; overdue: number }
  revenue:   { total: number; pending: number }
  depenses:  {
    fournisseurs_total: number; fournisseurs_paid: number; fournisseurs_pending: number
    flotte: number; flotte_by_type: Record<string, number>
    rh_salaires: number; rh_ajustements: number; rh_total: number
    total: number; by_category: Record<string, number>
  }
  projects:  { total: number; active: number; budget_total: number }
  employees: { total: number; active: number }
  fleet:     { total: number; active: number }
  stock:     { total: number; low_stock: number; out_of_stock: number; total_value: number; total_sell_value: number }
  rh: {
    masse_salariale: number; masse_annuelle: number
    salaires_verses: number; adj_this_month: number
    total_ajustements: number; total_personnel: number; nb_employes: number
  }
  resultat_net: number
  chart_data:   ChartPoint[]
  external_invoices: { total: number; paid: number }
}

// ─── Couleurs ─────────────────────────────────────────────────────────────────
const C = {
  blue:    '#2563eb', green:  '#10b981', amber:  '#f59e0b',
  red:     '#ef4444', purple: '#8b5cf6', cyan:   '#06b6d4',
  orange:  '#f97316', slate:  '#64748b', text:   '#0f172a',
  border:  '#e2e8f0', bg:     '#f8fafc', primary:'#1e3a5f',
  indigo:  '#6366f1', teal:   '#14b8a6', rose:   '#f43f5e',
}

const DEP_COLORS = {
  fournisseurs: C.blue,
  flotte:       C.cyan,
  salaires:     C.purple,
  ajustements:  C.indigo,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt  = (n: number) =>
  new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0)
const fmtK = (v: number) => Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(Math.round(v))
const pct  = (a: number, b: number) => b > 0 ? Math.round((a / b) * 100) : 0

async function getUserId(): Promise<string | null> {
  try {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data } = await sb.auth.getSession()
    return data?.session?.user?.id ?? null
  } catch { return null }
}

// ─── Hook animation compteur ──────────────────────────────────────────────────
function useCountUp(target: number, duration = 800) {
  const [val, setVal] = useState(0)
  const ref = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (ref.current) clearTimeout(ref.current)
    const steps = 30
    const step  = target / steps
    let current = 0
    const tick  = () => {
      current += step
      if (current >= target) { setVal(target); return }
      setVal(Math.round(current))
      ref.current = setTimeout(tick, duration / steps)
    }
    setVal(0)
    ref.current = setTimeout(tick, 50)
    return () => { if (ref.current) clearTimeout(ref.current) }
  }, [target, duration])
  return val
}

// ─── Tooltip personnalisé ─────────────────────────────────────────────────────
function CTooltip({ active, payload, label }: {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s, p) => s + (p.value || 0), 0)
  return (
    <div style={{
      background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12,
      padding: '10px 14px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
      fontSize: 12, minWidth: 180,
    }}>
      <p style={{ fontWeight: 700, color: C.text, marginBottom: 8, fontSize: 13 }}>{label}</p>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
          <span style={{ color: C.slate, flex: 1 }}>{p.name}</span>
          <span style={{ fontWeight: 700, color: C.text }}>{fmt(p.value)}</span>
        </div>
      ))}
      {payload.length > 1 && (
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 6, marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, color: C.slate, fontSize: 11 }}>Total</span>
          <span style={{ fontWeight: 800, color: C.text }}>{fmt(total)}</span>
        </div>
      )}
    </div>
  )
}

// ─── KPI Card animée ──────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color, icon, trend, alert }: {
  label: string; value: number; sub?: string; color: string
  icon: React.ReactNode; trend?: number; alert?: boolean
}) {
  const animated     = useCountUp(value)
  const isNeg        = value < 0
  const displayColor = alert ? C.red : isNeg ? C.red : color

  return (
    <div
      style={{
        background: '#fff', borderRadius: 16,
        border: `1.5px solid ${alert || isNeg ? '#fecaca' : color + '30'}`,
        boxShadow: `0 2px 12px ${displayColor}12`,
        padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12,
        transition: 'transform 0.2s, box-shadow 0.2s',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLDivElement
        el.style.transform = 'translateY(-2px)'
        el.style.boxShadow = `0 8px 24px ${displayColor}20`
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLDivElement
        el.style.transform = ''
        el.style.boxShadow = `0 2px 12px ${displayColor}12`
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: C.slate, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {label}
        </p>
        <div style={{
          width: 38, height: 38, borderRadius: 10,
          background: alert || isNeg ? '#fef2f2' : color + '15',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: displayColor, flexShrink: 0,
        }}>
          {icon}
        </div>
      </div>
      <div>
        <p style={{ fontSize: 24, fontWeight: 900, color: displayColor, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
          {isNeg ? '-' : ''}{fmt(Math.abs(animated)).replace('€', '').trim()} €
        </p>
        {sub && <p style={{ fontSize: 11, color: C.slate, marginTop: 5, lineHeight: 1.4 }}>{sub}</p>}
      </div>
      {trend !== undefined && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px',
          borderRadius: 20, background: trend >= 0 ? '#dcfce7' : '#fee2e2',
          color: trend >= 0 ? '#16a34a' : '#dc2626', fontSize: 11, fontWeight: 700, width: 'fit-content',
        }}>
          <svg width="9" height="9" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            {trend >= 0
              ? <polyline points="18 15 12 9 6 15" />
              : <polyline points="6 9 12 15 18 9" />
            }
          </svg>
          {Math.abs(trend).toFixed(1)}%
        </div>
      )}
    </div>
  )
}

// ─── Stat mini card ───────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color, icon }: {
  label: string; value: number | string; sub: string; color: string; icon: React.ReactNode
}) {
  return (
    <div
      style={{
        background: '#fff', borderRadius: 13, border: `1.5px solid ${color}22`,
        padding: '13px 15px', display: 'flex', alignItems: 'center', gap: 12,
        transition: 'transform 0.2s', cursor: 'default',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = '' }}
    >
      <div style={{
        width: 42, height: 42, borderRadius: 11, background: color + '15',
        display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 20, fontWeight: 800, color: C.text, lineHeight: 1 }}>{value}</p>
        <p style={{ fontSize: 11, fontWeight: 600, color: C.slate, marginTop: 3 }}>{label}</p>
        <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</p>
      </div>
    </div>
  )
}

// ─── Barre de progression ─────────────────────────────────────────────────────
function DepBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const p = total > 0 ? Math.min(100, (value / total) * 100) : 0
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: C.slate }}>{label}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{fmt(value)}</span>
          <span style={{ fontSize: 10, color: '#94a3b8', background: C.bg, borderRadius: 6, padding: '1px 6px', minWidth: 32, textAlign: 'center' }}>
            {Math.round(p)}%
          </span>
        </div>
      </div>
      <div style={{ height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${p}%`, background: color, borderRadius: 3, transition: 'width 0.8s ease' }} />
      </div>
    </div>
  )
}

// ─── PAGE PRINCIPALE ──────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [data,    setData]    = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [period,  setPeriod]  = useState<'month' | 'quarter' | 'year'>('year')
  const [depTab,  setDepTab]  = useState<'evolution' | 'repartition' | 'rh' | 'flotte'>('evolution')
  const [updated, setUpdated] = useState(new Date())

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const userId = await getUserId()
      if (!userId) { setLoading(false); return }

      const res = await fetch('/api/dashboard', {
        headers: { 'x-user-id': userId },
        cache: 'no-store',
      })
      if (res.ok) {
        const text = await res.text()
        if (text) setData(JSON.parse(text))
      }
      setUpdated(new Date())
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [load])

  // ── Filtrage période ─────────────────────────────────────────────────────────
  const chartData     = data?.chart_data ?? []
  const periodCount   = period === 'month' ? 1 : period === 'quarter' ? 3 : 12
  const filteredChart = chartData.slice(-periodCount)

  const periodRevenue      = filteredChart.reduce((s, d) => s + d.revenus,      0)
  const periodFournisseurs = filteredChart.reduce((s, d) => s + d.fournisseurs, 0)
  const periodFlotte       = filteredChart.reduce((s, d) => s + d.flotte,       0)
  const periodSalaires     = filteredChart.reduce((s, d) => s + d.salaires,     0)
  const periodAjustements  = filteredChart.reduce((s, d) => s + d.ajustements,  0)
  const periodDepenses     = filteredChart.reduce((s, d) => s + d.depenses,     0)
  const periodResultat     = periodRevenue - periodDepenses

  // ── Pie dépenses ─────────────────────────────────────────────────────────────
  const PIE_DEP = [
    { name: 'Fournisseurs', value: periodFournisseurs, color: DEP_COLORS.fournisseurs },
    { name: 'RH Salaires',  value: periodSalaires,     color: DEP_COLORS.salaires },
    { name: 'Flotte',       value: periodFlotte,        color: DEP_COLORS.flotte },
    { name: 'Ajustements',  value: periodAjustements,   color: DEP_COLORS.ajustements },
  ].filter(d => d.value > 0)

  const CAT_COLORS = [C.blue, C.cyan, C.purple, C.amber, C.orange, C.teal, C.rose, C.green]

  const pieCat = data?.depenses?.by_category
    ? Object.entries(data.depenses.by_category)
        .filter(([, v]) => v > 0)
        .map(([name, value], i) => ({ name, value, color: CAT_COLORS[i % CAT_COLORS.length] }))
        .sort((a, b) => b.value - a.value)
    : []

  const pieFlotte = data?.depenses?.flotte_by_type
    ? Object.entries(data.depenses.flotte_by_type)
        .filter(([, v]) => v > 0)
        .map(([name, value], i) => ({ name, value, color: CAT_COLORS[i % CAT_COLORS.length] }))
        .sort((a, b) => b.value - a.value)
    : []

  const PERIOD_LABELS: Record<string, string> = {
    month: 'Ce mois', quarter: 'Ce trimestre', year: 'Cette année',
  }

  // ── Alertes ──────────────────────────────────────────────────────────────────
  const alerts: { msg: string; level: 'warn' | 'error' }[] = []
  if ((data?.invoices?.overdue || 0) > 0)
    alerts.push({ msg: `${data!.invoices.overdue} facture(s) client en retard`, level: 'error' })
  if ((data?.stock?.out_of_stock || 0) > 0)
    alerts.push({ msg: `${data!.stock.out_of_stock} article(s) en rupture de stock`, level: 'error' })
  if ((data?.stock?.low_stock || 0) > 0)
    alerts.push({ msg: `${data!.stock.low_stock} article(s) en stock critique`, level: 'warn' })
  if ((data?.depenses?.fournisseurs_pending || 0) > 0)
    alerts.push({ msg: `${fmt(data!.depenses.fournisseurs_pending)} de factures fournisseurs en attente`, level: 'warn' })
  if (periodResultat < 0)
    alerts.push({ msg: `Résultat négatif de ${fmt(Math.abs(periodResultat))} sur la période`, level: 'error' })

  // ── Spinner ──────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 40, height: 40, border: `3px solid ${C.blue}`, borderTopColor: 'transparent',
          borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 14px',
        }} />
        <p style={{ color: '#94a3b8', fontSize: 13 }}>Chargement du tableau de bord…</p>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '24px 28px', maxWidth: 1700, margin: '0 auto', background: C.bg, minHeight: '100vh' }}>
      <style>{`
        @keyframes spin   { to { transform: rotate(360deg) } }
        @keyframes fadeUp { from { opacity:0;transform:translateY(12px) } to { opacity:1;transform:translateY(0) } }
        .db-card { animation: fadeUp 0.35s ease both }
        .db-card:nth-child(1){animation-delay:0.05s} .db-card:nth-child(2){animation-delay:0.10s}
        .db-card:nth-child(3){animation-delay:0.15s} .db-card:nth-child(4){animation-delay:0.20s}
        .db-card:nth-child(5){animation-delay:0.25s} .db-card:nth-child(6){animation-delay:0.30s}
        .tab-btn { transition: all 0.15s }
        .tab-btn:hover { opacity: 0.85 }
      `}</style>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 26, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 46, height: 46, borderRadius: 14,
            background: `linear-gradient(135deg,${C.primary},${C.blue})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', boxShadow: `0 4px 14px ${C.blue}40`,
          }}>
            <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <rect x="3" y="3" width="7" height="7" rx="1.5"/>
              <rect x="14" y="3" width="7" height="7" rx="1.5"/>
              <rect x="3" y="14" width="7" height="7" rx="1.5"/>
              <rect x="14" y="14" width="7" height="7" rx="1.5"/>
            </svg>
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: C.text }}>Tableau de bord</h1>
            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
              {PERIOD_LABELS[period]} · Mis à jour : {updated.toLocaleTimeString('fr-BE')}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Sélecteur de période */}
          <div style={{ display: 'flex', background: '#fff', border: `1.5px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
            {(['month', 'quarter', 'year'] as const).map((p, i) => (
              <button
                key={p} onClick={() => setPeriod(p)} className="tab-btn"
                style={{
                  padding: '8px 18px', border: 'none',
                  borderRight: i < 2 ? `1px solid ${C.border}` : 'none',
                  background: period === p ? C.blue : 'transparent',
                  color: period === p ? '#fff' : C.slate,
                  fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}
              >
                {['Mois', 'Trimestre', 'Année'][i]}
              </button>
            ))}
          </div>

          {/* Actualiser */}
          <button
            onClick={load}
            style={{
              padding: '9px 12px', background: '#fff', border: `1.5px solid ${C.border}`,
              borderRadius: 11, cursor: 'pointer', color: C.slate,
              display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600,
            }}
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
            Actualiser
          </button>
        </div>
      </div>

      {/* ── KPIs financiers ── */}
      <div className="db-card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14, marginBottom: 16 }}>
        <KpiCard
          label="Chiffre d'affaires encaissé" value={periodRevenue}
          sub={`${data?.invoices.paid || 0} facture(s) payée(s) · ${PERIOD_LABELS[period].toLowerCase()}`}
          color={C.green}
          icon={<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>}
        />
        <KpiCard
          label="Dépenses totales" value={periodDepenses}
          sub={`Fournisseurs + RH + Flotte · ${PERIOD_LABELS[period].toLowerCase()}`}
          color={C.red}
          icon={<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>}
        />
        <KpiCard
          label="Résultat net" value={periodResultat}
          sub={`Revenus − Dépenses · ${PERIOD_LABELS[period].toLowerCase()}`}
          color={periodResultat >= 0 ? C.green : C.red}
          alert={periodResultat < 0}
          icon={<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>}
        />
        <KpiCard
          label="En attente d'encaissement" value={data?.revenue.pending || 0}
          sub={`${data?.invoices.pending || 0} facture(s) non réglée(s)`}
          color={C.amber}
          icon={<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
        />
      </div>

      {/* ── Alertes ── */}
      {alerts.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {alerts.map((a, i) => (
            <div
              key={i}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px',
                background: a.level === 'error' ? '#fef2f2' : '#fffbeb',
                border: `1.5px solid ${a.level === 'error' ? '#fecaca' : '#fde68a'}`,
                borderRadius: 10, fontSize: 12,
                color: a.level === 'error' ? '#991b1b' : '#92400e', fontWeight: 500,
              }}
            >
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              {a.msg}
            </div>
          ))}
        </div>
      )}

      {/* ── Graphique principal + Récap ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginBottom: 14 }}>

        {/* Graphique barres empilées */}
        <div className="db-card" style={{ background: '#fff', borderRadius: 16, border: `1px solid ${C.border}`, padding: 22, boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 8 }}>
            <div>
              <p style={{ fontSize: 15, fontWeight: 800, color: C.text }}>Revenus vs Dépenses ventilées</p>
              <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                Détail par catégorie · {period === 'month' ? 'Mois en cours' : period === 'quarter' ? '3 derniers mois' : '12 derniers mois'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11 }}>
              {[
                { label: 'Revenus',      color: C.green },
                { label: 'Fournisseurs', color: DEP_COLORS.fournisseurs },
                { label: 'Flotte',       color: DEP_COLORS.flotte },
                { label: 'Salaires',     color: DEP_COLORS.salaires },
                { label: 'Ajustements',  color: DEP_COLORS.ajustements },
              ].map(l => (
                <span key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: l.color, display: 'inline-block' }} />
                  <span style={{ color: C.slate }}>{l.label}</span>
                </span>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={filteredChart} margin={{ top: 5, right: 10, left: 0, bottom: 0 }} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={fmtK} width={44} />
              <Tooltip content={<CTooltip />} />
              <Bar dataKey="revenus"      name="Revenus"      fill={C.green}                 radius={[4,4,0,0]} stackId="rev" />
              <Bar dataKey="fournisseurs" name="Fournisseurs" fill={DEP_COLORS.fournisseurs} radius={[0,0,0,0]} stackId="dep" />
              <Bar dataKey="flotte"       name="Flotte"       fill={DEP_COLORS.flotte}        radius={[0,0,0,0]} stackId="dep" />
              <Bar dataKey="salaires"     name="Salaires"     fill={DEP_COLORS.salaires}      radius={[0,0,0,0]} stackId="dep" />
              <Bar dataKey="ajustements"  name="Ajustements"  fill={DEP_COLORS.ajustements}   radius={[4,4,0,0]} stackId="dep" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Récap financier */}
        <div className="db-card" style={{ background: '#fff', borderRadius: 16, border: `1px solid ${C.border}`, padding: 22, boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
          <p style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 4 }}>Récapitulatif financier</p>
          <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 18 }}>{PERIOD_LABELS[period]}</p>

          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: C.slate, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Revenus</p>
            <DepBar label="CA encaissé" value={periodRevenue} total={periodRevenue + (data?.revenue.pending || 0)} color={C.green} />
            <DepBar label="En attente"  value={data?.revenue.pending || 0} total={periodRevenue + (data?.revenue.pending || 0)} color={C.amber} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: C.slate, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Dépenses</p>
            <DepBar label="Fournisseurs" value={periodFournisseurs} total={periodDepenses} color={DEP_COLORS.fournisseurs} />
            <DepBar label="Salaires RH"  value={periodSalaires}     total={periodDepenses} color={DEP_COLORS.salaires} />
            <DepBar label="Flotte"       value={periodFlotte}        total={periodDepenses} color={DEP_COLORS.flotte} />
            <DepBar label="Ajustements"  value={periodAjustements}   total={periodDepenses} color={DEP_COLORS.ajustements} />
          </div>

          <div style={{ borderTop: `2px solid ${C.border}`, paddingTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Résultat net</span>
              <span style={{ fontSize: 20, fontWeight: 900, color: periodResultat >= 0 ? C.green : C.red }}>
                {fmt(periodResultat)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>Taux de marge</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: periodResultat >= 0 ? C.green : C.red }}>
                {periodRevenue > 0 ? Math.round((periodResultat / periodRevenue) * 100) : 0}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Onglets dépenses ── */}
      <div className="db-card" style={{ background: '#fff', borderRadius: 16, border: `1px solid ${C.border}`, padding: 22, boxShadow: '0 2px 12px rgba(0,0,0,0.05)', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <p style={{ fontSize: 15, fontWeight: 800, color: C.text }}>Analyse des dépenses</p>
            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Détail et répartition par catégorie</p>
          </div>
          <div style={{ display: 'flex', background: C.bg, border: `1.5px solid ${C.border}`, borderRadius: 11, overflow: 'hidden' }}>
            {([
              { key: 'evolution',   label: 'Évolution' },
              { key: 'repartition', label: 'Répartition' },
              { key: 'rh',          label: 'RH' },
              { key: 'flotte',      label: 'Flotte' },
            ] as const).map((t, i, arr) => (
              <button
                key={t.key} onClick={() => setDepTab(t.key)} className="tab-btn"
                style={{
                  padding: '7px 16px', border: 'none',
                  borderRight: i < arr.length - 1 ? `1px solid ${C.border}` : 'none',
                  background: depTab === t.key ? C.primary : 'transparent',
                  color: depTab === t.key ? '#fff' : C.slate,
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Évolution */}
        {depTab === 'evolution' && (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={filteredChart} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                {[
                  { id: 'grRev', color: C.green },
                  { id: 'grFou', color: DEP_COLORS.fournisseurs },
                  { id: 'grFlo', color: DEP_COLORS.flotte },
                  { id: 'grSal', color: DEP_COLORS.salaires },
                ].map(g => (
                  <linearGradient key={g.id} id={g.id} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={g.color} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={g.color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={fmtK} width={44} />
              <Tooltip content={<CTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="revenus"      name="Revenus"      stroke={C.green}                fill="url(#grRev)" strokeWidth={2.5} dot={false} />
              <Area type="monotone" dataKey="fournisseurs" name="Fournisseurs" stroke={DEP_COLORS.fournisseurs} fill="url(#grFou)" strokeWidth={2}   dot={false} />
              <Area type="monotone" dataKey="flotte"       name="Flotte"       stroke={DEP_COLORS.flotte}       fill="url(#grFlo)" strokeWidth={2}   dot={false} />
              <Area type="monotone" dataKey="salaires"     name="Salaires"     stroke={DEP_COLORS.salaires}     fill="url(#grSal)" strokeWidth={2}   dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}

        {/* Tab Répartition */}
        {depTab === 'repartition' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: C.slate, marginBottom: 12 }}>Par type de charge</p>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={PIE_DEP} cx="50%" cy="50%" innerRadius={44} outerRadius={70} paddingAngle={4} dataKey="value">
                    {PIE_DEP.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => [fmt(v), '']} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                {PIE_DEP.map((d, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: i < PIE_DEP.length - 1 ? '1px solid #f8fafc' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: C.slate }}>{d.name}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{fmt(d.value)}</span>
                      <span style={{ fontSize: 10, color: '#94a3b8', background: C.bg, borderRadius: 5, padding: '1px 5px' }}>
                        {pct(d.value, periodDepenses)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: C.slate, marginBottom: 12 }}>Fournisseurs par catégorie</p>
              {pieCat.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={pieCat} cx="50%" cy="50%" innerRadius={44} outerRadius={70} paddingAngle={4} dataKey="value">
                        {pieCat.map((e, i) => <Cell key={i} fill={e.color} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => [fmt(v), '']} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10, maxHeight: 130, overflowY: 'auto' }}>
                    {pieCat.map((d, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                          <span style={{ fontSize: 11, color: C.slate }}>{d.name}</span>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{fmt(d.value)}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 20 }}>Aucune donnée fournisseur</p>
              )}
            </div>
          </div>
        )}

        {/* Tab RH */}
        {depTab === 'rh' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
                {[
                  { l: 'Masse salariale/mois', v: fmt(data?.rh?.masse_salariale    || 0), c: C.purple },
                  { l: 'Salaires versés total', v: fmt(data?.rh?.salaires_verses   || 0), c: C.green },
                  { l: 'Primes & avances',      v: fmt(data?.rh?.total_ajustements || 0), c: C.amber },
                  { l: 'Masse annuelle',         v: fmt(data?.rh?.masse_annuelle    || 0), c: C.indigo },
                ].map((k, i) => (
                  <div key={i} style={{ background: C.bg, borderRadius: 10, padding: '12px 14px', border: `1px solid ${C.border}` }}>
                    <p style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4 }}>{k.l}</p>
                    <p style={{ fontSize: 15, fontWeight: 800, color: k.c }}>{k.v}</p>
                  </div>
                ))}
              </div>
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={filteredChart} margin={{ top: 5, right: 10, left: 0, bottom: 0 }} barSize={18}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={fmtK} width={40} />
                  <Tooltip content={<CTooltip />} />
                  <Bar dataKey="salaires"    name="Salaires"    fill={DEP_COLORS.salaires}    radius={[4,4,0,0]} />
                  <Bar dataKey="ajustements" name="Ajustements" fill={DEP_COLORS.ajustements}  radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: C.slate, marginBottom: 12 }}>Charges RH vs Revenus</p>
              <DepBar label="Salaires versés"  value={data?.rh?.salaires_verses    || 0} total={periodRevenue} color={DEP_COLORS.salaires} />
              <DepBar label="Primes & avances" value={data?.rh?.total_ajustements  || 0} total={periodRevenue} color={DEP_COLORS.ajustements} />
              <DepBar label="Total charges RH" value={data?.depenses?.rh_total     || 0} total={periodRevenue} color={C.purple} />
              <div style={{ marginTop: 16, padding: 14, background: '#faf5ff', borderRadius: 12, border: '1px solid #e9d5ff' }}>
                <p style={{ fontSize: 11, color: C.slate, marginBottom: 4 }}>Coût RH / CA</p>
                <p style={{ fontSize: 22, fontWeight: 900, color: C.purple }}>
                  {periodRevenue > 0 ? Math.round(((data?.depenses?.rh_total || 0) / periodRevenue) * 100) : 0}%
                </p>
                <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{data?.rh?.nb_employes || 0} employé(s) actif(s)</p>
              </div>
            </div>
          </div>
        )}

        {/* Tab Flotte */}
        {depTab === 'flotte' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
                {[
                  { l: 'Dépenses flotte totales', v: fmt(data?.depenses?.flotte || 0),  c: C.cyan },
                  { l: 'Véhicules actifs',         v: String(data?.fleet?.active || 0),  c: C.blue },
                  { l: 'Coût / véhicule',          v: fmt((data?.fleet?.active || 0) > 0 ? (data?.depenses?.flotte || 0) / (data!.fleet.active) : 0), c: C.teal },
                  { l: 'Flotte / CA',              v: `${periodRevenue > 0 ? Math.round(((data?.depenses?.flotte || 0) / periodRevenue) * 100) : 0}%`, c: C.orange },
                ].map((k, i) => (
                  <div key={i} style={{ background: C.bg, borderRadius: 10, padding: '12px 14px', border: `1px solid ${C.border}` }}>
                    <p style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4 }}>{k.l}</p>
                    <p style={{ fontSize: 15, fontWeight: 800, color: k.c }}>{k.v}</p>
                  </div>
                ))}
              </div>
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={filteredChart} margin={{ top: 5, right: 10, left: 0, bottom: 0 }} barSize={20}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={fmtK} width={40} />
                  <Tooltip content={<CTooltip />} />
                  <Bar dataKey="flotte" name="Dépenses flotte" fill={C.cyan} radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: C.slate, marginBottom: 12 }}>Répartition par type</p>
              {pieFlotte.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie data={pieFlotte} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={4} dataKey="value">
                        {pieFlotte.map((e, i) => <Cell key={i} fill={e.color} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => [fmt(v), '']} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                    {pieFlotte.map((d, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                          <span style={{ fontSize: 11, color: C.slate, textTransform: 'capitalize' }}>{d.name}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{fmt(d.value)}</span>
                          <span style={{ fontSize: 10, color: '#94a3b8', background: C.bg, borderRadius: 5, padding: '1px 5px' }}>
                            {pct(d.value, data?.depenses?.flotte || 0)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 20 }}>Aucune dépense flotte enregistrée</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Stats opérationnelles ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(155px,1fr))', gap: 10, marginBottom: 14 }}>
        <StatCard label="Clients actifs"    value={data?.clients?.active || 0}    sub={`sur ${data?.clients?.total_clients || 0} total`}               color={C.blue}
          icon={<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>} />
        <StatCard label="Projets actifs"    value={data?.projects?.active || 0}   sub={`sur ${data?.projects?.total || 0} total`}                      color={C.purple}
          icon={<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>} />
        <StatCard label="Employés actifs"   value={data?.employees?.active || 0}  sub={`Masse : ${fmt(data?.rh?.masse_salariale || 0)}/mois`}           color={C.amber}
          icon={<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>} />
        <StatCard label="Véhicules actifs"  value={data?.fleet?.active || 0}       sub={`sur ${data?.fleet?.total || 0} total`}                         color={C.cyan}
          icon={<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>} />
        <StatCard label="Articles stock"    value={data?.stock?.total || 0}         sub={`Val. coût : ${fmt(data?.stock?.total_value || 0)}`}             color={C.teal}
          icon={<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>} />
        <StatCard label="Stock critique"    value={data?.stock?.low_stock || 0}     sub={`${data?.stock?.out_of_stock || 0} en rupture totale`}            color={data?.stock?.low_stock ? C.red : C.green}
          icon={<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>} />
        <StatCard label="Factures en retard" value={data?.invoices?.overdue || 0}  sub="Paiements clients en attente"                                    color={data?.invoices?.overdue ? C.red : C.green}
          icon={<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>} />
        <StatCard label="Fournisseurs"      value={fmt(data?.depenses?.fournisseurs_total || 0)} sub={`${data?.external_invoices?.total || 0} factures`}  color={C.primary}
          icon={<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>} />
      </div>

      {/* ── Résultat net mensuel + Actions rapides ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
        <div className="db-card" style={{ background: '#fff', borderRadius: 16, border: `1px solid ${C.border}`, padding: 22, boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
          <p style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 4 }}>Résultat net mensuel</p>
          <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 16 }}>Revenus − Dépenses totales par mois</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={filteredChart} margin={{ top: 5, right: 10, left: 0, bottom: 0 }} barSize={24}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={fmtK} width={44} />
              <Tooltip content={<CTooltip />} />
              <ReferenceLine y={0} stroke={C.border} strokeWidth={2} />
              <Bar dataKey="resultat" name="Résultat net" radius={[5,5,0,0]}>
                {filteredChart.map((e, i) => <Cell key={i} fill={e.resultat >= 0 ? C.green : C.red} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Actions rapides */}
        <div className="db-card" style={{ background: '#fff', borderRadius: 16, border: `1px solid ${C.border}`, padding: 22, boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
          <p style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 16 }}>Actions rapides</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
            {[
              { label: 'Nouveau client',   href: '/dashboard/clients',   color: C.blue },
              { label: 'Nouvelle facture', href: '/dashboard/invoices',  color: C.green },
              { label: 'Nouveau projet',   href: '/dashboard/projects',  color: C.purple },
              { label: 'Nouvel employé',   href: '/dashboard/employees', color: C.amber },
              { label: 'Nouveau véhicule', href: '/dashboard/fleet',     color: C.cyan },
              { label: 'Nouvel article',   href: '/dashboard/stock',     color: C.teal },
            ].map((q, i) => (
              <a
                key={i} href={q.href}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 10,
                  background: q.color + '0e', border: `1.5px solid ${q.color}28`,
                  textDecoration: 'none', transition: 'all 0.15s',
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLAnchorElement
                  el.style.background = q.color + '18'
                  el.style.transform  = 'translateY(-1px)'
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLAnchorElement
                  el.style.background = q.color + '0e'
                  el.style.transform  = ''
                }}
              >
                <div style={{ width: 28, height: 28, borderRadius: 8, background: q.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="12" height="12" fill="none" stroke="#fff" strokeWidth="2.5" viewBox="0 0 24 24">
                    <line x1="12" y1="5" x2="12" y2="19"/>
                    <line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: q.color }}>{q.label}</span>
              </a>
            ))}
          </div>

          {/* Alertes condensées */}
          {alerts.length > 0 && (
            <div style={{ marginTop: 16, borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: C.slate, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Alertes</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {alerts.slice(0, 3).map((a, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px', background: a.level === 'error' ? '#fef2f2' : '#fffbeb', borderRadius: 8, fontSize: 11, color: a.level === 'error' ? '#991b1b' : '#92400e' }}>
                    <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                      <line x1="12" y1="9" x2="12" y2="13"/>
                      <line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    {a.msg}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
