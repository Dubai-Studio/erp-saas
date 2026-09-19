'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, LineChart, Line,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import Link from 'next/link'
import { formatMoney, formatPct, formatDate } from '@/lib/format'

interface KPIs { /* même forme que DashboardKPIs de lib/types.ts */
  revenue: { total: number; pending: number; overdue: number; thisMonth: number; growthPct: number }
  expenses: { total: number; byCategory: Record<string, number>; thisMonth: number; growthPct: number }
  margin: { net: number; marginPct: number }
  clients: { total: number; active: number; new_this_month: number; churn_rate_pct: number }
  invoices: { total: number; paid: number; pending: number; overdue: number; avg_payment_days: number }
  projects: { total: number; active: number; budget_total: number; spent_total: number; margin_pct: number }
  employees: { total: number; active: number; payroll_month: number; payroll_annual: number }
  fleet: { total: number; active: number; total_km: number; cost_per_km: number; maintenance_due: number; insurance_due: number }
  stock: { total: number; low_stock: number; out_of_stock: number; total_value: number; total_sell_value: number; rotation_days: number }
  cashflow: { inflow: number; outflow: number; net: number; runway_months: number }
  top_clients: Array<{ id: string; name: string; revenue: number; invoice_count: number }>
  top_expenses: Array<{ category: string; amount: number }>
  alerts: Array<{ severity: 'info' | 'warning' | 'critical'; title: string; detail?: string; href?: string }>
  chart_revenue_vs_expenses: Array<{ month: string; year: number; key: string; revenus: number; depenses: number; marge: number }>
  chart_cashflow: Array<{ month: string; key: string; inflow: number; outflow: number; net: number }>
  chart_top_categories: Array<{ category: string; amount: number }>
  chart_clients_acquisition: Array<{ month: string; key: string; new: number; lost: number }>
  chart_invoice_aging: Array<{ bucket: string; amount: number; count: number }>
}

const PRIMARY = '#1e3a5f'
const SUCCESS = '#10b981'
const DANGER  = '#ef4444'
const WARNING = '#f59e0b'
const INFO    = '#06b6d4'
const PALETTE = [PRIMARY, INFO, SUCCESS, WARNING, DANGER, '#8b5cf6', '#ec4899', '#14b8a6']

const PERIODS = [
  { id: '3m', label: '3 mois' },
  { id: '6m', label: '6 mois' },
  { id: 'ytd', label: 'Depuis janvier' },
  { id: '12m', label: '12 mois' },
]

export default function DashboardPage () {
  const [period, setPeriod] = useState('12m')
  const [kpi, setKpi] = useState<KPIs | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())

  // Realtime : reconnect automatique via SSE/WS Supabase (réutilisé plus tard)
  // Pour l'instant polling toutes les 60s. Branchement Realtime en Phase 8.
  useEffect(() => {
    let mounted = true
    let timer: any

    async function fetchKpi () {
      try {
        const res = await fetch(`/api/dashboard?period=${period}`, { cache: 'no-store' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        if (mounted) {
          setKpi(json.data)
          setError(null)
          setLastUpdate(new Date())
        }
      } catch (e: any) {
        if (mounted) setError(e.message)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    fetchKpi()
    timer = setInterval(fetchKpi, 60_000)

    return () => { mounted = false; clearInterval(timer) }
  }, [period])

  const loadingSkeleton = (
    <div style={{ padding: 40, color: '#94a3b8' }}>Chargement du tableau de bord…</div>
  )

  if (loading && !kpi) return loadingSkeleton
  if (error)        return <div style={{ padding: 40, color: DANGER }}>Erreur : {error}</div>
  if (!kpi)         return loadingSkeleton

  return (
    <div style={{ padding: '20px 24px 40px', maxWidth: 1500, margin: '0 auto' }}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', margin: 0 }}>Tableau de bord</h1>
          <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>
            Dernière MAJ {lastUpdate.toLocaleTimeString('fr-BE')} · auto-refresh 60s
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {PERIODS.map(p => (
            <button key={p.id} onClick={() => setPeriod(p.id)} style={{
              padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              border: '1px solid ' + (period === p.id ? PRIMARY : '#e2e8f0'),
              background: period === p.id ? PRIMARY : '#fff',
              color: period === p.id ? '#fff' : '#475569',
              cursor: 'pointer',
            }}>{p.label}</button>
          ))}
        </div>
      </div>

      {/* ── Alertes ─────────────────────────────────────────────────────── */}
      {kpi.alerts.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10, marginBottom: 20 }}>
          {kpi.alerts.map((a, i) => {
            const color = a.severity === 'critical' ? DANGER : a.severity === 'warning' ? WARNING : INFO
            const inner = (
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderLeft: `4px solid ${color}`, borderRadius: 10, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{a.title}</div>
                  {a.detail && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{a.detail}</div>}
                </div>
                <span style={{ fontSize: 18 }}>{a.severity === 'critical' ? '⚠️' : a.severity === 'warning' ? '⚡' : 'ℹ️'}</span>
              </div>
            )
            return a.href ? <Link key={i} href={a.href} style={{ textDecoration: 'none' }}>{inner}</Link> : <div key={i}>{inner}</div>
          })}
        </div>
      )}

      {/* ── KPI row 1 : Finances ───────────────────────────────────────── */}
      <KpiRow>
        <KpiCard label="Revenu total" value={formatMoney(kpi.revenue.total)} sub={`${kpi.revenue.growthPct >= 0 ? '↗' : '↘'} ${Math.abs(kpi.revenue.growthPct).toFixed(1)}% vs période précédente`} subColor={kpi.revenue.growthPct >= 0 ? SUCCESS : DANGER} accent={PRIMARY} />
        <KpiCard label="En attente" value={formatMoney(kpi.revenue.pending)} sub={`${kpi.invoices.pending} facture(s)`} accent={INFO} />
        <KpiCard label="En retard" value={formatMoney(kpi.revenue.overdue)} sub={`${kpi.invoices.overdue} facture(s)`} accent={DANGER} />
        <KpiCard label="Marge nette" value={formatMoney(kpi.margin.net)} sub={`Marge ${formatPct(kpi.margin.marginPct)}`} subColor={kpi.margin.marginPct >= 20 ? SUCCESS : kpi.margin.marginPct >= 10 ? WARNING : DANGER} accent={kpi.margin.net >= 0 ? SUCCESS : DANGER} />
      </KpiRow>

      {/* ── KPI row 2 : Opérationnel ───────────────────────────────────── */}
      <KpiRow>
        <KpiCard label="Clients actifs" value={`${kpi.clients.active} / ${kpi.clients.total}`} sub={`+${kpi.clients.new_this_month} ce mois · churn ${formatPct(kpi.clients.churn_rate_pct)}`} accent={PRIMARY} />
        <KpiCard label="Projets en cours" value={`${kpi.projects.active}`} sub={`Budget ${formatMoney(kpi.projects.budget_total)} · marge ${formatPct(kpi.projects.margin_pct)}`} accent={INFO} />
        <KpiCard label="Masse salariale / mois" value={formatMoney(kpi.employees.payroll_month)} sub={`${kpi.employees.active} actif(s) · annuel ${formatMoney(kpi.employees.payroll_annual)}`} accent={WARNING} />
        <KpiCard label="Délai paiement moyen" value={`${kpi.invoices.avg_payment_days} j`} sub={`${kpi.invoices.paid} facture(s) payée(s)`} accent={PRIMARY} />
      </KpiRow>

      {/* ── KPI row 3 : Stock + Flotte + Cashflow ──────────────────────── */}
      <KpiRow>
        <KpiCard label="Valeur stock (achat)" value={formatMoney(kpi.stock.total_value)} sub={`${kpi.stock.total} articles · ${kpi.stock.low_stock} en alerte · ${kpi.stock.out_of_stock} en rupture`} accent={PRIMARY} />
        <KpiCard label="Coût / km flotte" value={formatMoney(kpi.fleet.cost_per_km)} sub={`${kpi.fleet.total_km.toLocaleString('fr-BE')} km cumulés`} accent={INFO} />
        <KpiCard label="Runway" value={`${kpi.cashflow.runway_months} mois`} sub={`Inflow ${formatMoney(kpi.cashflow.inflow)} · Outflow ${formatMoney(kpi.cashflow.outflow)}`} accent={kpi.cashflow.runway_months >= 6 ? SUCCESS : kpi.cashflow.runway_months >= 3 ? WARNING : DANGER} />
        <KpiCard label="Maintenance / Assurance" value={`${kpi.fleet.maintenance_due + kpi.fleet.insurance_due}`} sub={`CT ${kpi.fleet.maintenance_due} · Assur ${kpi.fleet.insurance_due}`} accent={WARNING} />
      </KpiRow>

      {/* ── Charts row 1 : Revenus vs dépenses + Cashflow ──────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginTop: 16 }}>
        <ChartCard title="Revenus vs Dépenses" subtitle="Évolution mensuelle (HT)">
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={kpi.chart_revenue_vs_expenses}>
              <defs>
                <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={SUCCESS} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={SUCCESS} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gDep" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={DANGER} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={DANGER} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: any) => formatMoney(Number(v))} />
              <Legend />
              <Area name="Revenus"  type="monotone" dataKey="revenus"  stroke={SUCCESS} fill="url(#gRev)" strokeWidth={2} />
              <Area name="Dépenses" type="monotone" dataKey="depenses" stroke={DANGER} fill="url(#gDep)" strokeWidth={2} />
              <Line name="Marge" type="monotone" dataKey="marge" stroke={PRIMARY} strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Top dépenses par catégorie">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={kpi.chart_top_categories} dataKey="amount" nameKey="category" innerRadius={50} outerRadius={90} paddingAngle={2}>
                {kpi.chart_top_categories.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Pie>
              <Tooltip formatter={(v: any) => formatMoney(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ── Charts row 2 : Acquisition + Aging + Top clients ───────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginTop: 16 }}>
        <ChartCard title="Acquisition clients">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={kpi.chart_clients_acquisition}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} allowDecimals={false} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar name="Nouveaux" dataKey="new" fill={SUCCESS} radius={[4, 4, 0, 0]} />
              <Bar name="Perdus"   dataKey="lost" fill={DANGER} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Aging des factures">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={kpi.chart_invoice_aging} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" stroke="#94a3b8" fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="bucket" stroke="#94a3b8" fontSize={11} />
              <Tooltip formatter={(v: any) => formatMoney(Number(v))} />
              <Bar name="Montant" dataKey="amount" fill={WARNING} radius={[0, 4, 4, 0]}>
                {kpi.chart_invoice_aging.map((entry, i) => (
                  <Cell key={i} fill={entry.bucket === '90j+' ? DANGER : entry.bucket === '61-90j' ? WARNING : INFO} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Cashflow mensuel">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={kpi.chart_cashflow}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: any) => formatMoney(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line name="Entrées" type="monotone" dataKey="inflow"  stroke={SUCCESS} strokeWidth={2} />
              <Line name="Sorties" type="monotone" dataKey="outflow" stroke={DANGER}  strokeWidth={2} />
              <Line name="Net"     type="monotone" dataKey="net"     stroke={PRIMARY} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ── Top clients + Top expenses ─────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
        <ChartCard title="Top clients (CA payé)">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ textAlign: 'left',  padding: '8px 6px', color: '#64748b', fontSize: 11, textTransform: 'uppercase' }}>Client</th>
                <th style={{ textAlign: 'right', padding: '8px 6px', color: '#64748b', fontSize: 11, textTransform: 'uppercase' }}>Factures</th>
                <th style={{ textAlign: 'right', padding: '8px 6px', color: '#64748b', fontSize: 11, textTransform: 'uppercase' }}>CA</th>
              </tr>
            </thead>
            <tbody>
              {kpi.top_clients.length === 0 && <tr><td colSpan={3} style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>Aucun client facturé</td></tr>}
              {kpi.top_clients.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 6px' }}><Link href={`/dashboard/clients`} style={{ color: PRIMARY, textDecoration: 'none' }}>{c.name}</Link></td>
                  <td style={{ padding: '10px 6px', textAlign: 'right', color: '#475569' }}>{c.invoice_count}</td>
                  <td style={{ padding: '10px 6px', textAlign: 'right', fontWeight: 600 }}>{formatMoney(c.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ChartCard>

        <ChartCard title="Top postes de dépenses">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ textAlign: 'left',  padding: '8px 6px', color: '#64748b', fontSize: 11, textTransform: 'uppercase' }}>Catégorie</th>
                <th style={{ textAlign: 'right', padding: '8px 6px', color: '#64748b', fontSize: 11, textTransform: 'uppercase' }}>Montant</th>
                <th style={{ textAlign: 'right', padding: '8px 6px', color: '#64748b', fontSize: 11, textTransform: 'uppercase' }}>%</th>
              </tr>
            </thead>
            <tbody>
              {kpi.top_expenses.length === 0 && <tr><td colSpan={3} style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>Aucune dépense</td></tr>}
              {kpi.top_expenses.map(e => {
                const pct = kpi.expenses.total > 0 ? (e.amount / kpi.expenses.total) * 100 : 0
                return (
                  <tr key={e.category} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 6px' }}>{e.category}</td>
                    <td style={{ padding: '10px 6px', textAlign: 'right', fontWeight: 600 }}>{formatMoney(e.amount)}</td>
                    <td style={{ padding: '10px 6px', textAlign: 'right', color: '#64748b' }}>{pct.toFixed(1)}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </ChartCard>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────

function KpiRow ({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 12,
      marginBottom: 12,
    }}>{children}</div>
  )
}

function KpiCard ({ label, value, sub, subColor = '#64748b', accent = PRIMARY }: {
  label: string; value: string; sub?: string; subColor?: string; accent?: string
}) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
      padding: '14px 16px', borderLeft: `4px solid ${accent}`,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: subColor, marginTop: 6 }}>{sub}</div>}
    </div>
  )
}

function ChartCard ({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16,
    }}>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: '#94a3b8' }}>{subtitle}</div>}
      </div>
      {children}
    </div>
  )
}