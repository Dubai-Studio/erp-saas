'use client'

import { useState, useEffect, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Client {
  id: string
  name: string
  email: string
  phone: string
  address: string
  city: string
  country: string
  vat_number: string
  status: 'active' | 'inactive' | 'prospect'
  created_at: string
  // Champs enrichis (calculés ou depuis jointures)
  invoices_count?: number
  total_revenue?: number
  last_invoice_date?: string
}

type ViewMode   = 'list' | 'grid'
type SortField  = 'name' | 'created_at' | 'status' | 'total_revenue' | 'invoices_count'
type SortDir    = 'asc' | 'desc'

// ─── Constantes ───────────────────────────────────────────────────────────────
const STATUS: Record<string, { label: string; color: string; bg: string; border: string; dot: string }> = {
  active:   { label:'Actif',    color:'#15803d', bg:'#f0fdf4', border:'#bbf7d0', dot:'#22c55e' },
  inactive: { label:'Inactif',  color:'#64748b', bg:'#f8fafc', border:'#e2e8f0', dot:'#94a3b8' },
  prospect: { label:'Prospect', color:'#1d4ed8', bg:'#eff6ff', border:'#bfdbfe', dot:'#3b82f6' },
}

const COUNTRIES = ['Belgique','France','Luxembourg','Pays-Bas','Allemagne','Suisse','Espagne','Italie','Royaume-Uni','Autre']
const EMPTY = {
  name:'', email:'', phone:'', address:'', city:'',
  country:'Belgique', vat_number:'', status:'active' as Client['status'],
  notes:''
}
const AVATAR_COLORS = ['#6366f1','#10b981','#f59e0b','#8b5cf6','#06b6d4','#ef4444','#ec4899','#0ea5e9']

function avatarColor(name: string) {
  let h = 0
  for (const c of name) h = c.charCodeAt(0) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}
function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2) || '?'
}
const fmt  = (n: number) => new Intl.NumberFormat('fr-BE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n)
const fmtD = (s: string)  => s ? new Date(s).toLocaleDateString('fr-BE',{day:'2-digit',month:'short',year:'numeric'}) : '—'

// ─── Icons ────────────────────────────────────────────────────────────────────
const I = {
  search:   <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>,
  plus:     <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  edit:     <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  trash:    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>,
  eye:      <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  list:     <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
  grid:     <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>,
  x:        <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  mail:     <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
  phone:    <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.56 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,
  pin:      <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  user:     <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  check:    <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>,
  filter:   <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
  vat:      <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>,
  sort:     <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 6h18M7 12h10M11 18h4"/></svg>,
  sortUp:   <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"/></svg>,
  sortDown: <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>,
  euro:     <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 10h12M4 14h12"/><path d="M19.5 9A7.5 7.5 0 1 0 19.5 15"/></svg>,
  invoice:  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="12" y2="17"/></svg>,
  calendar: <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  export:   <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  notes:    <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="11" y2="17"/></svg>,
  globe:    <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
  tag:      <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>,
}

// ─── Styles partagés ──────────────────────────────────────────────────────────
const card: React.CSSProperties = {
  background: '#fff',
  borderRadius: 16,
  boxShadow: '0 1px 4px rgba(0,0,0,0.05), 0 4px 16px rgba(0,0,0,0.04)',
  border: '1px solid #f1f5f9',
}

const inp: React.CSSProperties = {
  width: '100%', padding: '9px 13px',
  border: '1.5px solid #e2e8f0', borderRadius: 10,
  fontSize: 13, color: '#1e293b', background: '#fff',
  outline: 'none', transition: 'border-color 0.15s, box-shadow 0.15s',
  boxSizing: 'border-box',
}

const lbl: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700,
  color: '#64748b', marginBottom: 5, letterSpacing: '0.04em', textTransform: 'uppercase',
}

// ─── Action Button ────────────────────────────────────────────────────────────
function ActionBtn({
  onClick, title, icon, hoverBg, hoverColor
}: {
  onClick: () => void; title: string; icon: React.ReactNode
  hoverBg: string; hoverColor: string
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 32, height: 32, borderRadius: 8, border: 'none', cursor: 'pointer',
        background: hovered ? hoverBg : '#f8fafc',
        color: hovered ? hoverColor : '#94a3b8',
        transition: 'all 0.15s', flexShrink: 0,
      }}
    >
      {icon}
    </button>
  )
}

// ─── Modal Create/Edit ────────────────────────────────────────────────────────
function Modal({ open, onClose, onSave, initial }: {
  open: boolean; onClose: () => void
  onSave: (d: typeof EMPTY) => Promise<void>
  initial?: Client | null
}) {
  const [form, setForm]     = useState({ ...EMPTY })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const [tab,    setTab]    = useState<'info'|'adresse'|'notes'>('info')

  useEffect(() => {
    setForm(initial
      ? { name: initial.name||'', email: initial.email||'', phone: initial.phone||'',
          address: initial.address||'', city: initial.city||'', country: initial.country||'Belgique',
          vat_number: initial.vat_number||'', status: initial.status||'active', notes:'' }
      : { ...EMPTY })
    setError(''); setTab('info')
  }, [initial, open])

  if (!open) return null
  const f = (k: keyof typeof EMPTY, v: string) => setForm(p => ({ ...p, [k]: v }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Le nom est obligatoire.'); setTab('info'); return }
    setSaving(true); setError('')
    try { await onSave(form) }
    catch  { setError('Erreur lors de la sauvegarde.') }
    setSaving(false)
  }

  const TABS = [
    { key:'info',    label:'Infos générales' },
    { key:'adresse', label:'Adresse' },
    { key:'notes',   label:'Notes' },
  ] as const

  return (
    <div style={{ position:'fixed', inset:0, zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ position:'absolute', inset:0, background:'rgba(15,23,42,0.5)', backdropFilter:'blur(6px)' }} onClick={onClose}/>
      <div style={{
        ...card, position:'relative', width:'100%', maxWidth:560,
        maxHeight:'92vh', overflowY:'auto', zIndex:1,
        animation:'slideUp 0.2s ease',
      }}>
        {/* Header */}
        <div style={{
          padding:'22px 24px 0', background: 'linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%)',
          borderRadius:'16px 16px 0 0',
        }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
            <div>
              <h2 style={{ fontSize:17, fontWeight:700, color:'#fff' }}>
                {initial ? '✏️ Modifier le client' : '➕ Nouveau client'}
              </h2>
              <p style={{ fontSize:12, color:'rgba(255,255,255,0.7)', marginTop:3 }}>
                {initial ? `Modification de ${initial.name}` : 'Remplissez les informations du client'}
              </p>
            </div>
            <button onClick={onClose} style={{ background:'rgba(255,255,255,0.2)', border:'none', borderRadius:8, padding:8, cursor:'pointer', color:'#fff', display:'flex' }}>{I.x}</button>
          </div>
          {/* Tabs */}
          <div style={{ display:'flex', gap:2 }}>
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                padding:'9px 18px', border:'none', background:'none',
                color: tab===t.key ? '#fff' : 'rgba(255,255,255,0.6)',
                fontSize:13, fontWeight:600, cursor:'pointer',
                borderBottom: tab===t.key ? '2px solid #fff' : '2px solid transparent',
                transition:'all 0.15s',
              }}>{t.label}</button>
            ))}
          </div>
        </div>

        <form onSubmit={submit} style={{ padding:24 }}>
          {error && (
            <div style={{ padding:'10px 14px', background:'#fef2f2', border:'1.5px solid #fecaca', borderRadius:10, fontSize:13, color:'#dc2626', marginBottom:18, display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ flexShrink:0 }}>{I.x}</span> {error}
            </div>
          )}

          {/* Tab: Infos */}
          {tab === 'info' && (
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <div>
                <label style={lbl}>Nom / Entreprise <span style={{ color:'#ef4444' }}>*</span></label>
                <input style={inp} value={form.name} onChange={e=>f('name',e.target.value)} placeholder="Acme SPRL"
                  onFocus={e=>{e.target.style.borderColor='#6366f1';e.target.style.boxShadow='0 0 0 3px rgba(99,102,241,0.12)'}}
                  onBlur={e=>{e.target.style.borderColor='#e2e8f0';e.target.style.boxShadow='none'}}/>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                <div>
                  <label style={lbl}>Email</label>
                  <input style={inp} type="email" value={form.email} onChange={e=>f('email',e.target.value)} placeholder="contact@acme.be"
                    onFocus={e=>{e.target.style.borderColor='#6366f1';e.target.style.boxShadow='0 0 0 3px rgba(99,102,241,0.12)'}}
                    onBlur={e=>{e.target.style.borderColor='#e2e8f0';e.target.style.boxShadow='none'}}/>
                </div>
                <div>
                  <label style={lbl}>Téléphone</label>
                  <input style={inp} value={form.phone} onChange={e=>f('phone',e.target.value)} placeholder="+32 2 000 00 00"
                    onFocus={e=>{e.target.style.borderColor='#6366f1';e.target.style.boxShadow='0 0 0 3px rgba(99,102,241,0.12)'}}
                    onBlur={e=>{e.target.style.borderColor='#e2e8f0';e.target.style.boxShadow='none'}}/>
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                <div>
                  <label style={lbl}>Numéro TVA</label>
                  <input style={inp} value={form.vat_number} onChange={e=>f('vat_number',e.target.value)} placeholder="BE 0123.456.789"
                    onFocus={e=>{e.target.style.borderColor='#6366f1';e.target.style.boxShadow='0 0 0 3px rgba(99,102,241,0.12)'}}
                    onBlur={e=>{e.target.style.borderColor='#e2e8f0';e.target.style.boxShadow='none'}}/>
                </div>
                <div>
                  <label style={lbl}>Statut</label>
                  <select style={{ ...inp, width:'100%' }} value={form.status} onChange={e=>f('status',e.target.value as Client['status'])}
                    onFocus={e=>{e.target.style.borderColor='#6366f1'}} onBlur={e=>{e.target.style.borderColor='#e2e8f0'}}>
                    <option value="active">✅ Actif</option>
                    <option value="prospect">🔵 Prospect</option>
                    <option value="inactive">⚫ Inactif</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Tab: Adresse */}
          {tab === 'adresse' && (
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <div>
                <label style={lbl}>Adresse</label>
                <input style={inp} value={form.address} onChange={e=>f('address',e.target.value)} placeholder="Rue de la Loi 1"
                  onFocus={e=>{e.target.style.borderColor='#6366f1';e.target.style.boxShadow='0 0 0 3px rgba(99,102,241,0.12)'}}
                  onBlur={e=>{e.target.style.borderColor='#e2e8f0';e.target.style.boxShadow='none'}}/>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                <div>
                  <label style={lbl}>Ville</label>
                  <input style={inp} value={form.city} onChange={e=>f('city',e.target.value)} placeholder="Bruxelles"
                    onFocus={e=>{e.target.style.borderColor='#6366f1';e.target.style.boxShadow='0 0 0 3px rgba(99,102,241,0.12)'}}
                    onBlur={e=>{e.target.style.borderColor='#e2e8f0';e.target.style.boxShadow='none'}}/>
                </div>
                <div>
                  <label style={lbl}>Pays</label>
                  <select style={{ ...inp, width:'100%' }} value={form.country} onChange={e=>f('country',e.target.value)}
                    onFocus={e=>{e.target.style.borderColor='#6366f1'}} onBlur={e=>{e.target.style.borderColor='#e2e8f0'}}>
                    {COUNTRIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Tab: Notes */}
          {tab === 'notes' && (
            <div>
              <label style={lbl}>Notes internes</label>
              <textarea
                value={form.notes}
                onChange={e=>f('notes',e.target.value)}
                placeholder="Informations complémentaires, remarques…"
                rows={6}
                style={{ ...inp, resize:'vertical', fontFamily:'inherit', lineHeight:1.6 }}
                onFocus={e=>{e.target.style.borderColor='#6366f1';e.target.style.boxShadow='0 0 0 3px rgba(99,102,241,0.12)'}}
                onBlur={e=>{e.target.style.borderColor='#e2e8f0';e.target.style.boxShadow='none'}}
              />
            </div>
          )}

          <div style={{ display:'flex', gap:10, marginTop:24 }}>
            <button type="button" onClick={onClose} style={{
              flex:1, padding:'10px 0', borderRadius:10,
              border:'1.5px solid #e2e8f0', background:'#fff',
              fontSize:13, fontWeight:600, color:'#64748b', cursor:'pointer',
            }}>Annuler</button>
            <button type="submit" disabled={saving} style={{
              flex:2, padding:'10px 0', borderRadius:10, border:'none',
              background: saving ? '#a5b4fc' : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
              fontSize:13, fontWeight:700, color:'#fff', cursor: saving ? 'not-allowed' : 'pointer',
              display:'flex', alignItems:'center', justifyContent:'center', gap:8,
            }}>
              {saving
                ? <><div style={{ width:14, height:14, border:'2px solid #fff', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/> Enregistrement…</>
                : <>{I.check} {initial ? 'Mettre à jour' : 'Créer le client'}</>
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Drawer détail ────────────────────────────────────────────────────────────
function Drawer({ client, onClose, onEdit, onDelete }: {
  client: Client | null; onClose: () => void
  onEdit: () => void; onDelete: () => void
}) {
  if (!client) return null
  const st  = STATUS[client.status]
  const col = avatarColor(client.name)

  function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return (
      <div style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'11px 0', borderBottom:'1px solid #f8fafc' }}>
        <div style={{ width:34, height:34, borderRadius:9, background:'#f8fafc', display:'flex', alignItems:'center', justifyContent:'center', color:'#94a3b8', flexShrink:0 }}>{icon}</div>
        <div>
          <p style={{ fontSize:10, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:2 }}>{label}</p>
          <p style={{ fontSize:13, fontWeight:600, color:'#1e293b', wordBreak:'break-all' }}>{value || '—'}</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:190, display:'flex', justifyContent:'flex-end' }}>
      <div style={{ position:'absolute', inset:0, background:'rgba(15,23,42,0.35)', backdropFilter:'blur(3px)' }} onClick={onClose}/>
      <div style={{
        ...card, position:'relative', width:360, height:'100%',
        borderRadius:'20px 0 0 20px', display:'flex', flexDirection:'column',
        overflowY:'auto', zIndex:1, animation:'slideLeft 0.2s ease',
      }}>
        {/* Header */}
        <div style={{
          background:'linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%)',
          padding:'20px 20px 24px', borderRadius:'20px 0 0 0',
        }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
            <h3 style={{ fontSize:15, fontWeight:700, color:'#fff' }}>Fiche client</h3>
            <button onClick={onClose} style={{ background:'rgba(255,255,255,0.2)', border:'none', borderRadius:8, padding:7, cursor:'pointer', color:'#fff', display:'flex' }}>{I.x}</button>
          </div>
          <div style={{ textAlign:'center' }}>
            <div style={{ width:68, height:68, borderRadius:18, background:'rgba(255,255,255,0.25)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:22, fontWeight:800, margin:'0 auto 10px', border:'3px solid rgba(255,255,255,0.4)' }}>
              {initials(client.name)}
            </div>
            <h2 style={{ fontSize:16, fontWeight:700, color:'#fff' }}>{client.name}</h2>
            <div style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'4px 12px', borderRadius:20, background:'rgba(255,255,255,0.2)', marginTop:8 }}>
              <span style={{ width:7, height:7, borderRadius:'50%', background:st.dot }}/>
              <span style={{ fontSize:12, fontWeight:600, color:'#fff' }}>{st.label}</span>
            </div>
          </div>
        </div>

        {/* Stats rapides */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, padding:'16px 16px 8px' }}>
          <div style={{ background:'#f0fdf4', border:'1.5px solid #bbf7d0', borderRadius:12, padding:'12px 14px', textAlign:'center' }}>
            <p style={{ fontSize:18, fontWeight:800, color:'#10b981' }}>{client.invoices_count || 0}</p>
            <p style={{ fontSize:11, color:'#64748b', marginTop:2 }}>Factures</p>
          </div>
          <div style={{ background:'#eff6ff', border:'1.5px solid #bfdbfe', borderRadius:12, padding:'12px 14px', textAlign:'center' }}>
            <p style={{ fontSize:16, fontWeight:800, color:'#3b82f6' }}>{fmt(client.total_revenue || 0)}</p>
            <p style={{ fontSize:11, color:'#64748b', marginTop:2 }}>CA total</p>
          </div>
        </div>

        {/* Infos */}
        <div style={{ padding:'8px 16px', flex:1 }}>
          <InfoRow icon={I.mail}     label="Email"          value={client.email}/>
          <InfoRow icon={I.phone}    label="Téléphone"      value={client.phone}/>
          <InfoRow icon={I.pin}      label="Localisation"   value={[client.city,client.country].filter(Boolean).join(', ')}/>
          <InfoRow icon={I.tag}      label="Adresse"        value={client.address}/>
          <InfoRow icon={I.vat}      label="N° TVA"         value={client.vat_number}/>
          <InfoRow icon={I.globe}    label="Pays"           value={client.country}/>
          <InfoRow icon={I.calendar} label="Dernier contact"value={fmtD(client.last_invoice_date||'')}/>
          <p style={{ fontSize:11, color:'#cbd5e1', textAlign:'center', marginTop:14, paddingBottom:4 }}>
            Client depuis le {fmtD(client.created_at)}
          </p>
        </div>

        {/* Actions */}
        <div style={{ padding:'14px 16px', borderTop:'1px solid #f1f5f9', display:'flex', gap:8 }}>
          <button onClick={onDelete} style={{
            flex:1, padding:'9px 0', borderRadius:10, cursor:'pointer',
            border:'1.5px solid #fecaca', background:'#fef2f2',
            color:'#ef4444', fontSize:13, fontWeight:600,
            display:'flex', alignItems:'center', justifyContent:'center', gap:6,
          }}>{I.trash} Supprimer</button>
          <button onClick={onEdit} style={{
            flex:2, padding:'9px 0', borderRadius:10, cursor:'pointer',
            border:'none', background:'linear-gradient(135deg,#6366f1,#8b5cf6)',
            color:'#fff', fontSize:13, fontWeight:700,
            display:'flex', alignItems:'center', justifyContent:'center', gap:6,
          }}>{I.edit} Modifier</button>
        </div>
      </div>
    </div>
  )
}

// ─── SortHeader ───────────────────────────────────────────────────────────────
function SortTh({ label, field, sort, dir, onSort }: {
  label: string; field: SortField
  sort: SortField; dir: SortDir
  onSort: (f: SortField) => void
}) {
  const active = sort === field
  return (
    <th
      onClick={() => onSort(field)}
      style={{
        padding:'12px 16px', textAlign:'left', fontSize:11, fontWeight:700,
        color: active ? '#6366f1' : '#94a3b8', textTransform:'uppercase',
        letterSpacing:'0.05em', whiteSpace:'nowrap', cursor:'pointer',
        userSelect:'none',
      }}
    >
      <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
        {label}
        <span style={{ opacity: active ? 1 : 0.3 }}>
          {active && dir === 'asc' ? I.sortUp : I.sortDown}
        </span>
      </span>
    </th>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────
export default function ClientsPage() {
  const [clients,  setClients]  = useState<Client[]>([])
  const [loading,  setLoading]  = useState(true)
  const [view,     setView]     = useState<ViewMode>('list')
  const [search,   setSearch]   = useState('')
  const [statusF,  setStatusF]  = useState('all')
  const [countryF, setCountryF] = useState('all')
  const [sortF,    setSortF]    = useState<SortField>('created_at')
  const [sortDir,  setSortDir]  = useState<SortDir>('desc')
  const [modal,    setModal]    = useState(false)
  const [editC,    setEditC]    = useState<Client | null>(null)
  const [viewC,    setViewC]    = useState<Client | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/clients')
      const d = await r.json()
      setClients(Array.isArray(d) ? d : d.data ?? [])
    } catch { setClients([]) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ── Filtrage + tri ─────────────────────────────────────────────────────────
  const filtered = clients
    .filter(c => {
      const q   = search.toLowerCase()
      const hit = !q || c.name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q)
        || c.city?.toLowerCase().includes(q) || c.vat_number?.toLowerCase().includes(q)
        || c.phone?.toLowerCase().includes(q) || c.country?.toLowerCase().includes(q)
      return hit
        && (statusF  === 'all' || c.status  === statusF)
        && (countryF === 'all' || c.country === countryF)
    })
    .sort((a, b) => {
      let va: string|number = '', vb: string|number = ''
      if (sortF === 'name')           { va = a.name||''; vb = b.name||'' }
      else if (sortF === 'created_at'){ va = a.created_at||''; vb = b.created_at||'' }
      else if (sortF === 'status')    { va = a.status||''; vb = b.status||'' }
      else if (sortF === 'total_revenue')  { va = a.total_revenue||0;  vb = b.total_revenue||0 }
      else if (sortF === 'invoices_count') { va = a.invoices_count||0; vb = b.invoices_count||0 }
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })

  function toggleSort(f: SortField) {
    if (sortF === f) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortF(f); setSortDir('asc') }
  }

  // ── CRUD ───────────────────────────────────────────────────────────────────
  async function save(form: typeof EMPTY) {
    if (editC) {
      await fetch(`/api/clients/${editC.id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify(form) })
    } else {
      await fetch('/api/clients', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(form) })
    }
    setModal(false); setEditC(null); load()
  }

  async function del(id: string) {
    await fetch(`/api/clients/${id}`, { method:'DELETE' })
    setDeleteId(null); setViewC(null); load()
  }

  function openEdit(c: Client) { setEditC(c); setViewC(null); setModal(true) }

  // ── Export CSV ─────────────────────────────────────────────────────────────
  function exportCSV() {
    const rows = [
      ['Nom','Email','Téléphone','Ville','Pays','TVA','Statut','Depuis'],
      ...filtered.map(c => [c.name,c.email,c.phone,c.city,c.country,c.vat_number,c.status,fmtD(c.created_at)])
    ]
    const csv  = rows.map(r => r.map(v=>`"${v||''}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a'); a.href=url; a.download='clients.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = {
    total:      clients.length,
    active:     clients.filter(c => c.status === 'active').length,
    prospect:   clients.filter(c => c.status === 'prospect').length,
    inactive:   clients.filter(c => c.status === 'inactive').length,
    revenue:    clients.reduce((s,c) => s + (c.total_revenue||0), 0),
  }

  // ── Pays disponibles ───────────────────────────────────────────────────────
  const availableCountries = [...new Set(clients.map(c => c.country).filter(Boolean))]

  return (
    <div style={{ padding:24, maxWidth:1600, margin:'0 auto' }}>
      <style>{`
        @keyframes spin     { to { transform:rotate(360deg) } }
        @keyframes slideUp  { from { opacity:0; transform:translateY(20px) } to { opacity:1; transform:none } }
        @keyframes slideLeft{ from { opacity:0; transform:translateX(20px) } to { opacity:1; transform:none } }
        .tr-row:hover td    { background:#fafbff !important; }
        .tr-row td          { transition:background 0.12s; }
        .card-grid          { transition:all 0.18s; }
        .card-grid:hover    { transform:translateY(-3px); box-shadow:0 8px 28px rgba(99,102,241,0.14) !important; }
        select, input       { font-family:inherit; }
      `}</style>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:22, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, color:'#0f172a', display:'flex', alignItems:'center', gap:9 }}>
            <span style={{ color:'#6366f1' }}>{I.user}</span> Clients
          </h1>
          <p style={{ fontSize:12, color:'#94a3b8', marginTop:3 }}>
            {stats.total} client(s) · CA total {fmt(stats.revenue)}
          </p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={exportCSV} style={{
            display:'flex', alignItems:'center', gap:7, padding:'9px 16px',
            borderRadius:10, border:'1.5px solid #e2e8f0', background:'#fff',
            fontSize:13, fontWeight:600, color:'#64748b', cursor:'pointer',
          }}>{I.export} Exporter CSV</button>
          <button onClick={() => { setEditC(null); setModal(true) }} style={{
            display:'flex', alignItems:'center', gap:7, padding:'9px 18px',
            borderRadius:10, border:'none',
            background:'linear-gradient(135deg,#6366f1,#8b5cf6)',
            fontSize:13, fontWeight:700, color:'#fff', cursor:'pointer',
            boxShadow:'0 4px 14px rgba(99,102,241,0.4)',
          }}>{I.plus} Nouveau client</button>
        </div>
      </div>

      {/* ── KPI strip ──────────────────────────────────────────────────────── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12, marginBottom:18 }}>
        {[
          { label:'Total clients', value:stats.total,           display:String(stats.total),    color:'#6366f1', border:'#c7d2fe', bg:'#eef2ff' },
          { label:'Actifs',        value:stats.active,          display:String(stats.active),   color:'#10b981', border:'#a7f3d0', bg:'#ecfdf5' },
          { label:'Prospects',     value:stats.prospect,        display:String(stats.prospect), color:'#3b82f6', border:'#bfdbfe', bg:'#eff6ff' },
          { label:'Inactifs',      value:stats.inactive,        display:String(stats.inactive), color:'#94a3b8', border:'#e2e8f0', bg:'#f8fafc' },
          { label:'CA total',      value:stats.revenue,         display:fmt(stats.revenue),     color:'#f59e0b', border:'#fde68a', bg:'#fffbeb' },
        ].map((s,i) => (
          <div key={i} style={{
            background:s.bg, borderRadius:14,
            border:`1.5px solid ${s.border}`,
            padding:'14px 16px',
            display:'flex', flexDirection:'column', gap:4,
          }}>
            <p style={{ fontSize:11, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.05em' }}>{s.label}</p>
            <p style={{ fontSize:20, fontWeight:800, color:s.color }}>{s.display}</p>
          </div>
        ))}
      </div>

      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <div style={{ ...card, padding:'12px 16px', display:'flex', gap:10, marginBottom:18, flexWrap:'wrap', alignItems:'center' }}>

        {/* Search */}
        <div style={{ flex:1, minWidth:220, position:'relative' }}>
          <span style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', color:'#94a3b8', pointerEvents:'none' }}>{I.search}</span>
          <input
            value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Nom, email, téléphone, TVA, ville…"
            style={{ ...inp, paddingLeft:34 }}
            onFocus={e=>{e.target.style.borderColor='#6366f1';e.target.style.boxShadow='0 0 0 3px rgba(99,102,241,0.1)'}}
            onBlur={e=>{e.target.style.borderColor='#e2e8f0';e.target.style.boxShadow='none'}}
          />
        </div>

        {/* Statut */}
        <select value={statusF} onChange={e=>setStatusF(e.target.value)} style={{ ...inp, width:'auto', minWidth:150 }}>
          <option value="all">Tous les statuts</option>
          <option value="active">✅ Actifs</option>
          <option value="prospect">🔵 Prospects</option>
          <option value="inactive">⚫ Inactifs</option>
        </select>

        {/* Pays */}
        <select value={countryF} onChange={e=>setCountryF(e.target.value)} style={{ ...inp, width:'auto', minWidth:140 }}>
          <option value="all">🌍 Tous les pays</option>
          {availableCountries.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {/* Tri */}
        <select value={`${sortF}:${sortDir}`}
          onChange={e => {
            const [f,d] = e.target.value.split(':') as [SortField,SortDir]
            setSortF(f); setSortDir(d)
          }}
          style={{ ...inp, width:'auto', minWidth:160 }}
        >
          <option value="created_at:desc">📅 Plus récents</option>
          <option value="created_at:asc">📅 Plus anciens</option>
          <option value="name:asc">🔤 Nom A→Z</option>
          <option value="name:desc">🔤 Nom Z→A</option>
          <option value="total_revenue:desc">💶 CA ↓</option>
          <option value="total_revenue:asc">💶 CA ↑</option>
          <option value="invoices_count:desc">📄 Factures ↓</option>
        </select>

        {/* Vue toggle */}
        <div style={{ display:'flex', gap:3, background:'#f1f5f9', padding:4, borderRadius:10, flexShrink:0 }}>
          {(['list','grid'] as ViewMode[]).map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding:7, border:'none', borderRadius:7, cursor:'pointer',
              background: view===v ? '#fff' : 'transparent',
              color: view===v ? '#6366f1' : '#94a3b8',
              boxShadow: view===v ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
              display:'flex', alignItems:'center', transition:'all 0.15s',
            }}>
              {v === 'list' ? I.list : I.grid}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:'80px 0' }}>
          <div style={{ textAlign:'center' }}>
            <div style={{ width:36, height:36, border:'3px solid #6366f1', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 12px' }}/>
            <p style={{ fontSize:13, color:'#94a3b8' }}>Chargement des clients…</p>
          </div>
        </div>

      ) : filtered.length === 0 ? (
        <div style={{ ...card, padding:60, textAlign:'center' }}>
          <div style={{ width:60, height:60, background:'#f8fafc', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px', color:'#cbd5e1' }}>{I.user}</div>
          <p style={{ fontSize:15, fontWeight:700, color:'#475569' }}>Aucun client trouvé</p>
          <p style={{ fontSize:13, color:'#94a3b8', marginTop:6 }}>
            {search || statusF !== 'all' || countryF !== 'all' ? 'Essayez de modifier vos filtres' : 'Commencez par créer votre premier client'}
          </p>
          {!search && statusF === 'all' && (
            <button onClick={() => setModal(true)} style={{
              marginTop:20, padding:'10px 24px', borderRadius:10, border:'none',
              background:'linear-gradient(135deg,#6366f1,#8b5cf6)',
              color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer',
              display:'inline-flex', alignItems:'center', gap:7,
            }}>{I.plus} Créer un client</button>
          )}
        </div>

      ) : view === 'list' ? (
        /* ════ LIST VIEW ════ */
        <div style={{ ...card, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ background:'#f8fafc', borderBottom:'2px solid #f1f5f9' }}>
                <SortTh label="Client"   field="name"           sort={sortF} dir={sortDir} onSort={toggleSort}/>
                <th style={{ padding:'12px 16px', textAlign:'left', fontSize:11, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em' }}>Contact</th>
                <th style={{ padding:'12px 16px', textAlign:'left', fontSize:11, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em' }}>Localisation</th>
                <th style={{ padding:'12px 16px', textAlign:'left', fontSize:11, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em' }}>N° TVA</th>
                <SortTh label="Factures" field="invoices_count" sort={sortF} dir={sortDir} onSort={toggleSort}/>
                <SortTh label="CA total" field="total_revenue"  sort={sortF} dir={sortDir} onSort={toggleSort}/>
                <SortTh label="Statut"   field="status"         sort={sortF} dir={sortDir} onSort={toggleSort}/>
                <SortTh label="Depuis"   field="created_at"     sort={sortF} dir={sortDir} onSort={toggleSort}/>
                <th style={{ padding:'12px 16px', textAlign:'center', fontSize:11, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => {
                const st  = STATUS[c.status]
                const col = avatarColor(c.name)
                return (
                  <tr key={c.id} className="tr-row" style={{ borderBottom:'1px solid #f8fafc' }}>

                    {/* Client */}
                    <td style={{ padding:'13px 16px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:11 }}>
                        <div style={{ width:38, height:38, borderRadius:11, background:col, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:13, fontWeight:700, flexShrink:0 }}>
                          {initials(c.name)}
                        </div>
                        <div>
                          <p style={{ fontWeight:700, color:'#0f172a', fontSize:13 }}>{c.name}</p>
                        </div>
                      </div>
                    </td>

                    {/* Contact */}
                    <td style={{ padding:'13px 16px' }}>
                      <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                        {c.email && (
                          <a href={`mailto:${c.email}`} style={{ display:'flex', alignItems:'center', gap:5, color:'#475569', fontSize:12, textDecoration:'none' }}>
                            <span style={{ color:'#cbd5e1' }}>{I.mail}</span>{c.email}
                          </a>
                        )}
                        {c.phone && (
                          <a href={`tel:${c.phone}`} style={{ display:'flex', alignItems:'center', gap:5, color:'#64748b', fontSize:12, textDecoration:'none' }}>
                            <span style={{ color:'#cbd5e1' }}>{I.phone}</span>{c.phone}
                          </a>
                        )}
                      </div>
                    </td>

                    {/* Localisation */}
                    <td style={{ padding:'13px 16px' }}>
                      <p style={{ display:'flex', alignItems:'center', gap:5, color:'#64748b', fontSize:12 }}>
                        <span style={{ color:'#cbd5e1' }}>{I.pin}</span>
                        {[c.city,c.country].filter(Boolean).join(', ') || '—'}
                      </p>
                    </td>

                    {/* TVA */}
                    <td style={{ padding:'13px 16px' }}>
                      <span style={{ fontFamily:'monospace', fontSize:12, color:'#64748b', background:'#f8fafc', padding:'3px 8px', borderRadius:6, border:'1px solid #f1f5f9' }}>
                        {c.vat_number || '—'}
                      </span>
                    </td>

                    {/* Factures */}
                    <td style={{ padding:'13px 16px', textAlign:'center' }}>
                      <span style={{ fontSize:13, fontWeight:700, color:'#6366f1' }}>
                        {c.invoices_count || 0}
                      </span>
                    </td>

                    {/* CA */}
                    <td style={{ padding:'13px 16px' }}>
                      <span style={{ fontSize:13, fontWeight:700, color:'#10b981' }}>
                        {fmt(c.total_revenue || 0)}
                      </span>
                    </td>

                    {/* Statut */}
                    <td style={{ padding:'13px 16px' }}>
                      <div style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'4px 10px', borderRadius:20, background:st.bg, border:`1px solid ${st.border}` }}>
                        <span style={{ width:6, height:6, borderRadius:'50%', background:st.dot }}/>
                        <span style={{ fontSize:11, fontWeight:700, color:st.color }}>{st.label}</span>
                      </div>
                    </td>

                    {/* Depuis */}
                    <td style={{ padding:'13px 16px' }}>
                      <span style={{ fontSize:12, color:'#94a3b8' }}>{fmtD(c.created_at)}</span>
                    </td>

                    {/* Actions — toujours visibles */}
                    <td style={{ padding:'13px 16px' }}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:5 }}>
                        <ActionBtn onClick={() => setViewC(c)}       title="Voir le détail"   icon={I.eye}   hoverBg='#eef2ff' hoverColor='#6366f1'/>
                        <ActionBtn onClick={() => openEdit(c)}       title="Modifier"         icon={I.edit}  hoverBg='#fef9c3' hoverColor='#d97706'/>
                        <ActionBtn onClick={() => setDeleteId(c.id)} title="Supprimer"        icon={I.trash} hoverBg='#fef2f2' hoverColor='#ef4444'/>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Footer table */}
          <div style={{ padding:'10px 18px', borderTop:'1px solid #f8fafc', display:'flex', alignItems:'center', justifyContent:'space-between', background:'#fafafa', fontSize:12, color:'#94a3b8' }}>
            <span>{filtered.length} résultat(s) sur {clients.length} client(s)</span>
            <span>CA filtré : <strong style={{ color:'#10b981' }}>{fmt(filtered.reduce((s,c)=>s+(c.total_revenue||0),0))}</strong></span>
          </div>
        </div>

      ) : (
        /* ════ GRID VIEW ════ */
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(290px,1fr))', gap:16 }}>
          {filtered.map(c => {
            const st  = STATUS[c.status]
            const col = avatarColor(c.name)
            return (
              <div key={c.id} className="card-grid" style={{
                background:'#fff', borderRadius:16,
                border:`1.5px solid ${st.border}`,
                boxShadow:`0 2px 8px ${col}12`,
                padding:0, overflow:'hidden',
              }}>
                {/* Top color band */}
                <div style={{ height:5, background:`linear-gradient(90deg,${col},${col}99)` }}/>

                <div style={{ padding:'18px 18px 14px' }}>
                  {/* Header card */}
                  <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:14 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:11 }}>
                      <div style={{ width:46, height:46, borderRadius:13, background:col, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:16, fontWeight:700, flexShrink:0 }}>
                        {initials(c.name)}
                      </div>
                      <div>
                        <p style={{ fontWeight:700, color:'#0f172a', fontSize:14 }}>{c.name}</p>
                        <div style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 9px', borderRadius:20, background:st.bg, border:`1px solid ${st.border}`, marginTop:5 }}>
                          <span style={{ width:5, height:5, borderRadius:'50%', background:st.dot }}/>
                          <span style={{ fontSize:11, fontWeight:700, color:st.color }}>{st.label}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Infos */}
                  <div style={{ display:'flex', flexDirection:'column', gap:6, fontSize:12, color:'#64748b', marginBottom:14 }}>
                    {c.email  && <p style={{ display:'flex', alignItems:'center', gap:7, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}><span style={{ color:'#cbd5e1', flexShrink:0 }}>{I.mail}</span>{c.email}</p>}
                    {c.phone  && <p style={{ display:'flex', alignItems:'center', gap:7 }}><span style={{ color:'#cbd5e1', flexShrink:0 }}>{I.phone}</span>{c.phone}</p>}
                    {(c.city||c.country) && <p style={{ display:'flex', alignItems:'center', gap:7 }}><span style={{ color:'#cbd5e1', flexShrink:0 }}>{I.pin}</span>{[c.city,c.country].filter(Boolean).join(', ')}</p>}
                  </div>

                  {/* Mini stats */}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:14 }}>
                    <div style={{ background:'#f8fafc', borderRadius:10, padding:'9px 12px', border:'1px solid #f1f5f9' }}>
                      <p style={{ fontSize:15, fontWeight:800, color:'#6366f1' }}>{c.invoices_count||0}</p>
                      <p style={{ fontSize:10, color:'#94a3b8', marginTop:2 }}>Factures</p>
                    </div>
                    <div style={{ background:'#f0fdf4', borderRadius:10, padding:'9px 12px', border:'1px solid #bbf7d0' }}>
                      <p style={{ fontSize:13, fontWeight:800, color:'#10b981' }}>{fmt(c.total_revenue||0)}</p>
                      <p style={{ fontSize:10, color:'#94a3b8', marginTop:2 }}>CA total</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display:'flex', gap:6, paddingTop:12, borderTop:'1px solid #f1f5f9' }}>
                    <ActionBtn onClick={() => setViewC(c)}       title="Voir"     icon={I.eye}   hoverBg='#eef2ff' hoverColor='#6366f1'/>
                    <ActionBtn onClick={() => openEdit(c)}       title="Modifier" icon={I.edit}  hoverBg='#fef9c3' hoverColor='#d97706'/>
                    <ActionBtn onClick={() => setDeleteId(c.id)} title="Supprimer"icon={I.trash} hoverBg='#fef2f2' hoverColor='#ef4444'/>
                    <div style={{ flex:1 }}/>
                    <span style={{ fontSize:11, color:'#94a3b8', alignSelf:'center' }}>{fmtD(c.created_at)}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Confirm Delete ─────────────────────────────────────────────────── */}
      {deleteId && (
        <div style={{ position:'fixed', inset:0, zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ position:'absolute', inset:0, background:'rgba(15,23,42,0.5)', backdropFilter:'blur(6px)' }} onClick={() => setDeleteId(null)}/>
          <div style={{ ...card, position:'relative', width:'100%', maxWidth:380, padding:28, textAlign:'center', zIndex:1, animation:'slideUp 0.2s ease' }}>
            <div style={{ width:52, height:52, background:'#fef2f2', border:'2px solid #fecaca', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px', color:'#ef4444' }}>{I.trash}</div>
            <h3 style={{ fontSize:16, fontWeight:700, color:'#0f172a', marginBottom:8 }}>Supprimer ce client ?</h3>
            <p style={{ fontSize:13, color:'#94a3b8', marginBottom:24, lineHeight:1.6 }}>Cette action est irréversible. Toutes les données associées à ce client seront perdues.</p>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setDeleteId(null)} style={{ flex:1, padding:'10px 0', borderRadius:10, border:'1.5px solid #e2e8f0', background:'#fff', fontSize:13, fontWeight:600, color:'#64748b', cursor:'pointer' }}>
                Annuler
              </button>
              <button onClick={() => del(deleteId)} style={{ flex:1, padding:'10px 0', borderRadius:10, border:'none', background:'#ef4444', fontSize:13, fontWeight:700, color:'#fff', cursor:'pointer' }}>
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal & Drawer ─────────────────────────────────────────────────── */}
      <Modal  open={modal}    onClose={() => { setModal(false); setEditC(null) }} onSave={save} initial={editC}/>
      <Drawer client={viewC} onClose={() => setViewC(null)} onEdit={() => openEdit(viewC!)} onDelete={() => { setDeleteId(viewC!.id); setViewC(null) }}/>
    </div>
  )
}


