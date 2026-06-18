'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'

// ─── Supabase client helper ────────────────────────────────────────────────────
function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

async function getUserId(): Promise<string | null> {
  try {
    const sb = getSupabaseClient()
    const { data } = await sb.auth.getSession()
    return data?.session?.user?.id ?? null
  } catch {
    return null
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface Client {
  id: string
  name: string
}

interface Project {
  id: string
  name: string
  description: string
  client_id: string
  client_name?: string
  status: 'actif' | 'en_pause' | 'termine' | 'annule' | 'planification'
  priority: 'low' | 'medium' | 'high' | 'critical'
  start_date: string
  end_date: string
  budget: number
  spent: number
  progress: number
  manager: string
  tags: string
  color: string
  created_at: string
}

// ─── Constantes ───────────────────────────────────────────────────────────────
const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  actif:        { label: 'Actif',        color: '#16a34a', bg: '#dcfce7' },
  planification:{ label: 'Planification',color: '#2563eb', bg: '#dbeafe' },
  en_pause:     { label: 'En pause',     color: '#d97706', bg: '#fef3c7' },
  termine:      { label: 'Terminé',      color: '#6b7280', bg: '#f3f4f6' },
  annule:       { label: 'Annulé',       color: '#dc2626', bg: '#fee2e2' },
}

const PRIORITY: Record<string, { label: string; color: string }> = {
  low:      { label: 'Faible',   color: '#6b7280' },
  medium:   { label: 'Moyen',    color: '#d97706' },
  high:     { label: 'Élevé',    color: '#dc2626' },
  critical: { label: 'Critique', color: '#7c3aed' },
}

const EMPTY = {
  name: '',
  description: '',
  client_id: '',
  client_name: '',
  status: 'actif' as Project['status'],
  priority: 'medium' as Project['priority'],
  start_date: '',
  end_date: '',
  budget: 0,
  manager: '',
  tags: '',
  color: '#f59e0b',
}

const COLORS = [
  '#f59e0b','#3b82f6','#10b981','#8b5cf6',
  '#ec4899','#ef4444','#06b6d4','#84cc16',
]

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n || 0)

const fmtD = (d: string) =>
  d ? new Date(d).toLocaleDateString('fr-FR') : '—'

const today = () => new Date().toISOString().split('T')[0]

function daysLeft(end: string): number | null {
  if (!end) return null
  const diff = new Date(end).getTime() - new Date().getTime()
  return Math.ceil(diff / 86400000)
}

function budgetPct(spent: number, budget: number): number {
  if (!budget) return 0
  return Math.min(100, Math.round((spent / budget) * 100))
}

function budgetColor(pct: number): string {
  if (pct >= 90) return '#dc2626'
  if (pct >= 70) return '#d97706'
  return '#16a34a'
}

// ─── SVG Icons ────────────────────────────────────────────────────────────────
const Icons = {
  Plus: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  ),
  Search: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  ),
  Grid: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
    </svg>
  ),
  List: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
      <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
      <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
    </svg>
  ),
  Edit: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  ),
  Trash: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6"/><path d="M14 11v6"/>
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </svg>
  ),
  Eye: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ),
  X: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
  Download: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  ),
  Calendar: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  ),
  Briefcase: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
    </svg>
  ),
  TrendingUp: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
      <polyline points="17 6 23 6 23 12"/>
    </svg>
  ),
  DollarSign: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23"/>
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
    </svg>
  ),
  AlertTriangle: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  ),
  CheckCircle: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
      <polyline points="22 4 12 14.01 9 11.01"/>
    </svg>
  ),
  ChevronRight: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  ),
  Tag: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
      <line x1="7" y1="7" x2="7.01" y2="7"/>
    </svg>
  ),
  User: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  ),
}

// ─── Composants UI ────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] || STATUS['actif']
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
      color: s.color, background: s.bg,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, display: 'inline-block' }} />
      {s.label}
    </span>
  )
}

function PriorityBadge({ priority }: { priority: string }) {
  const p = PRIORITY[priority] || PRIORITY['medium']
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 4,
      fontSize: 11, fontWeight: 700, color: p.color,
      border: `1px solid ${p.color}22`, background: `${p.color}11`,
      textTransform: 'uppercase', letterSpacing: '0.05em',
    }}>
      {p.label}
    </span>
  )
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: '#6b7280' }}>Avancement</span>
        <span style={{ fontSize: 12, fontWeight: 700, color }}>{pct}%</span>
      </div>
      <div style={{ height: 6, borderRadius: 99, background: '#f1f5f9', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99, transition: 'width .3s' }} />
      </div>
    </div>
  )
}

function DaysChip({ end }: { end: string }) {
  const d = daysLeft(end)
  if (d === null) return null
  const color = d < 0 ? '#dc2626' : d <= 7 ? '#d97706' : '#16a34a'
  const bg = d < 0 ? '#fee2e2' : d <= 7 ? '#fef3c7' : '#dcfce7'
  const label = d < 0 ? `${Math.abs(d)}j dépassé` : d === 0 ? 'Aujourd\'hui' : `${d}j restants`
  return (
    <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, color, background: bg }}>
      {label}
    </span>
  )
}

// ─── Modal Projet ─────────────────────────────────────────────────────────────
function ProjectModal({
  form, setForm, clients, onSave, onClose, editing,
}: {
  form: typeof EMPTY
  setForm: (f: typeof EMPTY) => void
  clients: Client[]
  onSave: () => void
  onClose: () => void
  editing: boolean
}) {
  const [tab, setTab] = useState<'info' | 'finance' | 'details'>('info')
  const inp: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 8,
    border: '1px solid #e2e8f0', fontSize: 14, color: '#1e293b',
    background: '#fff', outline: 'none', boxSizing: 'border-box',
  }
  const lbl: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }
  const set = (k: keyof typeof EMPTY, v: unknown) => setForm({ ...form, [k]: v })

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, width: '100%', maxWidth: 580,
        maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        boxShadow: '0 25px 60px rgba(0,0,0,0.2)',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
              {editing ? 'Modifier le projet' : 'Nouveau projet'}
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: '#64748b' }}>
              {editing ? 'Mettez à jour les informations' : 'Remplissez les informations du projet'}
            </p>
          </div>
          <button onClick={onClose} style={{
            background: '#f1f5f9', border: 'none', borderRadius: 8,
            width: 36, height: 36, cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center', color: '#64748b',
          }}>
            <Icons.X />
          </button>
        </div>

        {/* Color picker */}
        <div style={{ padding: '12px 24px 0', display: 'flex', gap: 8 }}>
          {COLORS.map(c => (
            <button key={c} onClick={() => set('color', c)} style={{
              width: 26, height: 26, borderRadius: '50%', background: c, border: 'none',
              cursor: 'pointer', outline: form.color === c ? `3px solid ${c}` : 'none',
              outlineOffset: 2, transform: form.color === c ? 'scale(1.15)' : 'scale(1)',
              transition: 'all .15s',
            }} />
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, padding: '16px 24px 0', borderBottom: '1px solid #f1f5f9' }}>
          {(['info', 'finance', 'details'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '8px 18px', border: 'none', background: 'none',
              fontSize: 13, fontWeight: tab === t ? 700 : 500,
              color: tab === t ? '#1e40af' : '#64748b',
              borderBottom: tab === t ? '2px solid #1e40af' : '2px solid transparent',
              cursor: 'pointer', textTransform: 'capitalize',
            }}>
              {t === 'info' ? 'Informations' : t === 'finance' ? 'Budget' : 'Détails'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {tab === 'info' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={lbl}>Nom du projet *</label>
                <input style={inp} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Ex: Rénovation villa Martinez" />
              </div>
              <div>
                <label style={lbl}>Client</label>
                {clients.length > 0 ? (
                  <select style={inp} value={form.client_id} onChange={e => {
                    const cl = clients.find(c => c.id === e.target.value)
                    setForm({ ...form, client_id: e.target.value, client_name: cl?.name || '' })
                  }}>
                    <option value="">-- Sélectionner un client --</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                ) : (
                  <input style={inp} value={form.client_name} onChange={e => set('client_name', e.target.value)} placeholder="Nom du client" />
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={lbl}>Statut</label>
                  <select style={inp} value={form.status} onChange={e => set('status', e.target.value)}>
                    {Object.entries(STATUS).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Priorité</label>
                  <select style={inp} value={form.priority} onChange={e => set('priority', e.target.value)}>
                    {Object.entries(PRIORITY).map(([v, p]) => <option key={v} value={v}>{p.label}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={lbl}>Date début</label>
                  <input type="date" style={inp} value={form.start_date} onChange={e => set('start_date', e.target.value)} />
                </div>
                <div>
                  <label style={lbl}>Date fin</label>
                  <input type="date" style={inp} value={form.end_date} onChange={e => set('end_date', e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {tab === 'finance' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={lbl}>Budget total (€)</label>
                <input type="number" style={inp} value={form.budget} onChange={e => set('budget', Number(e.target.value))} placeholder="0" />
              </div>
              <div style={{
                padding: 16, borderRadius: 10, background: '#f8fafc',
                border: '1px solid #e2e8f0',
              }}>
                <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
                  Le suivi des dépenses s'effectue automatiquement via les pointages, ajustements et dépenses liés à ce projet.
                </p>
              </div>
            </div>
          )}

          {tab === 'details' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={lbl}>Description</label>
                <textarea style={{ ...inp, minHeight: 80, resize: 'vertical' }} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Description du projet..." />
              </div>
              <div>
                <label style={lbl}>Responsable</label>
                <input style={inp} value={form.manager} onChange={e => set('manager', e.target.value)} placeholder="Nom du responsable" />
              </div>
              <div>
                <label style={lbl}>Tags (séparés par des virgules)</label>
                <input style={inp} value={form.tags} onChange={e => set('tags', e.target.value)} placeholder="Ex: renovation, urgent, client-vip" />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px', borderTop: '1px solid #f1f5f9',
          display: 'flex', justifyContent: 'flex-end', gap: 10,
        }}>
          <button onClick={onClose} style={{
            padding: '9px 20px', borderRadius: 8, border: '1px solid #e2e8f0',
            background: '#fff', fontSize: 14, fontWeight: 500, color: '#374151', cursor: 'pointer',
          }}>
            Annuler
          </button>
          <button onClick={onSave} disabled={!form.name.trim()} style={{
            padding: '9px 24px', borderRadius: 8, border: 'none',
            background: form.name.trim() ? '#1e40af' : '#cbd5e1',
            fontSize: 14, fontWeight: 600, color: '#fff', cursor: form.name.trim() ? 'pointer' : 'not-allowed',
          }}>
            {editing ? 'Mettre à jour' : 'Créer le projet'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Drawer Détail ────────────────────────────────────────────────────────────
function ProjectDrawer({
  project, onClose, onEdit, onDelete, onStatusChange, onProgressChange,
}: {
  project: Project
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
  onStatusChange: (s: Project['status']) => void
  onProgressChange: (p: number) => void
}) {
  const bPct = budgetPct(project.spent || 0, project.budget || 0)
  const bColor = budgetColor(bPct)
  const inp: React.CSSProperties = {
    padding: '7px 10px', borderRadius: 7, border: '1px solid #e2e8f0',
    fontSize: 13, color: '#1e293b', background: '#fff', outline: 'none',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)',
      display: 'flex', justifyContent: 'flex-end', zIndex: 1000,
    }}>
      <div style={{
        width: '100%', maxWidth: 480, background: '#fff', height: '100%',
        overflowY: 'auto', boxShadow: '-10px 0 40px rgba(0,0,0,0.12)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ padding: '24px 24px 20px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 14, height: 14, borderRadius: '50%', background: project.color || '#f59e0b' }} />
              <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>
                {project.client_name || '—'}
              </span>
            </div>
            <button onClick={onClose} style={{
              background: '#f1f5f9', border: 'none', borderRadius: 8,
              width: 34, height: 34, cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center', color: '#64748b',
            }}>
              <Icons.X />
            </button>
          </div>
          <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 800, color: '#0f172a' }}>{project.name}</h2>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <StatusBadge status={project.status} />
            <PriorityBadge priority={project.priority} />
            {project.end_date && <DaysChip end={project.end_date} />}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', flex: 1 }}>
          {/* Progress control */}
          <div style={{ marginBottom: 24, padding: 16, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <ProgressBar pct={project.progress || 0} color={project.color || '#f59e0b'} />
            <div style={{ marginTop: 12 }}>
              <input type="range" min={0} max={100} value={project.progress || 0}
                onChange={e => onProgressChange(Number(e.target.value))}
                style={{ width: '100%', accentColor: project.color || '#f59e0b' }} />
            </div>
          </div>

          {/* Budget */}
          <div style={{ marginBottom: 20, padding: 16, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Budget</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: bColor }}>{bPct}% utilisé</span>
            </div>
            <div style={{ height: 8, borderRadius: 99, background: '#e2e8f0', overflow: 'hidden', marginBottom: 8 }}>
              <div style={{ height: '100%', width: `${bPct}%`, background: bColor, borderRadius: 99 }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: '#64748b' }}>Dépensé: <strong>{fmt(project.spent || 0)}</strong></span>
              <span style={{ fontSize: 12, color: '#64748b' }}>Budget: <strong>{fmt(project.budget || 0)}</strong></span>
            </div>
          </div>

          {/* Infos */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
            {[
              { icon: <Icons.Calendar />, label: 'Début', value: fmtD(project.start_date) },
              { icon: <Icons.Calendar />, label: 'Fin prévue', value: fmtD(project.end_date) },
              { icon: <Icons.User />, label: 'Responsable', value: project.manager || '—' },
            ].map((row, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#f8fafc', borderRadius: 8 }}>
                <span style={{ color: '#94a3b8' }}>{row.icon}</span>
                <span style={{ fontSize: 13, color: '#64748b', minWidth: 90 }}>{row.label}</span>
                <span style={{ fontSize: 13, color: '#1e293b', fontWeight: 500 }}>{row.value}</span>
              </div>
            ))}
          </div>

          {/* Statut rapide */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Changer le statut</label>
            <select value={project.status} onChange={e => onStatusChange(e.target.value as Project['status'])}
              style={{ ...inp, width: '100%' }}>
              {Object.entries(STATUS).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}
            </select>
          </div>

          {/* Description */}
          {project.description && (
            <div style={{ marginBottom: 20, padding: 14, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
              <p style={{ margin: 0, fontSize: 13, color: '#475569', lineHeight: 1.6 }}>{project.description}</p>
            </div>
          )}

          {/* Tags */}
          {project.tags && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {project.tags.split(',').map((t, i) => (
                <span key={i} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '3px 10px', borderRadius: 20, background: '#f1f5f9',
                  fontSize: 12, color: '#475569',
                }}>
                  <Icons.Tag />{t.trim()}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 10 }}>
          <button onClick={onEdit} style={{
            flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #e2e8f0',
            background: '#fff', fontSize: 13, fontWeight: 600, color: '#374151',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <Icons.Edit /> Modifier
          </button>
          <button onClick={onDelete} style={{
            padding: '10px 16px', borderRadius: 8, border: '1px solid #fee2e2',
            background: '#fff5f5', fontSize: 13, fontWeight: 600, color: '#dc2626',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <Icons.Trash /> Supprimer
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────
export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ ...EMPTY })
  const [editP, setEditP] = useState<Project | null>(null)
  const [viewP, setViewP] = useState<Project | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const userId = await getUserId()
      if (!userId) { setLoading(false); return }

      const headers: HeadersInit = {
        'x-user-id': userId,
        'Content-Type': 'application/json',
      }

      const fetchSafe = async (url: string) => {
        try {
          const r = await fetch(url, { headers })
          if (!r.ok) return []
          const t = await r.text()
          if (!t || t.trim() === '') return []
          return JSON.parse(t)
        } catch { return [] }
      }

      const [pd, cd] = await Promise.all([
        fetchSafe('/api/projects'),
        fetchSafe('/api/clients'),
      ])

      const list = (Array.isArray(pd) ? pd : pd.data ?? []).map((p: Project) => ({
        ...p,
        client_name:
          (Array.isArray(cd) ? cd : cd.data ?? [])
            .find((c: Client) => c.id === p.client_id)?.name || p.client_name || '—',
      }))
      setProjects(list)
      setClients(Array.isArray(cd) ? cd : cd.data ?? [])
    } catch (e) {
      console.error('ProjectsPage load error:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function save() {
    const userId = await getUserId()
    if (!userId) return
    const headers = { 'Content-Type': 'application/json', 'x-user-id': userId }
    if (editP) {
      await fetch('/api/projects', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ id: editP.id, ...form }),
      })
    } else {
      await fetch('/api/projects', {
        method: 'POST',
        headers,
        body: JSON.stringify(form),
      })
    }
    setModal(false)
    setEditP(null)
    setForm({ ...EMPTY })
    load()
  }

  async function del(id: string) {
    const userId = await getUserId()
    if (!userId) return
    await fetch(`/api/projects?id=${id}`, {
      method: 'DELETE',
      headers: { 'x-user-id': userId },
    })
    setDeleteId(null)
    setViewP(null)
    load()
  }

  async function changeStatus(id: string, status: Project['status']) {
    const userId = await getUserId()
    if (!userId) return
    await fetch('/api/projects', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
      body: JSON.stringify({ id, status }),
    })
    setViewP(v => v ? { ...v, status } : v)
    load()
  }

  async function changeProgress(id: string, progress: number) {
    const userId = await getUserId()
    if (!userId) return
    await fetch('/api/projects', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
      body: JSON.stringify({ id, progress }),
    })
    setViewP(v => v ? { ...v, progress } : v)
    load()
  }

  function openEdit(p: Project) {
    setEditP(p)
    setForm({
      name: p.name, description: p.description || '',
      client_id: p.client_id || '', client_name: p.client_name || '',
      status: p.status, priority: p.priority,
      start_date: p.start_date || '', end_date: p.end_date || '',
      budget: p.budget || 0, manager: p.manager || '',
      tags: p.tags || '', color: p.color || '#f59e0b',
    })
    setViewP(null)
    setModal(true)
  }

  function exportCSV() {
    const header = ['Nom', 'Client', 'Statut', 'Priorité', 'Budget', 'Dépensé', 'Avancement', 'Début', 'Fin', 'Responsable']
    const rows = filtered.map(p => [
      p.name, p.client_name || '', STATUS[p.status]?.label || p.status,
      PRIORITY[p.priority]?.label || p.priority,
      p.budget, p.spent, `${p.progress}%`,
      fmtD(p.start_date), fmtD(p.end_date), p.manager || '',
    ])
    const csv = [header, ...rows].map(r => r.join(';')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    a.download = `projets_${today()}.csv`
    a.click()
  }

  // ─── Filtres & KPIs ────────────────────────────────────────────────────────
  const filtered = projects.filter(p => {
    const q = search.toLowerCase()
    const matchQ = !q || p.name.toLowerCase().includes(q) || (p.client_name || '').toLowerCase().includes(q) || (p.manager || '').toLowerCase().includes(q)
    const matchS = !filterStatus || p.status === filterStatus
    const matchP = !filterPriority || p.priority === filterPriority
    return matchQ && matchS && matchP
  })

  const kpis = {
    total: projects.length,
    actifs: projects.filter(p => p.status === 'actif').length,
    termines: projects.filter(p => p.status === 'termine').length,
    budgetTotal: projects.reduce((s, p) => s + (p.budget || 0), 0),
    depenseTotal: projects.reduce((s, p) => s + (p.spent || 0), 0),
  }

  const globalBudgetPct = kpis.budgetTotal > 0 ? Math.round((kpis.depenseTotal / kpis.budgetTotal) * 100) : 0

  const inp: React.CSSProperties = {
    padding: '9px 14px', borderRadius: 9, border: '1px solid #e2e8f0',
    fontSize: 14, color: '#1e293b', background: '#fff', outline: 'none',
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '20px 32px' }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#0f172a' }}>Projets</h1>
            <p style={{ margin: '4px 0 0', fontSize: 14, color: '#64748b' }}>
              {kpis.total} projet{kpis.total > 1 ? 's' : ''} — {kpis.actifs} actif{kpis.actifs > 1 ? 's' : ''}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={exportCSV} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '9px 16px', borderRadius: 9, border: '1px solid #e2e8f0',
              background: '#fff', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer',
            }}>
              <Icons.Download /> Exporter
            </button>
            <button onClick={() => { setEditP(null); setForm({ ...EMPTY }); setModal(true) }} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '9px 18px', borderRadius: 9, border: 'none',
              background: '#1e40af', fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer',
            }}>
              <Icons.Plus /> Nouveau projet
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '28px 32px' }}>
        {/* KPI Strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
          {[
            { icon: <Icons.Briefcase />, label: 'Total projets', value: kpis.total, color: '#1e40af', bg: '#eff6ff' },
            { icon: <Icons.CheckCircle />, label: 'Actifs', value: kpis.actifs, color: '#16a34a', bg: '#dcfce7' },
            { icon: <Icons.TrendingUp />, label: 'Terminés', value: kpis.termines, color: '#7c3aed', bg: '#f5f3ff' },
            { icon: <Icons.DollarSign />, label: 'Budget total', value: fmt(kpis.budgetTotal), color: '#0891b2', bg: '#ecfeff' },
            { icon: <Icons.AlertTriangle />, label: 'Dépenses', value: fmt(kpis.depenseTotal), color: '#d97706', bg: '#fffbeb' },
          ].map((k, i) => (
            <div key={i} style={{
              background: '#fff', borderRadius: 12, padding: '18px 20px',
              boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9',
              display: 'flex', alignItems: 'center', gap: 14,
            }}>
              <div style={{
                width: 42, height: 42, borderRadius: 10, background: k.bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: k.color, flexShrink: 0,
              }}>
                {k.icon}
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k.label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>{k.value}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Budget global bar */}
        {kpis.budgetTotal > 0 && (
          <div style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', marginBottom: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Consommation budget global</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: budgetColor(globalBudgetPct) }}>{globalBudgetPct}%</span>
            </div>
            <div style={{ height: 10, borderRadius: 99, background: '#f1f5f9', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${globalBudgetPct}%`, background: budgetColor(globalBudgetPct), borderRadius: 99, transition: 'width .5s' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>Dépensé: {fmt(kpis.depenseTotal)}</span>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>Budget: {fmt(kpis.budgetTotal)}</span>
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20, alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 220, position: 'relative' }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}>
              <Icons.Search />
            </span>
            <input
              placeholder="Rechercher un projet, client..."
              value={search} onChange={e => setSearch(e.target.value)}
              style={{ ...inp, paddingLeft: 36, width: '100%', boxSizing: 'border-box' }}
            />
          </div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={inp}>
            <option value="">Tous les statuts</option>
            {Object.entries(STATUS).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}
          </select>
          <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} style={inp}>
            <option value="">Toutes priorités</option>
            {Object.entries(PRIORITY).map(([v, p]) => <option key={v} value={v}>{p.label}</option>)}
          </select>
          <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 9, padding: 3, gap: 3 }}>
            {(['grid', 'list'] as const).map(v => (
              <button key={v} onClick={() => setView(v)} style={{
                padding: '6px 12px', borderRadius: 7, border: 'none',
                background: view === v ? '#fff' : 'transparent',
                color: view === v ? '#1e40af' : '#64748b',
                cursor: 'pointer', boxShadow: view === v ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                display: 'flex', alignItems: 'center', gap: 5,
              }}>
                {v === 'grid' ? <Icons.Grid /> : <Icons.List />}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>
            <div style={{ fontSize: 15 }}>Chargement...</div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>
              <Icons.Briefcase />
            </div>
            <p style={{ color: '#94a3b8', fontSize: 15 }}>Aucun projet trouvé</p>
            <button onClick={() => { setEditP(null); setForm({ ...EMPTY }); setModal(true) }} style={{
              marginTop: 12, padding: '10px 20px', borderRadius: 9, border: 'none',
              background: '#1e40af', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer',
            }}>
              Créer le premier projet
            </button>
          </div>
        ) : view === 'grid' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 18 }}>
            {filtered.map(p => {
              const bPct = budgetPct(p.spent || 0, p.budget || 0)
              return (
                <div key={p.id} style={{
                  background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.05)', overflow: 'hidden',
                  transition: 'box-shadow .2s',
                  borderTop: `4px solid ${p.color || '#f59e0b'}`,
                }}>
                  <div style={{ padding: '18px 20px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <div style={{ flex: 1, marginRight: 8 }}>
                        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a', lineHeight: 1.3 }}>{p.name}</h3>
                        {p.client_name && p.client_name !== '—' && (
                          <span style={{ fontSize: 12, color: '#94a3b8', marginTop: 2, display: 'block' }}>{p.client_name}</span>
                        )}
                      </div>
                      <StatusBadge status={p.status} />
                    </div>

                    <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
                      <PriorityBadge priority={p.priority} />
                      {p.end_date && <DaysChip end={p.end_date} />}
                    </div>

                    <ProgressBar pct={p.progress || 0} color={p.color || '#f59e0b'} />

                    {p.budget > 0 && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 11, color: '#94a3b8' }}>Budget</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: budgetColor(bPct) }}>{fmt(p.spent || 0)} / {fmt(p.budget)}</span>
                        </div>
                        <div style={{ height: 4, borderRadius: 99, background: '#f1f5f9' }}>
                          <div style={{ height: '100%', width: `${bPct}%`, background: budgetColor(bPct), borderRadius: 99 }} />
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{
                    padding: '10px 20px', borderTop: '1px solid #f8fafc',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: '#fafbfc',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#94a3b8' }}>
                      <Icons.Calendar />
                      <span style={{ fontSize: 12 }}>{fmtD(p.end_date)}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => setViewP(p)} style={{
                        padding: '5px 10px', borderRadius: 7, border: '1px solid #e2e8f0',
                        background: '#fff', color: '#64748b', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 4, fontSize: 12,
                      }}>
                        <Icons.Eye /> Voir
                      </button>
                      <button onClick={() => openEdit(p)} style={{
                        padding: '5px 10px', borderRadius: 7, border: '1px solid #dbeafe',
                        background: '#eff6ff', color: '#1e40af', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 4, fontSize: 12,
                      }}>
                        <Icons.Edit />
                      </button>
                      <button onClick={() => setDeleteId(p.id)} style={{
                        padding: '5px 10px', borderRadius: 7, border: '1px solid #fee2e2',
                        background: '#fff5f5', color: '#dc2626', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 4, fontSize: 12,
                      }}>
                        <Icons.Trash />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          /* List view */
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Projet', 'Statut', 'Priorité', 'Avancement', 'Budget', 'Échéance', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid #f1f5f9' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, i) => (
                  <tr key={p.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid #f8fafc' : 'none' }}>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: p.color || '#f59e0b', flexShrink: 0 }} />
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{p.name}</div>
                          {p.client_name && p.client_name !== '—' && (
                            <div style={{ fontSize: 12, color: '#94a3b8' }}>{p.client_name}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px' }}><StatusBadge status={p.status} /></td>
                    <td style={{ padding: '14px 16px' }}><PriorityBadge priority={p.priority} /></td>
                    <td style={{ padding: '14px 16px', minWidth: 140 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 6, borderRadius: 99, background: '#f1f5f9', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${p.progress || 0}%`, background: p.color || '#f59e0b', borderRadius: 99 }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#374151', minWidth: 32 }}>{p.progress || 0}%</span>
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{fmt(p.budget || 0)}</div>
                      {p.budget > 0 && <div style={{ fontSize: 11, color: budgetColor(budgetPct(p.spent || 0, p.budget)) }}>{budgetPct(p.spent || 0, p.budget)}% utilisé</div>}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontSize: 13, color: '#374151' }}>{fmtD(p.end_date)}</div>
                      {p.end_date && <DaysChip end={p.end_date} />}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => setViewP(p)} style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Icons.Eye /></button>
                        <button onClick={() => openEdit(p)} style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #dbeafe', background: '#eff6ff', color: '#1e40af', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Icons.Edit /></button>
                        <button onClick={() => setDeleteId(p.id)} style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #fee2e2', background: '#fff5f5', color: '#dc2626', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Icons.Trash /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal création/édition */}
      {modal && (
        <ProjectModal
          form={form} setForm={setForm} clients={clients}
          onSave={save} onClose={() => { setModal(false); setEditP(null); setForm({ ...EMPTY }) }}
          editing={!!editP}
        />
      )}

      {/* Drawer détail */}
      {viewP && (
        <ProjectDrawer
          project={viewP}
          onClose={() => setViewP(null)}
          onEdit={() => openEdit(viewP)}
          onDelete={() => { setDeleteId(viewP.id); setViewP(null) }}
          onStatusChange={s => changeStatus(viewP.id, s)}
          onProgressChange={prog => changeProgress(viewP.id, prog)}
        />
      )}

      {/* Confirmation suppression */}
      {deleteId && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100,
        }}>
          <div style={{
            background: '#fff', borderRadius: 16, padding: 32, maxWidth: 420, width: '90%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, color: '#dc2626' }}>
              <Icons.Trash />
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: '#0f172a' }}>Supprimer ce projet ?</h3>
            <p style={{ margin: '0 0 24px', fontSize: 14, color: '#64748b', lineHeight: 1.5 }}>
              Cette action est irréversible. Toutes les données associées à ce projet seront supprimées.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setDeleteId(null)} style={{
                padding: '9px 20px', borderRadius: 8, border: '1px solid #e2e8f0',
                background: '#fff', fontSize: 14, fontWeight: 500, color: '#374151', cursor: 'pointer',
              }}>
                Annuler
              </button>
              <button onClick={() => del(deleteId)} style={{
                padding: '9px 20px', borderRadius: 8, border: 'none',
                background: '#dc2626', fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer',
              }}>
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
