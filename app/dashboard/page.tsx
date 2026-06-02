'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'

// ─── Types ────────────────────────────────────────────────────────────────────
interface ChartPoint {
  month: string
  year: number
  revenus: number
  depenses: number
  resultat: number
}

interface DashboardData {
  clients:   { total: number; active: number }
  invoices:  { total: number; paid: number; pending: number; overdue: number }
  revenue:   { total: number; pending: number }
  depenses:  {
    fournisseurs_total: number
    fournisseurs_paid: number
    fournisseurs_pending: number
    flotte: number
    total: number
    by_category: Record<string, number>
  }
  projects:  { total: number; active: number }
  employees: { total: number; active: number }
  stock:     { total: number; low_stock: number; total_value: number }
  rh: {
    masse_salariale: number
    masse_annuelle: number
    adj_this_month: number
    total_personnel: number
  }
  resultat_net:      number
  chart_data:        ChartPoint[]
  external_invoices: { total: number; paid: number }
}

// ─── Design system ───────────────────────────────────────────────────────────
const C = {
  primary: '#1e3a5f',
  blue:    '#2563eb',
  green:   '#10b981',
  amber:   '#f59e0b',
  red:     '#ef4444',
  purple:  '#8b5cf6',
  cyan:    '#06b6d4',
  slate:   '#64748b',
  border:  '#e2e8f0',
  bg:      '#f8fafc',
  text:    '#0f172a',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0)

const fmtK = (v: number) => {
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(0)}k`
  return String(Math.round(v))
}

// ─── Composants UI ───────────────────────────────────────────────────────────
function Card({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 14,
      boxShadow: '0 1px 3px rgba(0,0,0,0.05),0 4px 12px rgba(0,0,0,0.04)',
      border: `1px solid ${C.border}`, ...style,
    }}>
      {children}
    </div>
  )
}

function KpiCard({
  label, value, sub, color, icon, trend, alert,
}: {
  label: string; value: string; sub?: string; color: string
  icon: React.ReactNode; trend?: number; alert?: boolean
}) {
  return (
    <div style={{
      background: '#fff', borderRadius: 14,
      border: `1.5px solid ${alert ? '#fecaca' : color + '30'}`,
      boxShadow: alert ? '0 2px 8px rgba(239,68,68,0.10)' : `0 2px 8px ${color}10`,
      padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: C.slate, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          {label}
        </p>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: (alert ? '#fef2f2' : color + '15'),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: alert ? '#ef4444' : color, flexShrink: 0,
        }}>
          {icon}
        </div>
      </div>
      <div>
        <p style={{ fontSize: 22, fontWeight: 800, color: alert ? '#ef4444' : C.text, lineHeight: 1 }}>{value}</p>
        {sub && <p style={{ fontSize: 11, color: C.slate, marginTop: 4 }}>{sub}</p>}
      </div>
      {trend !== undefined && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '3px 8px', borderRadius: 20,
          background: trend >= 0 ? '#dcfce7' : '#fee2e2',
          color: trend >= 0 ? '#16a34a' : '#dc2626',
          fontSize: 11, fontWeight: 700, width: 'fit-content',
        }}>
          <svg width="9" height="9" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            {trend >= 0
              ? <polyline points="18 15 12 9 6 15"/>
              : <polyline points="6 9 12 15 18 9"/>
            }
          </svg>
          {Math.abs(trend).toFixed(1)} %
        </div>
      )}
    </div>
  )
}

function MiniKpi({ label, value, sub, color, icon }: {
  label: string; value: number | string; sub: string; color: string; icon: React.ReactNode
}) {
  return (
    <div style={{
      background: '#fff', borderRadius: 12,
      border: `1.5px solid ${color}25`,
      padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
        background: color + '14',
        display: 'flex', alignItems: 'center', justifyContent: 'center', color,
      }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 19, fontWeight: 800, color: C.text, lineHeight: 1 }}>{value}</p>
        <p style={{ fontSize: 11, fontWeight: 600, color: C.slate, marginTop: 3 }}>{label}</p>
        <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</p>
      </div>
    </div>
  )
}

// Tooltip Recharts personnalisé
function ChartTooltip({ active, payload, label }: {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12,
      padding: '10px 14px', boxShadow: '0 8px 24px rgba(0,0,0,0.10)', fontSize: 12,
    }}>
      <p style={{ fontWeight: 700, color: C.text, marginBottom: 6 }}>{label}</p>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
          <span style={{ color: C.slate }}>{p.name} :</span>
          <span style={{ fontWeight: 700, color: C.text, marginLeft: 'auto' }}>{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

// ─── PAGE PRINCIPALE ──────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [data,    setData]    = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [period,  setPeriod]  = useState<'month' | 'quarter' | 'year'>('year')
  const [updated, setUpdated] = useState(new Date())

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/dashboard')
      if (r.ok) {
        const text = await r.text()
        if (text) setData(JSON.parse(text))
      }
      setUpdated(new Date())
    } catch (e) {
      console.error('Dashboard load error:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 60000)
    return () => clearInterval(t)
  }, [load])

  // ── Filtrage des données graphique selon la période ──
  const chartData = data?.chart_data ?? []
  const periodCount = period === 'month' ? 1 : period === 'quarter' ? 3 : 12
  const filteredChart = chartData.slice(-periodCount)

  // ── Calculs de la période sélectionnée ──
  const periodRevenue  = filteredChart.reduce((s, d) => s + d.revenus, 0)
  const periodDepenses = filteredChart.reduce((s, d) => s + d.depenses, 0)
  const periodResultat = periodRevenue - periodDepenses

  // ── Données pie dépenses ──
  const COLORS_CAT = ['#2563eb','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#84cc16','#f97316']
  const pieDepenses = data?.depenses?.by_category
    ? Object.entries(data.depenses.by_category)
        .filter(([, v]) => v > 0)
        .map(([name, value], i) => ({ name, value, color: COLORS_CAT[i % COLORS_CAT.length] }))
        .sort((a, b) => b.value - a.value)
    : []

  // Ajouter flotte et salaires aux dépenses
  const pieDepensesFull = [
    ...pieDepenses,
    ...(data?.depenses?.flotte ? [{ name: 'Flotte', value: data.depenses.flotte, color: '#06b6d4' }] : []),
    ...(data?.rh?.masse_salariale ? [{ name: 'Masse salariale', value: data.rh.masse_salariale, color: '#8b5cf6' }] : []),
  ].filter(d => d.value > 0)

  const totalPieDep = pieDepensesFull.reduce((s, d) => s + d.value, 0)

  const PERIOD_LABELS = { month: 'Ce mois', quarter: 'Ce trimestre', year: 'Cette année' }
  const alerts: string[] = []
  if ((data?.invoices?.overdue || 0) > 0)
    alerts.push(`${data!.invoices.overdue} facture(s) client(s) en retard de paiement`)
  if ((data?.stock?.low_stock || 0) > 0)
    alerts.push(`${data!.stock.low_stock} article(s) en rupture ou stock critique`)
  if ((data?.depenses?.fournisseurs_pending || 0) > 0)
    alerts.push(`${fmt(data!.depenses.fournisseurs_pending)} de factures fournisseurs en attente`)

  const QUICK = [
    { label: 'Nouveau client',   href: '/dashboard/clients',   color: C.blue },
    { label: 'Nouvelle facture', href: '/dashboard/invoices',  color: C.green },
    { label: 'Nouveau projet',   href: '/dashboard/projects',  color: C.purple },
    { label: 'Nouvel employé',   href: '/dashboard/employees', color: C.amber },
    { label: 'Nouveau véhicule', href: '/dashboard/fleet',     color: C.cyan },
    { label: 'Nouvel article',   href: '/dashboard/stock',     color: '#16a34a' },
  ]

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 400 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 36, height: 36, border: `3px solid ${C.blue}`,
          borderTopColor: 'transparent', borderRadius: '50%',
          animation: 'spin 0.8s linear infinite', margin: '0 auto 12px',
        }} />
        <p style={{ color: '#94a3b8', fontSize: 13 }}>Chargement du tableau de bord…</p>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div style={{ padding: 24, maxWidth: 1600, margin: '0 auto' }}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        .quick-link:hover { transform:translateY(-1px); }
        .quick-link { transition:all 0.15s; }
      `}</style>

      {/* ── En-tête ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: `linear-gradient(135deg,${C.primary},${C.blue})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
          </div>
          <div>
            <h1 style={{ fontSize: 21, fontWeight: 800, color: C.text }}>Tableau de bord</h1>
            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
              {PERIOD_LABELS[period]} · Mis à jour : {updated.toLocaleTimeString('fr-BE')}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', background: C.bg, border: `1.5px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
            {(['month', 'quarter', 'year'] as const).map((p, i) => (
              <button key={p} onClick={() => setPeriod(p)} style={{
                padding: '7px 16px', border: 'none',
                borderRight: i < 2 ? `1px solid ${C.border}` : 'none',
                background: period === p ? C.blue : 'transparent',
                color: period === p ? '#fff' : C.slate,
                fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
              }}>
                {['Mois', 'Trimestre', 'Année'][i]}
              </button>
            ))}
          </div>
          <button onClick={load} title="Actualiser" style={{
            padding: 8, background: '#fff', border: `1.5px solid ${C.border}`, borderRadius: 10,
            cursor: 'pointer', color: C.slate, display: 'flex', alignItems: 'center',
          }}>
            <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── KPIs financiers principaux ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 14, marginBottom: 14 }}>
        <KpiCard
          label="Chiffre d'affaires encaissé"
          value={fmt(periodRevenue)}
          sub={`Revenus payés · ${PERIOD_LABELS[period].toLowerCase()}`}
          color={C.green}
          icon={<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>}
        />
        <KpiCard
          label="Dépenses totales"
          value={fmt(periodDepenses)}
          sub={`Fournisseurs + flotte · ${PERIOD_LABELS[period].toLowerCase()}`}
          color={C.red}
          icon={<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>}
        />
        <KpiCard
          label="Résultat net"
          value={fmt(periodResultat)}
          sub={`Revenus − Dépenses · ${PERIOD_LABELS[period].toLowerCase()}`}
          color={periodResultat >= 0 ? C.green : C.red}
          alert={periodResultat < 0}
          icon={<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>}
        />
        <KpiCard
          label="En attente d'encaissement"
          value={fmt(data?.revenue.pending || 0)}
          sub={`${data?.invoices.pending || 0} facture(s) non réglée(s)`}
          color={C.amber}
          icon={<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
        />
      </div>

      {/* ── Alertes financières ── */}
      {alerts.length > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          {alerts.map((a, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 9,
              padding: '10px 14px', background: '#fffbeb',
              border: '1.5px solid #fde68a', borderRadius: 10, fontSize: 12, color: '#92400e', fontWeight: 500,
            }}>
              <svg width="14" height="14" fill="none" stroke="#d97706" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              {a}
            </div>
          ))}
        </div>
      )}

      {/* ── Graphique principal Revenus vs Dépenses ── */}
      <Card style={{ padding: 22, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <p style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Revenus vs Dépenses</p>
            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
              {period === 'month' ? 'Mois en cours' : period === 'quarter' ? '3 derniers mois' : '12 derniers mois'} · Comparaison encaissements / charges
            </p>
          </div>
          <div style={{ display: 'flex', gap: 16, fontSize: 11 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 12, height: 3, background: C.green, borderRadius: 2, display: 'inline-block' }} />
              <span style={{ color: C.slate }}>Revenus encaissés</span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 12, height: 3, background: C.red, borderRadius: 2, display: 'inline-block' }} />
              <span style={{ color: C.slate }}>Dépenses</span>
            </span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={filteredChart} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="grRev" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={C.green} stopOpacity={0.18}/>
                <stop offset="95%" stopColor={C.green} stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="grDep" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={C.red} stopOpacity={0.12}/>
                <stop offset="95%" stopColor={C.red} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={fmtK} width={42} />
            <Tooltip content={<ChartTooltip />} />
            <Area type="monotone" dataKey="revenus"  name="Revenus"  stroke={C.green} fill="url(#grRev)" strokeWidth={2.5} dot={false} />
            <Area type="monotone" dataKey="depenses" name="Dépenses" stroke={C.red}   fill="url(#grDep)" strokeWidth={2} dot={false} strokeDasharray="0" />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      {/* ── 2 graphiques côte à côte ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>

        {/* Résultat net mensuel */}
        <Card style={{ padding: 22 }}>
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Résultat net mensuel</p>
            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Revenus − Dépenses par mois</p>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={filteredChart} margin={{ top: 5, right: 10, left: 0, bottom: 0 }} barSize={22}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={fmtK} width={42} />
              <Tooltip content={<ChartTooltip />} />
              <ReferenceLine y={0} stroke={C.border} strokeWidth={1.5} />
              <Bar
                dataKey="resultat"
                name="Résultat"
                radius={[5, 5, 0, 0]}
                fill={C.blue}
              >
                {filteredChart.map((entry, i) => (
                  <Cell key={i} fill={entry.resultat >= 0 ? C.green : C.red} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Répartition des dépenses */}
        <Card style={{ padding: 22, display: 'flex', flexDirection: 'column' }}>
          <div style={{ marginBottom: 14 }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Répartition des dépenses</p>
            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Par catégorie (cumul total)</p>
          </div>
          {pieDepensesFull.length > 0 ? (
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', flex: 1 }}>
              <ResponsiveContainer width="50%" height={160}>
                <PieChart>
                  <Pie
                    data={pieDepensesFull}
                    cx="50%" cy="50%"
                    innerRadius={42} outerRadius={66}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieDepensesFull.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => [fmt(v), '']} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ flex: 1, overflowY: 'auto', maxHeight: 160 }}>
                {pieDepensesFull.slice(0, 7).map((d, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0', borderBottom: i < pieDepensesFull.length - 1 ? `1px solid #f8fafc` : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: C.slate }}>{d.name}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{fmt(d.value)}</span>
                      <span style={{ fontSize: 9, color: '#94a3b8', background: C.bg, borderRadius: 5, padding: '1px 4px' }}>
                        {totalPieDep > 0 ? Math.round(d.value / totalPieDep * 100) : 0}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1' }}>
              <p style={{ fontSize: 12 }}>Aucune dépense enregistrée</p>
            </div>
          )}
        </Card>
      </div>

      {/* ── Mini KPIs opérationnels ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10, marginBottom: 16 }}>
        <MiniKpi
          label="Clients actifs" value={data?.clients.active || 0}
          sub={`sur ${data?.clients.total || 0} total`} color={C.blue}
          icon={<svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>}
        />
        <MiniKpi
          label="Projets actifs" value={data?.projects.active || 0}
          sub={`sur ${data?.projects.total || 0} total`} color={C.purple}
          icon={<svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>}
        />
        <MiniKpi
          label="Employés actifs" value={data?.employees.active || 0}
          sub={`Masse sal. : ${fmt(data?.rh?.masse_salariale || 0)}`} color={C.amber}
          icon={<svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>}
        />
        <MiniKpi
          label="Stock critique" value={data?.stock.low_stock || 0}
          sub={`${data?.stock.total || 0} articles — val. ${fmt(data?.stock.total_value || 0)}`} color={data?.stock.low_stock ? C.red : C.green}
          icon={<svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>}
        />
        <MiniKpi
          label="Factures en retard" value={data?.invoices.overdue || 0}
          sub="Paiements clients en attente" color={data?.invoices.overdue ? C.red : C.green}
          icon={<svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>}
        />
        <MiniKpi
          label="Factures fournisseurs" value={fmt(data?.depenses?.fournisseurs_total || 0)}
          sub={`${data?.external_invoices?.total || 0} factures — ${data?.depenses?.fournisseurs_pending ? fmt(data.depenses.fournisseurs_pending) + ' en attente' : 'tout payé'}`}
          color={C.primary}
          icon={<svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="12 18 12 12"/><polyline points="9 15 12 18 15 15"/></svg>}
        />
      </div>

      {/* ── Revenus par mois (barchart) + Actions rapides ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginBottom: 14 }}>

        {/* Revenus encaissés par mois */}
        <Card style={{ padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <p style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Revenus encaissés par mois</p>
              <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Chiffre d&apos;affaires mensuel (factures payées)</p>
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.green }}>{fmt(periodRevenue)}</div>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={filteredChart} margin={{ top: 5, right: 10, left: 0, bottom: 0 }} barSize={24}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={fmtK} width={42} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="revenus" name="Revenus" fill={C.blue} radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Récap financier */}
        <Card style={{ padding: 22 }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 16 }}>Récapitulatif financier</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { l: 'Revenus encaissés',        v: data?.revenue.total || 0,              c: C.green },
              { l: 'En attente encaissement',  v: data?.revenue.pending || 0,            c: C.amber },
              { l: 'Dépenses fournisseurs',    v: data?.depenses?.fournisseurs_total || 0, c: C.red },
              { l: 'Dépenses flotte',          v: data?.depenses?.flotte || 0,           c: '#f97316' },
              { l: 'Masse salariale / mois',   v: data?.rh?.masse_salariale || 0,        c: C.purple },
            ].map((row, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: row.c, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: C.slate }}>{row.l}</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: row.c }}>{fmt(row.v)}</span>
              </div>
            ))}
            <div style={{ borderTop: `1.5px solid ${C.border}`, paddingTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Résultat net</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: (data?.resultat_net || 0) >= 0 ? C.green : C.red }}>
                {fmt(data?.resultat_net || 0)}
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* ── Alertes + Actions rapides ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

        {/* Alertes */}
        <Card style={{ padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
            <svg width="16" height="16" fill="none" stroke={C.amber} strokeWidth="2" viewBox="0 0 24 24">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <p style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Alertes &amp; Notifications</p>
          </div>
          {alerts.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, background: '#f0fdf4', borderRadius: 12, border: '1.5px solid #bbf7d0' }}>
              <div style={{ width: 36, height: 36, background: '#dcfce7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a', flexShrink: 0 }}>
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#15803d' }}>Tout est en ordre</p>
                <p style={{ fontSize: 11, color: '#4ade80', marginTop: 2 }}>Aucune alerte pour le moment</p>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {alerts.map((a, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: '#fffbeb', borderRadius: 10, border: '1.5px solid #fde68a' }}>
                  <div style={{ width: 30, height: 30, background: '#fef3c7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d97706', flexShrink: 0 }}>
                    <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                  </div>
                  <p style={{ fontSize: 12, color: '#92400e', lineHeight: 1.5 }}>{a}</p>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Actions rapides */}
        <Card style={{ padding: 22 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 14 }}>Actions rapides</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
            {QUICK.map((q, i) => (
              <a key={i} href={q.href} className="quick-link" style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 10,
                background: q.color + '0e',
                border: `1.5px solid ${q.color}28`,
                textDecoration: 'none',
              }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: q.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="13" height="13" fill="none" stroke="#fff" strokeWidth="2.5" viewBox="0 0 24 24">
                    <line x1="12" y1="5" x2="12" y2="19"/>
                    <line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: q.color }}>{q.label}</span>
              </a>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
