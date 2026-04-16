'use client'

import { useState, useEffect, useCallback } from 'react'
import React from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Client { id: string; name: string }
interface Project {
  id: string; name: string; description: string; client_id: string; client_name?: string
  status: 'planning'|'active'|'on_hold'|'completed'|'cancelled'
  priority: 'low'|'medium'|'high'|'critical'
  start_date: string; end_date: string; budget: number; spent: number
  progress: number; manager: string; tags?: string; created_at: string
}

// ─── Constantes ───────────────────────────────────────────────────────────────
const STATUS: Record<string,{label:string;color:string;bg:string;border:string;dot:string}> = {
  planning:  {label:'Planification',color:'#1d4ed8',bg:'#eff6ff',border:'#bfdbfe',dot:'#3b82f6'},
  active:    {label:'En cours',     color:'#15803d',bg:'#f0fdf4',border:'#bbf7d0',dot:'#22c55e'},
  on_hold:   {label:'En pause',     color:'#92400e',bg:'#fffbeb',border:'#fde68a',dot:'#f59e0b'},
  completed: {label:'Terminé',      color:'#6b21a8',bg:'#faf5ff',border:'#e9d5ff',dot:'#a855f7'},
  cancelled: {label:'Annulé',       color:'#991b1b',bg:'#fef2f2',border:'#fecaca',dot:'#ef4444'},
}
const PRIORITY: Record<string,{label:string;color:string;bg:string;border:string}> = {
  low:      {label:'Faible',   color:'#64748b',bg:'#f8fafc',border:'#e2e8f0'},
  medium:   {label:'Moyen',    color:'#1d4ed8',bg:'#eff6ff',border:'#bfdbfe'},
  high:     {label:'Élevé',    color:'#92400e',bg:'#fffbeb',border:'#fde68a'},
  critical: {label:'Critique', color:'#991b1b',bg:'#fef2f2',border:'#fecaca'},
}

const EMPTY: Omit<Project,'id'|'created_at'|'client_name'> = {
  name:'', description:'', client_id:'', status:'planning', priority:'medium',
  start_date:'', end_date:'', budget:0, spent:0, progress:0, manager:'', tags:'',
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const card: React.CSSProperties = {
  background:'#fff', borderRadius:16,
  boxShadow:'0 1px 3px rgba(0,0,0,0.05),0 4px 12px rgba(0,0,0,0.04)',
  border:'1px solid #f1f5f9',
}
const inp: React.CSSProperties = {
  width:'100%', padding:'9px 12px', border:'1.5px solid #e2e8f0',
  borderRadius:9, fontSize:13, color:'#1e293b', background:'#fff',
  outline:'none', boxSizing:'border-box',
}
const lbl: React.CSSProperties = {
  display:'block', fontSize:11, fontWeight:700, color:'#64748b',
  marginBottom:5, textTransform:'uppercase', letterSpacing:'0.04em',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt  = (n:number) => new Intl.NumberFormat('fr-BE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n||0)
const fmtD = (d:string) => d ? new Date(d).toLocaleDateString('fr-BE',{day:'2-digit',month:'short',year:'numeric'}) : '—'
const today = () => new Date().toISOString().split('T')[0]

function daysLeft(end:string): number|null {
  if(!end) return null
  const diff = new Date(end).getTime() - Date.now()
  return Math.ceil(diff / 86400000)
}
function budgetPct(spent:number, budget:number) {
  if(!budget) return 0
  return Math.min(Math.round((spent/budget)*100), 100)
}
function budgetColor(spent:number, budget:number) {
  const p = budget ? (spent/budget)*100 : 0
  if(p >= 100) return '#ef4444'
  if(p >= 80)  return '#f59e0b'
  return '#10b981'
}

// ─── Icons ────────────────────────────────────────────────────────────────────
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
  user:     <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>,
  calendar: <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  refresh:  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>,
  export:   <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  filter:   <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
  tag:      <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>,
  trending: <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
  alert:    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  proj:     <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>,
  briefcase:<svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="12"/></svg>,
  clock:    <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  euro:     <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 10h12M4 14h12M19 5A9 9 0 1 1 5 19"/></svg>,
  close:    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  progress: <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M12 6v6l4 2"/></svg>,
  building: <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6M9 13h6M9 17h4"/></svg>,
  sort:     <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="9" y1="18" x2="15" y2="18"/></svg>,
}

// ─── StatusBadge ──────────────────────────────────────────────────────────────
function StatusBadge({status}:{status:string}) {
  const s = STATUS[status]||STATUS.planning
  return (
    <div style={{display:'inline-flex',alignItems:'center',gap:5,padding:'3px 10px',borderRadius:20,background:s.bg,border:`1px solid ${s.border}`}}>
      <span style={{width:6,height:6,borderRadius:'50%',background:s.dot,flexShrink:0}}/>
      <span style={{fontSize:11,fontWeight:700,color:s.color}}>{s.label}</span>
    </div>
  )
}

// ─── PriorityBadge ────────────────────────────────────────────────────────────
function PriorityBadge({priority}:{priority:string}) {
  const p = PRIORITY[priority]||PRIORITY.medium
  return (
    <div style={{display:'inline-flex',alignItems:'center',gap:4,padding:'2px 8px',borderRadius:6,background:p.bg,border:`1px solid ${p.border}`}}>
      <span style={{fontSize:10,fontWeight:700,color:p.color,textTransform:'uppercase',letterSpacing:'0.04em'}}>{p.label}</span>
    </div>
  )
}

// ─── ProgressBar ──────────────────────────────────────────────────────────────
function ProgressBar({value,color,height=8}:{value:number;color:string;height?:number}) {
  return (
    <div style={{width:'100%',height,background:'#f1f5f9',borderRadius:height,overflow:'hidden'}}>
      <div style={{
        height:'100%', width:`${Math.min(value,100)}%`,
        background:color, borderRadius:height,
        transition:'width 0.4s cubic-bezier(0.4,0,0.2,1)',
      }}/>
    </div>
  )
}

// ─── DaysLeftChip ────────────────────────────────────────────────────────────
function DaysLeftChip({end_date,status}:{end_date:string;status:string}) {
  if(!end_date || status==='completed' || status==='cancelled') return null
  const d = daysLeft(end_date)
  if(d===null) return null
  const overdue = d < 0
  const urgent  = d >= 0 && d <= 7
  const color   = overdue ? '#dc2626' : urgent ? '#d97706' : '#64748b'
  const bg      = overdue ? '#fef2f2' : urgent  ? '#fffbeb' : '#f8fafc'
  return (
    <div style={{display:'inline-flex',alignItems:'center',gap:4,padding:'2px 8px',borderRadius:6,background:bg,fontSize:11,fontWeight:600,color}}>
      {I.clock}
      {overdue ? `${Math.abs(d)}j en retard` : d===0 ? 'Aujourd\'hui' : `${d}j restants`}
    </div>
  )
}

// ─── MODAL Projet ─────────────────────────────────────────────────────────────
function ProjectModal({ open, onClose, onSave, initial, clients }:{
  open:boolean; onClose:()=>void
  onSave:(d:typeof EMPTY)=>Promise<void>
  initial?:Project|null; clients:Client[]
}) {
  const [form,   setForm]   = useState({...EMPTY})
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const [tab,    setTab]    = useState<'info'|'finance'|'notes'>('info')

  useEffect(()=>{
    setForm(initial ? {
      name:        initial.name||'',
      description: initial.description||'',
      client_id:   initial.client_id||'',
      status:      initial.status||'planning',
      priority:    initial.priority||'medium',
      start_date:  initial.start_date?.split('T')[0]||'',
      end_date:    initial.end_date?.split('T')[0]||'',
      budget:      initial.budget||0,
      spent:       initial.spent||0,
      progress:    initial.progress||0,
      manager:     initial.manager||'',
      tags:        initial.tags||'',
    } : {...EMPTY})
    setError(''); setTab('info')
  },[initial,open])

  if(!open) return null
  const f = (k:keyof typeof EMPTY, v:string|number) => setForm(p=>({...p,[k]:v}))
  const budgetLeft = (form.budget||0) - (form.spent||0)

  async function submit(e:React.FormEvent) {
    e.preventDefault()
    if(!form.name.trim()){ setError('Le nom est obligatoire.'); return }
    setSaving(true); setError('')
    try { await onSave(form) }
    catch { setError('Erreur lors de la sauvegarde.') }
    setSaving(false)
  }

  const TS = (t:string):React.CSSProperties => ({
    padding:'10px 18px', border:'none', background:'transparent',
    fontSize:13, fontWeight:600, cursor:'pointer',
    color: tab===t ? '#fff' : 'rgba(255,255,255,0.55)',
    borderBottom: tab===t ? '2px solid #fff' : '2px solid transparent',
    transition:'all 0.15s',
  })

  return (
    <div style={{position:'fixed',inset:0,zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div style={{position:'absolute',inset:0,background:'rgba(15,23,42,0.55)',backdropFilter:'blur(6px)'}} onClick={onClose}/>
      <div style={{...card,position:'relative',width:'100%',maxWidth:700,maxHeight:'93vh',overflowY:'auto',zIndex:1,display:'flex',flexDirection:'column'}}>

        {/* Header */}
        <div style={{background:'linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%)',padding:'22px 24px 0',borderRadius:'16px 16px 0 0',flexShrink:0}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
            <div>
              <h2 style={{fontSize:18,fontWeight:800,color:'#fff'}}>
                {initial ? `✏️ Modifier — ${initial.name}` : '🚀 Nouveau projet'}
              </h2>
              <p style={{fontSize:12,color:'rgba(255,255,255,0.65)',marginTop:3}}>Gestion de projet · Next-ERP</p>
            </div>
            <button onClick={onClose} style={{background:'rgba(255,255,255,0.15)',border:'none',borderRadius:8,padding:8,cursor:'pointer',color:'#fff',display:'flex'}}>{I.x}</button>
          </div>
          <div style={{display:'flex',gap:2}}>
            {(['info','finance','notes'] as const).map(t=>(
              <button key={t} style={TS(t)} onClick={()=>setTab(t)}>
                {t==='info'?'Informations':t==='finance'?'Budget & Finances':'Notes & Tags'}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={submit} style={{flex:1,overflowY:'auto'}}>
          {error&&(
            <div style={{margin:'14px 24px 0',padding:'10px 14px',background:'#fef2f2',border:'1.5px solid #fecaca',borderRadius:10,fontSize:13,color:'#dc2626',display:'flex',alignItems:'center',gap:8}}>
              {I.alert}{error}
            </div>
          )}

          {/* Tab INFO */}
          {tab==='info'&&(
            <div style={{padding:24,display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
              <div style={{gridColumn:'1/-1'}}>
                <label style={lbl}>Nom du projet <span style={{color:'#ef4444'}}>*</span></label>
                <input style={inp} value={form.name} onChange={e=>f('name',e.target.value)} placeholder="Ex : Refonte site e-commerce"/>
              </div>
              <div>
                <label style={lbl}>Client</label>
                <select style={{...inp,width:'100%'}} value={form.client_id} onChange={e=>f('client_id',e.target.value)}>
                  <option value="">— Aucun client —</option>
                  {clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Responsable</label>
                <input style={inp} value={form.manager} onChange={e=>f('manager',e.target.value)} placeholder="Jean Dupont"/>
              </div>
              <div>
                <label style={lbl}>Statut</label>
                <select style={{...inp,width:'100%'}} value={form.status} onChange={e=>f('status',e.target.value as Project['status'])}>
                  {Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Priorité</label>
                <select style={{...inp,width:'100%'}} value={form.priority} onChange={e=>f('priority',e.target.value as Project['priority'])}>
                  {Object.entries(PRIORITY).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Date de début</label>
                <input style={inp} type="date" value={form.start_date} onChange={e=>f('start_date',e.target.value)}/>
              </div>
              <div>
                <label style={lbl}>Date de fin prévue</label>
                <input style={inp} type="date" value={form.end_date} onChange={e=>f('end_date',e.target.value)}/>
              </div>
              <div style={{gridColumn:'1/-1'}}>
                <label style={lbl}>Progression globale : <strong style={{color:'#7c3aed'}}>{form.progress}%</strong></label>
                <input type="range" min="0" max="100" value={form.progress}
                  onChange={e=>f('progress',+e.target.value)}
                  style={{width:'100%',accentColor:'#7c3aed',height:6,cursor:'pointer'}}/>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:'#94a3b8',marginTop:4}}>
                  <span>0%</span><span>50%</span><span>100%</span>
                </div>
              </div>
            </div>
          )}

          {/* Tab FINANCE */}
          {tab==='finance'&&(
            <div style={{padding:24,display:'flex',flexDirection:'column',gap:14}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
                <div>
                  <label style={lbl}>Budget total (€)</label>
                  <input style={{...inp,fontWeight:700}} type="number" min="0" step="100" value={form.budget||''} onChange={e=>f('budget',+e.target.value)} placeholder="0"/>
                </div>
                <div>
                  <label style={lbl}>Montant dépensé (€)</label>
                  <input style={{...inp,fontWeight:700,color: form.spent>(form.budget||0)?'#ef4444':'#1e293b'}} type="number" min="0" step="100" value={form.spent||''} onChange={e=>f('spent',+e.target.value)} placeholder="0"/>
                </div>
              </div>

              {/* Budget visual */}
              {(form.budget||0)>0&&(
                <div style={{background:'#f8fafc',borderRadius:14,padding:18,border:'1px solid #f1f5f9'}}>
                  <p style={{fontSize:11,fontWeight:700,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:14}}>Répartition budgétaire</p>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:16}}>
                    {[
                      {l:'Budget total',  v:fmt(form.budget||0),  c:'#6366f1'},
                      {l:'Dépensé',       v:fmt(form.spent||0),   c: (form.spent||0)>(form.budget||0)?'#ef4444':'#f59e0b'},
                      {l:'Disponible',    v:fmt(Math.max(budgetLeft,0)), c:'#10b981'},
                    ].map((b,i)=>(
                      <div key={i} style={{textAlign:'center',padding:'10px 0',background:'#fff',borderRadius:10,border:'1px solid #e2e8f0'}}>
                        <p style={{fontSize:10,color:'#94a3b8',marginBottom:4}}>{b.l}</p>
                        <p style={{fontSize:14,fontWeight:800,color:b.c}}>{b.v}</p>
                      </div>
                    ))}
                  </div>
                  <ProgressBar
                    value={budgetPct(form.spent||0,form.budget||0)}
                    color={budgetColor(form.spent||0,form.budget||0)}
                    height={10}
                  />
                  <div style={{display:'flex',justifyContent:'space-between',marginTop:6,fontSize:11,color:'#94a3b8'}}>
                    <span>Consommé : <strong style={{color:'#0f172a'}}>{budgetPct(form.spent||0,form.budget||0)}%</strong></span>
                    {budgetLeft<0&&<span style={{color:'#ef4444',fontWeight:700}}>Dépassement : {fmt(Math.abs(budgetLeft))}</span>}
                  </div>
                </div>
              )}

              <div style={{background:'#eef2ff',borderRadius:12,padding:14,border:'1.5px solid #c7d2fe',fontSize:13,color:'#4338ca'}}>
                <p style={{fontWeight:700,marginBottom:4,display:'flex',alignItems:'center',gap:6}}>{I.trending} Impact comptable</p>
                <p style={{fontSize:12,color:'#6366f1',lineHeight:1.6}}>
                  Les montants budget et dépensé sont automatiquement remontés dans le tableau de bord financier et la comptabilité analytique.
                </p>
              </div>
            </div>
          )}

          {/* Tab NOTES */}
          {tab==='notes'&&(
            <div style={{padding:24,display:'flex',flexDirection:'column',gap:14}}>
              <div>
                <label style={lbl}>Description / Notes</label>
                <textarea style={{...inp,minHeight:130,resize:'vertical',fontFamily:'inherit',lineHeight:1.6}}
                  placeholder="Objectifs, livrables, contraintes, remarques…"
                  value={form.description} onChange={e=>f('description',e.target.value)}/>
              </div>
              <div>
                <label style={lbl}>Tags (séparés par des virgules)</label>
                <input style={inp} value={form.tags||''} onChange={e=>f('tags',e.target.value)} placeholder="design, dev, urgence, client-vip…"/>
                {form.tags&&(
                  <div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:8}}>
                    {form.tags.split(',').map(t=>t.trim()).filter(Boolean).map((t,i)=>(
                      <span key={i} style={{padding:'3px 10px',borderRadius:20,background:'#f3e8ff',color:'#7c3aed',fontSize:11,fontWeight:600}}>{t}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <div style={{padding:'14px 24px',borderTop:'1px solid #f1f5f9',display:'flex',gap:10,flexShrink:0}}>
            <button type="button" onClick={onClose} style={{flex:1,padding:'10px 0',borderRadius:10,border:'1.5px solid #e2e8f0',background:'#fff',fontSize:13,fontWeight:600,color:'#64748b',cursor:'pointer'}}>Annuler</button>
            <button type="submit" disabled={saving} style={{flex:2,padding:'10px 0',borderRadius:10,border:'none',background:saving?'#a5b4fc':'linear-gradient(135deg,#4f46e5,#7c3aed)',fontSize:13,fontWeight:700,color:'#fff',cursor:saving?'not-allowed':'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
              {saving
                ? <><div style={{width:14,height:14,border:'2px solid #fff',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/> Enregistrement…</>
                : <>{I.check} {initial?'Mettre à jour':'Créer le projet'}</>
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── DRAWER Détail Projet ─────────────────────────────────────────────────────
function ProjectDrawer({ project, clients, onClose, onEdit, onDelete, onStatusChange, onProgressChange }:{
  project:Project|null; clients:Client[]
  onClose:()=>void; onEdit:()=>void; onDelete:()=>void
  onStatusChange:(id:string,s:Project['status'])=>void
  onProgressChange:(id:string,p:number)=>void
}) {
  const [prog, setProg] = useState(0)
  useEffect(()=>{ if(project) setProg(project.progress||0) },[project])
  if(!project) return null

  const cli = clients.find(c=>c.id===project.client_id)
  const bPct = budgetPct(project.spent||0, project.budget||0)
  const bCol = budgetColor(project.spent||0, project.budget||0)
  const days = daysLeft(project.end_date)

  return (
    <div style={{position:'fixed',inset:0,zIndex:190,display:'flex',justifyContent:'flex-end'}}>
      <div style={{position:'absolute',inset:0,background:'rgba(15,23,42,0.35)',backdropFilter:'blur(3px)'}} onClick={onClose}/>
      <div style={{...card,position:'relative',width:420,height:'100%',borderRadius:'20px 0 0 20px',display:'flex',flexDirection:'column',overflowY:'auto',zIndex:1}}>

        {/* Header */}
        <div style={{background:'linear-gradient(135deg,#4f46e5,#7c3aed)',padding:'20px 20px 22px',borderRadius:'20px 0 0 0',flexShrink:0}}>
          <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:12}}>
            <div style={{flex:1,marginRight:10}}>
              <p style={{fontSize:11,color:'rgba(255,255,255,0.6)',marginBottom:4}}>Détail projet</p>
              <h3 style={{fontSize:18,fontWeight:800,color:'#fff',lineHeight:1.3}}>{project.name}</h3>
              {cli&&<p style={{fontSize:12,color:'rgba(255,255,255,0.7)',marginTop:4,display:'flex',alignItems:'center',gap:4}}>{I.building} {cli.name}</p>}
            </div>
            <button onClick={onClose} style={{background:'rgba(255,255,255,0.15)',border:'none',borderRadius:8,padding:7,cursor:'pointer',color:'#fff',display:'flex',flexShrink:0}}>{I.x}</button>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
            <StatusBadge status={project.status}/>
            <PriorityBadge priority={project.priority||'medium'}/>
            <DaysLeftChip end_date={project.end_date} status={project.status}/>
          </div>
        </div>

        <div style={{flex:1,overflowY:'auto',padding:18,display:'flex',flexDirection:'column',gap:14}}>

          {/* Progression interactive */}
          <div style={{background:'#f8fafc',borderRadius:14,padding:16,border:'1px solid #f1f5f9'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
              <p style={{fontSize:11,fontWeight:700,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'0.05em'}}>Progression</p>
              <span style={{fontSize:20,fontWeight:800,color:'#7c3aed'}}>{prog}%</span>
            </div>
            <ProgressBar value={prog} color={prog>=100?'#10b981':'linear-gradient(90deg,#4f46e5,#7c3aed)'} height={12}/>
            <div style={{marginTop:12}}>
              <input type="range" min="0" max="100" value={prog}
                onChange={e=>setProg(+e.target.value)}
                style={{width:'100%',accentColor:'#7c3aed',cursor:'pointer'}}/>
              {prog!==project.progress&&(
                <button onClick={()=>onProgressChange(project.id,prog)}
                  style={{marginTop:8,width:'100%',padding:'8px 0',borderRadius:9,border:'none',background:'linear-gradient(135deg,#4f46e5,#7c3aed)',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
                  {I.check} Enregistrer {prog}%
                </button>
              )}
            </div>
          </div>

          {/* Budget */}
          {(project.budget||0)>0&&(
            <div style={{background:'#f8fafc',borderRadius:14,padding:16,border:'1px solid #f1f5f9'}}>
              <p style={{fontSize:11,fontWeight:700,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:12}}>Budget</p>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:12}}>
                {[
                  {l:'Total',      v:fmt(project.budget||0),  c:'#6366f1'},
                  {l:'Dépensé',    v:fmt(project.spent||0),   c: bPct>=100?'#ef4444':'#f59e0b'},
                  {l:'Restant',    v:fmt(Math.max((project.budget||0)-(project.spent||0),0)), c:'#10b981'},
                ].map((b,i)=>(
                  <div key={i} style={{textAlign:'center',padding:'10px 6px',background:'#fff',borderRadius:10,border:'1px solid #e2e8f0'}}>
                    <p style={{fontSize:9,color:'#94a3b8',marginBottom:3,textTransform:'uppercase',letterSpacing:'0.04em'}}>{b.l}</p>
                    <p style={{fontSize:12,fontWeight:800,color:b.c}}>{b.v}</p>
                  </div>
                ))}
              </div>
              <ProgressBar value={bPct} color={bCol} height={10}/>
              <p style={{fontSize:11,color:'#94a3b8',marginTop:6,textAlign:'right'}}>{bPct}% consommé</p>
              {(project.spent||0)>(project.budget||0)&&(
                <div style={{marginTop:8,padding:'8px 12px',background:'#fef2f2',borderRadius:9,border:'1px solid #fecaca',fontSize:12,color:'#dc2626',fontWeight:600,display:'flex',alignItems:'center',gap:6}}>
                  {I.alert} Dépassement de {fmt((project.spent||0)-(project.budget||0))}
                </div>
              )}
            </div>
          )}

          {/* Infos */}
          <div style={{background:'#f8fafc',borderRadius:14,padding:16,border:'1px solid #f1f5f9'}}>
            <p style={{fontSize:11,fontWeight:700,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:12}}>Informations</p>
            {[
              {l:'Responsable',  v:project.manager||'—',        i:I.user},
              {l:'Début',        v:fmtD(project.start_date),    i:I.calendar},
              {l:'Fin prévue',   v:fmtD(project.end_date),      i:I.calendar},
              {l:'Créé le',      v:fmtD(project.created_at),    i:I.clock},
            ].map((r,i,arr)=>(
              <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:i<arr.length-1?'1px solid #f1f5f9':'none'}}>
                <span style={{fontSize:12,color:'#94a3b8',display:'flex',alignItems:'center',gap:5}}>{r.i}{r.l}</span>
                <span style={{fontSize:13,fontWeight:600,color:'#0f172a'}}>{r.v}</span>
              </div>
            ))}
          </div>

          {/* Description */}
          {project.description&&(
            <div style={{background:'#fffbeb',borderRadius:14,padding:16,border:'1px solid #fde68a'}}>
              <p style={{fontSize:11,fontWeight:700,color:'#92400e',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:6}}>Description</p>
              <p style={{fontSize:13,color:'#78350f',lineHeight:1.7}}>{project.description}</p>
            </div>
          )}

          {/* Tags */}
          {project.tags&&(
            <div style={{background:'#faf5ff',borderRadius:14,padding:16,border:'1px solid #e9d5ff'}}>
              <p style={{fontSize:11,fontWeight:700,color:'#6b21a8',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:8,display:'flex',alignItems:'center',gap:5}}>{I.tag} Tags</p>
              <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                {project.tags.split(',').map(t=>t.trim()).filter(Boolean).map((t,i)=>(
                  <span key={i} style={{padding:'3px 10px',borderRadius:20,background:'#f3e8ff',color:'#7c3aed',fontSize:11,fontWeight:600,border:'1px solid #e9d5ff'}}>{t}</span>
                ))}
              </div>
            </div>
          )}

          {/* Changer statut */}
          <div style={{background:'#f8fafc',borderRadius:14,padding:16,border:'1px solid #f1f5f9'}}>
            <p style={{fontSize:11,fontWeight:700,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:10}}>Changer le statut</p>
            <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
              {Object.entries(STATUS).filter(([k])=>k!==project.status).map(([k,v])=>(
                <button key={k} onClick={()=>onStatusChange(project.id,k as Project['status'])}
                  style={{padding:'5px 12px',borderRadius:20,border:`1px solid ${v.dot}40`,background:v.bg,color:v.color,fontSize:11,fontWeight:700,cursor:'pointer',transition:'all 0.15s'}}>
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div style={{padding:'14px 16px',borderTop:'1px solid #f1f5f9',display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,flexShrink:0}}>
          <button onClick={onEdit} style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6,padding:'10px 0',borderRadius:10,border:'none',background:'linear-gradient(135deg,#4f46e5,#7c3aed)',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'}}>
            {I.edit} Modifier
          </button>
          <button onClick={onDelete} style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6,padding:'10px 0',borderRadius:10,border:'1.5px solid #fecaca',background:'#fef2f2',color:'#ef4444',fontSize:13,fontWeight:600,cursor:'pointer'}}>
            {I.trash} Supprimer
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── PAGE PRINCIPALE ──────────────────────────────────────────────────────────
export default function ProjectsPage() {
  const [projects,  setProjects]  = useState<Project[]>([])
  const [clients,   setClients]   = useState<Client[]>([])
  const [loading,   setLoading]   = useState(true)
  const [view,      setView]      = useState<'list'|'grid'>('grid')
  const [search,    setSearch]    = useState('')
  const [statusF,   setStatusF]   = useState('all')
  const [priorityF, setPriorityF] = useState('all')
  const [clientF,   setClientF]   = useState('all')
  const [sortBy,    setSortBy]    = useState<'name'|'budget'|'progress'|'end_date'>('name')
  const [modal,     setModal]     = useState(false)
  const [editP,     setEditP]     = useState<Project|null>(null)
  const [viewP,     setViewP]     = useState<Project|null>(null)
  const [deleteId,  setDeleteId]  = useState<string|null>(null)

  // ── Load ─────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const fetchSafe = async (url:string) => {
        try {
          const r = await fetch(url)
          if(!r.ok) return []
          const t = await r.text()
          if(!t||t.trim()==='') return []
          return JSON.parse(t)
        } catch { return [] }
      }
      const [pd, cd] = await Promise.all([fetchSafe('/api/projects'), fetchSafe('/api/clients')])
      const list = (Array.isArray(pd) ? pd : pd.data ?? []).map((p:Project)=>({
        ...p,
        client_name: (Array.isArray(cd) ? cd : cd.data ?? []).find((c:Client)=>c.id===p.client_id)?.name||'—',
      }))
      setProjects(list)
      setClients(Array.isArray(cd) ? cd : cd.data ?? [])
    } catch(e) {
      console.error('ProjectsPage load error:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(()=>{ load() },[load])

  // ── Filtrage + Tri ────────────────────────────────────────────────────────
  const filtered = projects
    .filter(p => {
      const q = search.toLowerCase()
      const hit = !q || p.name?.toLowerCase().includes(q) || p.manager?.toLowerCase().includes(q) || p.client_name?.toLowerCase().includes(q) || p.tags?.toLowerCase().includes(q)
      return hit
        && (statusF==='all'   || p.status===statusF)
        && (priorityF==='all' || p.priority===priorityF)
        && (clientF==='all'   || p.client_id===clientF)
    })
    .sort((a,b)=>{
      if(sortBy==='budget')   return (b.budget||0)-(a.budget||0)
      if(sortBy==='progress') return (b.progress||0)-(a.progress||0)
      if(sortBy==='end_date') return (a.end_date||'').localeCompare(b.end_date||'')
      return a.name.localeCompare(b.name)
    })

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpi = {
    total:     projects.length,
    active:    projects.filter(p=>p.status==='active').length,
    completed: projects.filter(p=>p.status==='completed').length,
    onHold:    projects.filter(p=>p.status==='on_hold').length,
    overdue:   projects.filter(p=>p.status!=='completed'&&p.status!=='cancelled'&&p.end_date&&daysLeft(p.end_date)!==null&&(daysLeft(p.end_date) as number)<0).length,
    budgetTotal:  projects.reduce((s,p)=>s+(p.budget||0),0),
    budgetSpent:  projects.reduce((s,p)=>s+(p.spent||0),0),
    avgProgress:  projects.length ? Math.round(projects.reduce((s,p)=>s+(p.progress||0),0)/projects.length) : 0,
  }

  const hasFilters = !!(search||statusF!=='all'||priorityF!=='all'||clientF!=='all')

  // ── CRUD ──────────────────────────────────────────────────────────────────
  async function save(form:typeof EMPTY) {
    if(editP) await fetch(`/api/projects/${editP.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)})
    else      await fetch('/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)})
    setModal(false); setEditP(null); load()
  }

  async function del(id:string) {
    await fetch(`/api/projects/${id}`,{method:'DELETE'})
    setDeleteId(null); load()
  }

  async function changeStatus(id:string, status:Project['status']) {
    await fetch(`/api/projects/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})})
    load()
  }

  async function changeProgress(id:string, progress:number) {
    await fetch(`/api/projects/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({progress})})
    setViewP(v=>v?{...v,progress}:v)
    load()
  }

  function openEdit(p:Project) { setEditP(p); setViewP(null); setModal(true) }
  function openDelete(p:Project) { setDeleteId(p.id); setViewP(null) }

  // ── Export CSV ────────────────────────────────────────────────────────────
  function exportCSV() {
    const rows = [
      ['Projet','Client','Responsable','Statut','Priorité','Début','Fin','Budget','Dépensé','Progression'],
      ...filtered.map(p=>[
        p.name, p.client_name||'', p.manager||'',
        STATUS[p.status]?.label||'', PRIORITY[p.priority||'medium']?.label||'',
        fmtD(p.start_date), fmtD(p.end_date),
        p.budget, p.spent, `${p.progress}%`
      ])
    ]
    const csv = rows.map(r=>r.map(v=>`"${v||''}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'}))
    a.download = 'projets.csv'; a.click()
  }

  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div style={{padding:24,maxWidth:1600,margin:'0 auto'}}>
      <style>{`
        @keyframes spin { to { transform:rotate(360deg) } }
        .rh:hover td { background:#f8fbff !important; }
        .rh td        { transition:background 0.1s; }
        .pc           { transition:all 0.18s; }
        .pc:hover     { transform:translateY(-3px); box-shadow:0 8px 28px rgba(0,0,0,0.10) !important; }
        .ab           { opacity:1; transition:opacity 0.15s; }
        tr:hover .ab  { opacity:1; }
        select,input  { font-family:inherit; }
        input:focus,select:focus,textarea:focus { outline:none; border-color:#7c3aed !important; box-shadow:0 0 0 3px rgba(124,58,237,0.1); }
        input[type=range]:focus { box-shadow:none !important; border:none !important; }
      `}</style>

      {/* ── Header ── */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:22,flexWrap:'wrap',gap:12}}>
        <div>
          <h1 style={{fontSize:22,fontWeight:800,color:'#0f172a',display:'flex',alignItems:'center',gap:9}}>
            <span style={{color:'#7c3aed'}}>{I.proj}</span> Projets
          </h1>
          <p style={{fontSize:12,color:'#94a3b8',marginTop:3}}>{kpi.total} projet(s) · Progression moyenne : <strong style={{color:'#7c3aed'}}>{kpi.avgProgress}%</strong></p>
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <button onClick={exportCSV} style={{display:'flex',alignItems:'center',gap:7,padding:'9px 14px',borderRadius:10,border:'1.5px solid #e2e8f0',background:'#fff',fontSize:13,fontWeight:600,color:'#64748b',cursor:'pointer'}}>
            {I.export} Export CSV
          </button>
          <button onClick={load} style={{display:'flex',alignItems:'center',gap:7,padding:'9px 12px',borderRadius:10,border:'1.5px solid #e2e8f0',background:'#fff',fontSize:13,fontWeight:600,color:'#64748b',cursor:'pointer'}}>
            {I.refresh}
          </button>
          <button onClick={()=>{setEditP(null);setModal(true)}} style={{display:'flex',alignItems:'center',gap:7,padding:'9px 18px',borderRadius:10,border:'none',background:'linear-gradient(135deg,#4f46e5,#7c3aed)',fontSize:13,fontWeight:700,color:'#fff',cursor:'pointer',boxShadow:'0 4px 14px rgba(124,58,237,0.35)'}}>
            {I.plus} Nouveau projet
          </button>
        </div>
      </div>

      {/* ── KPI Strip ── */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:12,marginBottom:18}}>
        {[
          {l:'Total',          v:kpi.total,                 isN:false, color:'#7c3aed', border:'#e9d5ff', bg:'#faf5ff'},
          {l:'En cours',       v:kpi.active,                isN:false, color:'#10b981', border:'#a7f3d0', bg:'#ecfdf5'},
          {l:'Terminés',       v:kpi.completed,             isN:false, color:'#6366f1', border:'#c7d2fe', bg:'#eef2ff'},
          {l:'En pause',       v:kpi.onHold,                isN:false, color:'#f59e0b', border:'#fde68a', bg:'#fffbeb'},
          {l:'En retard',      v:kpi.overdue,               isN:false, color:'#ef4444', border:'#fecaca', bg:'#fef2f2'},
          {l:'Budget total',   v:kpi.budgetTotal,           isN:true,  color:'#0f172a', border:'#e2e8f0', bg:'#f8fafc'},
          {l:'Total dépensé',  v:kpi.budgetSpent,           isN:true,  color:'#f59e0b', border:'#fde68a', bg:'#fffbeb'},
          {l:'Progression moy',v:kpi.avgProgress,           isN:false, color:'#7c3aed', border:'#e9d5ff', bg:'#faf5ff', isPct:true},
        ].map((k,i)=>(
          <div key={i} style={{background:k.bg,borderRadius:13,border:`1.5px solid ${k.border}`,padding:'12px 14px'}}>
            <p style={{fontSize:10,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:4}}>{k.l}</p>
            <p style={{fontSize:(k as any).isPct||!k.isN?20:13,fontWeight:800,color:k.color}}>
              {k.isN ? fmt(k.v as number) : (k as any).isPct ? `${k.v}%` : k.v}
            </p>
            {(k as any).isPct&&(
              <div style={{marginTop:6}}>
                <ProgressBar value={k.v as number} color='linear-gradient(90deg,#4f46e5,#7c3aed)' height={4}/>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Barre globale budget ── */}
      {kpi.budgetTotal>0&&(
        <div style={{...card,padding:'14px 18px',marginBottom:18}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
            <span style={{fontSize:12,fontWeight:700,color:'#64748b',display:'flex',alignItems:'center',gap:6}}>{I.euro} Budget global consolidé</span>
            <span style={{fontSize:12,color:'#94a3b8'}}>{fmt(kpi.budgetSpent)} / {fmt(kpi.budgetTotal)} · <strong style={{color:budgetColor(kpi.budgetSpent,kpi.budgetTotal)}}>{budgetPct(kpi.budgetSpent,kpi.budgetTotal)}%</strong></span>
          </div>
          <ProgressBar value={budgetPct(kpi.budgetSpent,kpi.budgetTotal)} color={budgetColor(kpi.budgetSpent,kpi.budgetTotal)} height={10}/>
        </div>
      )}

      {/* ── Toolbar ── */}
      <div style={{...card,padding:'12px 14px',marginBottom:16}}>
        <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center',marginBottom:10}}>
          <div style={{flex:1,minWidth:200,position:'relative'}}>
            <span style={{position:'absolute',left:11,top:'50%',transform:'translateY(-50%)',color:'#94a3b8',pointerEvents:'none'}}>{I.search}</span>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Projet, client, responsable, tag…" style={{...inp,paddingLeft:34}}/>
          </div>
          <select value={statusF} onChange={e=>setStatusF(e.target.value)} style={{...inp,width:'auto',minWidth:150}}>
            <option value="all">Tous les statuts</option>
            {Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={priorityF} onChange={e=>setPriorityF(e.target.value)} style={{...inp,width:'auto',minWidth:140}}>
            <option value="all">Toutes priorités</option>
            {Object.entries(PRIORITY).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={clientF} onChange={e=>setClientF(e.target.value)} style={{...inp,width:'auto',minWidth:160}}>
            <option value="all">Tous les clients</option>
            {clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={sortBy} onChange={e=>setSortBy(e.target.value as typeof sortBy)} style={{...inp,width:'auto',minWidth:150}}>
            <option value="name">Trier : Nom</option>
            <option value="budget">Trier : Budget</option>
            <option value="progress">Trier : Progression</option>
            <option value="end_date">Trier : Échéance</option>
          </select>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
          {hasFilters&&(
            <button onClick={()=>{setSearch('');setStatusF('all');setPriorityF('all');setClientF('all')}}
              style={{display:'flex',alignItems:'center',gap:6,padding:'6px 12px',borderRadius:8,border:'1.5px solid #fecaca',background:'#fef2f2',color:'#ef4444',fontSize:12,fontWeight:600,cursor:'pointer'}}>
              {I.x} Réinitialiser
            </button>
          )}
          <span style={{fontSize:12,color:'#94a3b8',marginLeft:4}}>{filtered.length} résultat(s)</span>
          <div style={{marginLeft:'auto',display:'flex',gap:3,background:'#f1f5f9',padding:4,borderRadius:10}}>
            {(['list','grid'] as const).map(v=>(
              <button key={v} onClick={()=>setView(v)}
                style={{padding:7,border:'none',borderRadius:7,cursor:'pointer',background:view===v?'#fff':'transparent',color:view===v?'#7c3aed':'#94a3b8',boxShadow:view===v?'0 1px 4px rgba(0,0,0,0.10)':'none',display:'flex',transition:'all 0.15s'}}>
                {v==='list'?I.list:I.grid}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      {loading ? (
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',padding:'80px 0'}}>
          <div style={{textAlign:'center'}}>
            <div style={{width:36,height:36,border:'3px solid #7c3aed',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto 12px'}}/>
            <p style={{fontSize:13,color:'#94a3b8'}}>Chargement…</p>
          </div>
        </div>

      ) : filtered.length===0 ? (
        <div style={{...card,padding:60,textAlign:'center'}}>
          <div style={{width:56,height:56,background:'#faf5ff',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px',color:'#a855f7'}}>{I.proj}</div>
          <p style={{fontSize:15,fontWeight:700,color:'#475569'}}>Aucun projet trouvé</p>
          <p style={{fontSize:13,color:'#94a3b8',marginTop:6}}>{hasFilters?'Modifiez vos filtres':'Créez votre premier projet'}</p>
          {!hasFilters&&(
            <button onClick={()=>setModal(true)} style={{marginTop:20,padding:'10px 24px',borderRadius:10,border:'none',background:'linear-gradient(135deg,#4f46e5,#7c3aed)',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',display:'inline-flex',alignItems:'center',gap:7}}>
              {I.plus} Nouveau projet
            </button>
          )}
        </div>

      ) : view==='list' ? (
        /* ── VUE LISTE ── */
        <div style={{...card,overflow:'hidden'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead>
              <tr style={{background:'#f8fafc',borderBottom:'2px solid #f1f5f9'}}>
                {['Projet','Client','Responsable','Priorité','Budget / Dépensé','Progression','Échéance','Statut','Actions'].map((h,i)=>(
                  <th key={h} style={{padding:'11px 14px',textAlign:i===8?'center':'left',fontSize:10,fontWeight:700,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'0.05em',whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(p=>{
                const bPct = budgetPct(p.spent||0, p.budget||0)
                const bCol = budgetColor(p.spent||0, p.budget||0)
                const days = daysLeft(p.end_date)
                return (
                  <tr key={p.id} className="rh" style={{borderBottom:'1px solid #f8fafc',cursor:'pointer'}} onClick={()=>setViewP(p)}>
                    <td style={{padding:'12px 14px'}}>
                      <p style={{fontWeight:700,color:'#0f172a',fontSize:13}}>{p.name}</p>
                      {p.tags&&<p style={{fontSize:10,color:'#a855f7',marginTop:2}}>{p.tags.split(',').slice(0,2).map(t=>t.trim()).join(' · ')}</p>}
                    </td>
                    <td style={{padding:'12px 14px',color:'#64748b',fontSize:12}}>{p.client_name}</td>
                    <td style={{padding:'12px 14px'}}>
                      <p style={{display:'flex',alignItems:'center',gap:4,color:'#64748b',fontSize:12}}>{I.user}{p.manager||'—'}</p>
                    </td>
                    <td style={{padding:'12px 14px'}}>
                      <PriorityBadge priority={p.priority||'medium'}/>
                    </td>
                    <td style={{padding:'12px 14px',minWidth:160}}>
                      {p.budget>0?(
                        <>
                          <div style={{display:'flex',justifyContent:'space-between',fontSize:11,marginBottom:4}}>
                            <span style={{fontWeight:700,color:'#0f172a'}}>{fmt(p.budget)}</span>
                            <span style={{color:bPct>=100?'#ef4444':'#64748b'}}>{fmt(p.spent||0)}</span>
                          </div>
                          <ProgressBar value={bPct} color={bCol} height={5}/>
                          <p style={{fontSize:10,color:'#94a3b8',marginTop:3,textAlign:'right'}}>{bPct}% consommé</p>
                        </>
                      ):<span style={{fontSize:12,color:'#cbd5e1'}}>—</span>}
                    </td>
                    <td style={{padding:'12px 14px',minWidth:140}}>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <div style={{flex:1}}>
                          <ProgressBar value={p.progress||0} color={p.progress>=100?'#10b981':'linear-gradient(90deg,#4f46e5,#7c3aed)'} height={7}/>
                        </div>
                        <span style={{fontSize:12,fontWeight:700,color:'#475569',minWidth:32,textAlign:'right'}}>{p.progress||0}%</span>
                      </div>
                    </td>
                    <td style={{padding:'12px 14px'}}>
                      <p style={{fontSize:12,color:'#64748b'}}>{fmtD(p.end_date)}</p>
                      {days!==null&&p.status!=='completed'&&p.status!=='cancelled'&&(
                        <p style={{fontSize:10,color:days<0?'#ef4444':days<=7?'#f59e0b':'#94a3b8',marginTop:2,fontWeight:days<=7?700:400}}>
                          {days<0?`${Math.abs(days)}j retard`:days===0?'Aujourd\'hui':`${days}j`}
                        </p>
                      )}
                    </td>
                    <td style={{padding:'12px 14px'}}>
                      <StatusBadge status={p.status}/>
                    </td>
                    <td style={{padding:'12px 14px'}} onClick={e=>e.stopPropagation()}>
                      <div className="ab" style={{display:'flex',alignItems:'center',justifyContent:'center',gap:4}}>
                        <button title="Voir" onClick={()=>setViewP(p)}
                          style={{height:30,width:30,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:8,border:'none',cursor:'pointer',background:'#f8fafc',color:'#94a3b8',transition:'all 0.15s'}}
                          onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='#eef2ff';(e.currentTarget as HTMLElement).style.color='#6366f1'}}
                          onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='#f8fafc';(e.currentTarget as HTMLElement).style.color='#94a3b8'}}>
                          {I.eye}
                        </button>
                        <button title="Modifier" onClick={()=>openEdit(p)}
                          style={{height:30,width:30,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:8,border:'none',cursor:'pointer',background:'#f8fafc',color:'#94a3b8',transition:'all 0.15s'}}
                          onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='#fef9c3';(e.currentTarget as HTMLElement).style.color='#d97706'}}
                          onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='#f8fafc';(e.currentTarget as HTMLElement).style.color='#94a3b8'}}>
                          {I.edit}
                        </button>
                        <button title="Supprimer" onClick={()=>setDeleteId(p.id)}
                          style={{height:30,width:30,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:8,border:'none',cursor:'pointer',background:'#f8fafc',color:'#94a3b8',transition:'all 0.15s'}}
                          onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='#fef2f2';(e.currentTarget as HTMLElement).style.color='#ef4444'}}
                          onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='#f8fafc';(e.currentTarget as HTMLElement).style.color='#94a3b8'}}>
                          {I.trash}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div style={{padding:'9px 16px',borderTop:'1px solid #f8fafc',display:'flex',justifyContent:'space-between',background:'#fafafa',fontSize:12,color:'#94a3b8'}}>
            <span>{filtered.length} résultat(s) sur {projects.length}</span>
            <span>Budget filtré : <strong style={{color:'#7c3aed'}}>{fmt(filtered.reduce((s,p)=>s+(p.budget||0),0))}</strong></span>
          </div>
        </div>

      ) : (
        /* ── VUE GRILLE ── */
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(330px,1fr))',gap:16}}>
          {filtered.map(p=>{
            const bPct = budgetPct(p.spent||0, p.budget||0)
            const bCol = budgetColor(p.spent||0, p.budget||0)
            const days = daysLeft(p.end_date)
            const pri  = PRIORITY[p.priority||'medium']

            return (
              <div key={p.id} className="pc" style={{...card,overflow:'hidden',cursor:'pointer'}} onClick={()=>setViewP(p)}>
                {/* Top accent color by priority */}
                <div style={{height:4,background:
                  p.priority==='critical'?'linear-gradient(90deg,#ef4444,#dc2626)':
                  p.priority==='high'    ?'linear-gradient(90deg,#f59e0b,#d97706)':
                  p.priority==='medium'  ?'linear-gradient(90deg,#4f46e5,#7c3aed)':
                  'linear-gradient(90deg,#94a3b8,#64748b)'
                }}/>
                <div style={{padding:'16px 16px 14px'}}>

                  {/* Title + Status */}
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
                    <div style={{flex:1,marginRight:10}}>
                      <p style={{fontWeight:800,color:'#0f172a',fontSize:14,lineHeight:1.3}}>{p.name}</p>
                      {p.description&&<p style={{fontSize:11,color:'#94a3b8',marginTop:4,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical' as const,overflow:'hidden'}}>{p.description}</p>}
                    </div>
                    <StatusBadge status={p.status}/>
                  </div>

                  {/* Meta */}
                  <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:12}}>
                    <PriorityBadge priority={p.priority||'medium'}/>
                    <DaysLeftChip end_date={p.end_date} status={p.status}/>
                  </div>

                  {/* Client / Manager */}
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}>
                    {p.client_name!=='—'&&(
                      <div style={{background:'#f8fafc',borderRadius:9,padding:'8px 10px'}}>
                        <p style={{fontSize:9,color:'#94a3b8',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:2}}>Client</p>
                        <p style={{fontSize:12,fontWeight:600,color:'#475569',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.client_name}</p>
                      </div>
                    )}
                    {p.manager&&(
                      <div style={{background:'#f8fafc',borderRadius:9,padding:'8px 10px'}}>
                        <p style={{fontSize:9,color:'#94a3b8',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:2}}>Responsable</p>
                        <p style={{fontSize:12,fontWeight:600,color:'#475569',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.manager}</p>
                      </div>
                    )}
                  </div>

                  {/* Progression */}
                  <div style={{marginBottom:10}}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:5}}>
                      <span style={{fontSize:11,color:'#64748b',fontWeight:600}}>Progression</span>
                      <span style={{fontSize:12,fontWeight:800,color:p.progress>=100?'#10b981':'#7c3aed'}}>{p.progress||0}%</span>
                    </div>
                    <ProgressBar value={p.progress||0} color={p.progress>=100?'#10b981':'linear-gradient(90deg,#4f46e5,#7c3aed)'} height={8}/>
                  </div>

                  {/* Budget */}
                  {p.budget>0&&(
                    <div style={{marginBottom:12}}>
                      <div style={{display:'flex',justifyContent:'space-between',marginBottom:5}}>
                        <span style={{fontSize:11,color:'#64748b',fontWeight:600}}>Budget</span>
                        <span style={{fontSize:11,color:'#94a3b8'}}>{fmt(p.spent||0)} / {fmt(p.budget)}</span>
                      </div>
                      <ProgressBar value={bPct} color={bCol} height={6}/>
                      {bPct>=80&&(
                        <p style={{fontSize:10,color:bPct>=100?'#ef4444':'#f59e0b',marginTop:3,fontWeight:700,display:'flex',alignItems:'center',gap:3}}>
                          {I.alert} {bPct>=100?'Budget dépassé':'Budget presque atteint'}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Tags */}
                  {p.tags&&(
                    <div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:12}}>
                      {p.tags.split(',').map(t=>t.trim()).filter(Boolean).slice(0,3).map((t,i)=>(
                        <span key={i} style={{padding:'2px 8px',borderRadius:20,background:'#f3e8ff',color:'#7c3aed',fontSize:10,fontWeight:600}}>{t}</span>
                      ))}
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{display:'flex',gap:6,paddingTop:10,borderTop:'1px solid #f1f5f9'}} onClick={e=>e.stopPropagation()}>
                    <button onClick={()=>setViewP(p)} title="Voir"
                      style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:5,padding:'8px 0',borderRadius:8,border:'none',background:'#f8fafc',fontSize:12,fontWeight:600,color:'#64748b',cursor:'pointer',transition:'all 0.15s'}}
                      onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='#eef2ff';(e.currentTarget as HTMLElement).style.color='#6366f1'}}
                      onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='#f8fafc';(e.currentTarget as HTMLElement).style.color='#64748b'}}>
                      {I.eye} Voir
                    </button>
                    <button onClick={()=>openEdit(p)} title="Modifier"
                      style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:5,padding:'8px 0',borderRadius:8,border:'none',background:'#f8fafc',fontSize:12,fontWeight:600,color:'#64748b',cursor:'pointer',transition:'all 0.15s'}}
                      onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='#fef9c3';(e.currentTarget as HTMLElement).style.color='#d97706'}}
                      onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='#f8fafc';(e.currentTarget as HTMLElement).style.color='#64748b'}}>
                      {I.edit} Modifier
                    </button>
                    <button onClick={()=>setDeleteId(p.id)} title="Supprimer"
                      style={{width:34,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:8,border:'none',background:'#f8fafc',color:'#94a3b8',cursor:'pointer',transition:'all 0.15s'}}
                      onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='#fef2f2';(e.currentTarget as HTMLElement).style.color='#ef4444'}}
                      onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='#f8fafc';(e.currentTarget as HTMLElement).style.color='#94a3b8'}}>
                      {I.trash}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Confirm Delete ── */}
      {deleteId&&(
        <div style={{position:'fixed',inset:0,zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
          <div style={{position:'absolute',inset:0,background:'rgba(15,23,42,0.5)',backdropFilter:'blur(6px)'}} onClick={()=>setDeleteId(null)}/>
          <div style={{...card,position:'relative',width:'100%',maxWidth:380,padding:28,textAlign:'center',zIndex:1}}>
            <div style={{width:52,height:52,background:'#fef2f2',border:'2px solid #fecaca',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px',color:'#ef4444'}}>{I.trash}</div>
            <h3 style={{fontSize:16,fontWeight:700,color:'#0f172a',marginBottom:8}}>Supprimer ce projet ?</h3>
            <p style={{fontSize:13,color:'#94a3b8',marginBottom:22,lineHeight:1.6}}>Cette action est irréversible. Toutes les données du projet seront supprimées.</p>
            <div style={{display:'flex',gap:10}}>
              <button onClick={()=>setDeleteId(null)} style={{flex:1,padding:'10px 0',borderRadius:10,border:'1.5px solid #e2e8f0',background:'#fff',fontSize:13,fontWeight:600,color:'#64748b',cursor:'pointer'}}>Annuler</button>
              <button onClick={()=>del(deleteId)} style={{flex:1,padding:'10px 0',borderRadius:10,border:'none',background:'#ef4444',fontSize:13,fontWeight:700,color:'#fff',cursor:'pointer'}}>Supprimer</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modals & Drawers ── */}
      <ProjectModal
        open={modal} onClose={()=>{setModal(false);setEditP(null)}}
        onSave={save} initial={editP} clients={clients}
      />
      <ProjectDrawer
        project={viewP} clients={clients}
        onClose={()=>setViewP(null)}
        onEdit={()=>{ if(viewP) openEdit(viewP) }}
        onDelete={()=>{ if(viewP) openDelete(viewP) }}
        onStatusChange={changeStatus}
        onProgressChange={changeProgress}
      />
    </div>
  )
}




