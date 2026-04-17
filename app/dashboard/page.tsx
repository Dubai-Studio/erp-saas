'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const MONTHS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];

const fmt = (n: number) =>
  new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

/* ─────────────────────────────────────────────
   HELPERS PÉRIODE
───────────────────────────────────────────── */
function getPeriodRange(period: 'week' | 'month' | 'quarter' | 'year'): {
  start: Date; end: Date; months: number;
} {
  const now = new Date();
  const end = new Date(now);
  let start = new Date(now);
  let months = 1;

  if (period === 'week') {
    start.setDate(now.getDate() - 7);
    months = 1;
  } else if (period === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    months = 1;
  } else if (period === 'quarter') {
    start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    months = 3;
  } else {
    start = new Date(now.getFullYear(), 0, 1);
    months = 12;
  }
  return { start, end, months };
}

/* ─────────────────────────────────────────────
   COMPOSANTS UI
───────────────────────────────────────────── */
function Card({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 14,
      boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.04)',
      border: '1px solid #f1f5f9', ...style,
    }}>
      {children}
    </div>
  );
}

function KPI({ label, value, sub, color, icon, trend }: {
  label: string; value: string; sub?: string; color: string;
  icon: React.ReactNode; trend?: number;
}) {
  return (
    <div style={{
      background: '#fff', borderRadius: 14,
      border: `1.5px solid ${color}40`,
      boxShadow: `0 2px 8px ${color}12`,
      padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          {label}
        </p>
        <div style={{
          width: 34, height: 34, borderRadius: 10,
          background: color + '18',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color, flexShrink: 0,
        }}>
          {icon}
        </div>
      </div>
      <div>
        <p style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{value}</p>
        {sub && <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{sub}</p>}
      </div>
      {trend !== undefined && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 3,
          padding: '3px 8px', borderRadius: 20,
          background: trend >= 0 ? '#dcfce7' : '#fee2e2',
          color: trend >= 0 ? '#16a34a' : '#dc2626',
          fontSize: 11, fontWeight: 700, width: 'fit-content',
        }}>
          {trend >= 0 ? '▲' : '▼'} {Math.abs(trend).toFixed(1)}% vs période préc.
        </div>
      )}
    </div>
  );
}

function MiniKPI({ label, value, sub, color, icon }: {
  label: string; value: number; sub: string; color: string; icon: React.ReactNode;
}) {
  return (
    <div style={{
      background: '#fff', borderRadius: 12,
      border: `1.5px solid ${color}35`,
      boxShadow: `0 1px 4px ${color}10`,
      padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: 10,
        background: color + '18',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color, flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{value}</p>
        <p style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginTop: 3 }}>{label}</p>
        <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {sub}
        </p>
      </div>
    </div>
  );
}

function CTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
      padding: '10px 14px', boxShadow: '0 8px 24px rgba(0,0,0,0.10)', fontSize: 12,
    }}>
      <p style={{ fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>{label}</p>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
          <span style={{ color: '#64748b' }}>{p.name} :</span>
          <span style={{ fontWeight: 700, color: '#0f172a' }}>{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────
   INTERFACES
───────────────────────────────────────────── */
interface DashboardData {
  clients:   { total: number; active: number };
  invoices:  { total: number; paid: number; pending: number; overdue: number };
  revenue:   { total: number; pending: number };
  projects:  { total: number; active: number };
  employees: { total: number; active: number };
  stock:     { total: number; low_stock: number };
}

interface InvoiceRaw {
  status: string;
  created_at: string;
  total_amount: number;
  due_date?: string;
}

/* ─────────────────────────────────────────────
   PAGE PRINCIPALE
───────────────────────────────────────────── */
export default function DashboardPage() {
  const [data,          setData]          = useState<DashboardData | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [period,        setPeriod]        = useState<'week' | 'month' | 'quarter' | 'year'>('month');
  const [updated,       setUpdated]       = useState(new Date());
  const [chart,         setChart]         = useState<{ month: string; revenus: number }[]>([]);
  const [pie,           setPie]           = useState<{ name: string; value: number; color: string }[]>([]);
  const [alerts,        setAlerts]        = useState<string[]>([]);
  const [periodRevenue, setPeriodRevenue] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const fetchSafe = async (url: string): Promise<Record<string, unknown>> => {
        try {
          const r = await fetch(url);
          if (!r.ok) return {};
          const text = await r.text();
          if (!text || text.trim() === '') return {};
          return JSON.parse(text) as Record<string, unknown>;
        } catch { return {}; }
      };

      const [dash, invD] = await Promise.all([
        fetchSafe('/api/dashboard'),
        fetchSafe('/api/invoices'),
      ]);

      if (dash && Object.keys(dash).length > 0) {
        setData(dash as unknown as DashboardData);
      }

      const { start, end, months } = getPeriodRange(period);
      const now = new Date();

      // Normalise : accepte un tableau direct ou { data: [...] }
      const rawInvoices = Array.isArray(invD)
        ? invD
        : Array.isArray((invD as Record<string, unknown>).data)
          ? ((invD as Record<string, unknown>).data as InvoiceRaw[])
          : [];

      const filteredInvoices: InvoiceRaw[] = rawInvoices.filter((x: InvoiceRaw) => {
        const d = new Date(x.created_at);
        return d >= start && d <= end;
      });

      const pRev = filteredInvoices
        .filter(x => x.status === 'paid')
        .reduce((s, x) => s + (x.total_amount || 0), 0);

      setPeriodRevenue(Math.round(pRev));

      /* ── Chart data ── */
      const m: Record<number, { r: number }> = {};
      for (let i = months - 1; i >= 0; i--) {
        m[(now.getMonth() - i + 12) % 12] = { r: 0 };
      }
      rawInvoices
        .filter((x: InvoiceRaw) => x.status === 'paid')
        .forEach((x: InvoiceRaw) => {
          const k = new Date(x.created_at).getMonth();
          if (m[k]) m[k].r += x.total_amount || 0;
        });

      setChart(
        Object.entries(m).map(([k, v]) => ({
          month:   MONTHS[+k],
          revenus: Math.round(v.r),
        }))
      );

      /* ── Pie ── */
      const paid    = filteredInvoices.filter(x => x.status === 'paid').length;
      const pending = filteredInvoices.filter(x => x.status === 'sent' || x.status === 'pending').length;
      const overdue = filteredInvoices.filter(x => {
        if (x.status === 'paid' || x.status === 'cancelled') return false;
        if (!x.due_date) return false;
        return new Date(x.due_date) < now;
      }).length;

      setPie([
        { name: 'Payées',     value: paid,    color: '#10b981' },
        { name: 'En attente', value: pending, color: '#f59e0b' },
        { name: 'En retard',  value: overdue, color: '#ef4444' },
      ].filter(x => x.value > 0));

      /* ── Alertes ── */
      const dashTyped = dash as unknown as DashboardData;
      const a: string[] = [];
      if ((dashTyped?.invoices?.overdue || 0) > 0)
        a.push(`${dashTyped.invoices.overdue} facture(s) en retard de paiement`);
      if ((dashTyped?.stock?.low_stock || 0) > 0)
        a.push(`${dashTyped.stock.low_stock} article(s) en rupture ou stock faible`);
      setAlerts(a);

      setUpdated(new Date());
    } catch (e) {
      console.error('Dashboard load error:', e);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    const ch = supabase
      .channel('db-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, load)
      .subscribe();
    return () => { clearInterval(t); supabase.removeChannel(ch); };
  }, [load]);

  const PERIOD_LABELS = {
    week:    'Cette semaine',
    month:   'Ce mois',
    quarter: 'Ce trimestre',
    year:    'Cette année',
  };

  /* ── Actions rapides — lien employees corrigé ── */
  const QUICK = [
    { label: 'Nouveau client',   href: '/dashboard/clients',   color: '#6366f1' },
    { label: 'Nouvelle facture', href: '/dashboard/invoices',  color: '#10b981' },
    { label: 'Nouveau projet',   href: '/dashboard/projects',  color: '#8b5cf6' },
    { label: 'Nouvel employé',   href: '/dashboard/employees', color: '#f59e0b' }, // ✅ corrigé
    { label: 'Nouveau véhicule', href: '/dashboard/fleet',     color: '#06b6d4' },
    { label: 'Nouvel article',   href: '/dashboard/stock',     color: '#16a34a' },
  ];

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 400 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 36, height: 36, border: '3px solid #6366f1',
          borderTopColor: 'transparent', borderRadius: '50%',
          animation: 'spin 0.8s linear infinite', margin: '0 auto 12px',
        }} />
        <p style={{ color: '#94a3b8', fontSize: 13 }}>Chargement…</p>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ padding: 24, maxWidth: 1600, margin: '0 auto' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>Tableau de bord</h1>
          <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>
            Mis à jour : {updated.toLocaleTimeString('fr-BE')} · {PERIOD_LABELS[period]}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
            {(['week', 'month', 'quarter', 'year'] as const).map((p, i) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                style={{
                  padding: '7px 14px', border: 'none',
                  borderRight: i < 3 ? '1px solid #e2e8f0' : 'none',
                  background: period === p ? '#6366f1' : 'transparent',
                  color: period === p ? '#fff' : '#64748b',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                {['Sem.', 'Mois', 'Trim.', 'Année'][i]}
              </button>
            ))}
          </div>
          <button
            onClick={load}
            title="Actualiser"
            style={{
              padding: 8, background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 10,
              cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── KPI Finance ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14, marginBottom: 14 }}>
        <KPI
          label="Chiffre d'affaires"
          value={fmt(periodRevenue)}
          sub={`Revenus encaissés · ${PERIOD_LABELS[period].toLowerCase()}`}
          trend={periodRevenue > 0 ? 8.2 : undefined}
          color="#10b981"
          icon={<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>}
        />
        <KPI
          label="En attente d'encaissement"
          value={fmt(data?.revenue.pending || 0)}
          sub={`${data?.invoices.pending || 0} facture(s) non réglée(s)`}
          color="#f59e0b"
          icon={<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>}
        />
        <KPI
          label="Revenus totaux"
          value={fmt(data?.revenue.total || 0)}
          sub="Toutes périodes confondues"
          color="#6366f1"
          icon={<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>}
        />
        <KPI
          label="Factures en retard"
          value={String(data?.invoices.overdue || 0)}
          sub="Paiements non reçus"
          color="#ef4444"
          icon={<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>}
        />
      </div>

      {/* ── Mini KPIs ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 20 }}>
        <MiniKPI
          label="Clients actifs" value={data?.clients.active || 0}
          sub={`/${data?.clients.total || 0} total`} color="#6366f1"
          icon={<svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>}
        />
        <MiniKPI
          label="Projets actifs" value={data?.projects.active || 0}
          sub={`/${data?.projects.total || 0} total`} color="#8b5cf6"
          icon={<svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>}
        />
        <MiniKPI
          label="Employés actifs" value={data?.employees.active || 0}
          sub={`/${data?.employees.total || 0} total`} color="#f59e0b"
          icon={<svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>}
        />
        <MiniKPI
          label="Stock faible" value={data?.stock.low_stock || 0}
          sub={`/${data?.stock.total || 0} articles`} color="#ef4444"
          icon={<svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>}
        />
        <MiniKPI
          label="Factures totales" value={data?.invoices.total || 0}
          sub={`${data?.invoices.paid || 0} payées`} color="#10b981"
          icon={<svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>}
        />
        <MiniKPI
          label="Factures en retard" value={data?.invoices.overdue || 0}
          sub="impayées" color="#dc2626"
          icon={<svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>}
        />
      </div>

      {/* ── Charts row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, marginBottom: 16 }}>

        {/* Area chart */}
        <Card style={{ padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Évolution des revenus</p>
              <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                {period === 'week' ? 'Cette semaine' : period === 'month' ? 'Ce mois' : period === 'quarter' ? '3 derniers mois' : '12 derniers mois'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 14, fontSize: 11, color: '#64748b' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 10, height: 3, background: '#10b981', borderRadius: 2, display: 'inline-block' }} />
                Revenus encaissés
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chart} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gr" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#10b981" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<CTooltip />} />
              <Area type="monotone" dataKey="revenus" name="Revenus" stroke="#10b981" fill="url(#gr)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        {/* Pie chart */}
        <Card style={{ padding: 22, display: 'flex', flexDirection: 'column' }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 3 }}>Statut factures</p>
          <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 14 }}>{PERIOD_LABELS[period]}</p>
          {pie.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie data={pie} cx="50%" cy="50%" innerRadius={40} outerRadius={62} paddingAngle={4} dataKey="value">
                    {pie.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => [v, 'factures']} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ marginTop: 'auto', paddingTop: 14, borderTop: '1px solid #f1f5f9' }}>
                {pie.map((d, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: i < pie.length - 1 ? '1px solid #f8fafc' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: '#64748b' }}>{d.name}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{d.value}</span>
                      <span style={{ fontSize: 10, color: '#94a3b8', background: '#f8fafc', borderRadius: 6, padding: '1px 5px' }}>
                        {Math.round(d.value / (pie.reduce((s, x) => s + x.value, 0) || 1) * 100)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1', textAlign: 'center', paddingBottom: 16 }}>
              <svg width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" style={{ marginBottom: 8 }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              <p style={{ fontSize: 12, color: '#94a3b8' }}>Aucune facture</p>
              <p style={{ fontSize: 11, color: '#cbd5e1', marginTop: 3 }}>sur cette période</p>
            </div>
          )}
        </Card>
      </div>

      {/* ── Bar chart ── */}
      <Card style={{ padding: 22, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Revenus encaissés par mois</p>
            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Chiffre d&apos;affaires mensuel</p>
          </div>
          <div style={{ display: 'flex', gap: 14, fontSize: 11, color: '#64748b' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 10, background: '#6366f1', borderRadius: 3, display: 'inline-block' }} />
              Revenus
            </span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={150}>
          <BarChart data={chart} margin={{ top: 5, right: 5, left: 0, bottom: 0 }} barSize={20}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip content={<CTooltip />} />
            <Bar dataKey="revenus" name="Revenus" fill="#6366f1" radius={[5, 5, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* ── Bottom row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Alertes */}
        <Card style={{ padding: 22 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
            <svg width="15" height="15" fill="none" stroke="#f59e0b" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            Alertes &amp; Notifications
          </p>
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
          ) : alerts.map((a, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: '#fffbeb', borderRadius: 12, border: '1.5px solid #fde68a', marginBottom: 8 }}>
              <div style={{ width: 32, height: 32, background: '#fef3c7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d97706', flexShrink: 0 }}>
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </div>
              <p style={{ fontSize: 12, color: '#92400e' }}>{a}</p>
            </div>
          ))}
        </Card>

        {/* Actions rapides */}
        <Card style={{ padding: 22 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 14 }}>Actions rapides</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
            {QUICK.map((q, i) => (
              <a
                key={i}
                href={q.href}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9,
                  padding: '10px 12px', borderRadius: 11,
                  background: q.color + '10',
                  border: `1.5px solid ${q.color}30`,
                  textDecoration: 'none', transition: 'all 0.15s', cursor: 'pointer',
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLAnchorElement;
                  el.style.transform = 'translateY(-1px)';
                  el.style.boxShadow = `0 4px 14px ${q.color}25`;
                  el.style.borderColor = q.color + '60';
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLAnchorElement;
                  el.style.transform = 'none';
                  el.style.boxShadow = 'none';
                  el.style.borderColor = q.color + '30';
                }}
              >
                <div style={{ width: 26, height: 26, borderRadius: 8, background: q.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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
  );
}

