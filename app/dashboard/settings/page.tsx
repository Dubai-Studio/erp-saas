'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

interface CompanySettings {
  company_name: string
  address: string
  city: string
  country: string
  vat_number: string
  email: string
  phone: string
  iban: string
  bic: string
}

const EMPTY: CompanySettings = {
  company_name: '', address: '', city: '', country: 'Belgique',
  vat_number: '', email: '', phone: '', iban: '', bic: '',
}

const inp: React.CSSProperties = {
  width: '100%', padding: '10px 13px',
  border: '1.5px solid #e2e8f0', borderRadius: 9,
  fontSize: 14, color: '#0f172a', background: '#fff',
  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
}
const lbl: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b',
  marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em',
}

export default function SettingsPage() {
  const [form, setForm]       = useState<CompanySettings>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [error, setError]     = useState('')
  const [userId, setUserId]   = useState<string | null>(null)

  useEffect(() => {
    const sb = getSupabase()
    sb.auth.getSession().then(async ({ data }) => {
      if (!data.session) return
      const uid = data.session.user.id
      setUserId(uid)

      const res = await fetch('/api/settings', {
        headers: { 'x-user-id': uid }
      })
      if (res.ok) {
        const d = await res.json()
        setForm({
          company_name: d.company_name || '',
          address:      d.address      || '',
          city:         d.city         || '',
          country:      d.country      || 'Belgique',
          vat_number:   d.vat_number   || '',
          email:        d.email        || '',
          phone:        d.phone        || '',
          iban:         d.iban         || '',
          bic:          d.bic          || '',
        })
      }
      setLoading(false)
    })
  }, [])

  const set = (k: keyof CompanySettings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!userId) return
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const j = await res.json()
        throw new Error(j?.error || `Erreur ${res.status}`)
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div style={{ width: 36, height: 36, border: '3px solid #6366f1', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div style={{ padding: '28px 32px', maxWidth: 780, margin: '0 auto' }}>

      {/* En-tête */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>
          Paramètres de la société
        </h1>
        <p style={{ color: '#64748b', fontSize: 14, marginTop: 6 }}>
          Ces informations apparaîtront sur toutes vos factures et documents générés.
        </p>
      </div>

      <form onSubmit={handleSave}>

        {/* Identité */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '24px 28px', marginBottom: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1e3a5f', margin: '0 0 18px' }}>
            🏢 Identité de la société
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 20px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>Nom de la société *</label>
              <input style={inp} value={form.company_name} onChange={set('company_name')} required placeholder="Ma Société SPRL" />
            </div>
            <div>
              <label style={lbl}>Numéro de TVA</label>
              <input style={inp} value={form.vat_number} onChange={set('vat_number')} placeholder="BE 0000.000.000" />
            </div>
            <div>
              <label style={lbl}>Email</label>
              <input style={inp} type="email" value={form.email} onChange={set('email')} placeholder="contact@masociete.be" />
            </div>
            <div>
              <label style={lbl}>Téléphone</label>
              <input style={inp} value={form.phone} onChange={set('phone')} placeholder="+32 2 000 00 00" />
            </div>
          </div>
        </div>

        {/* Adresse */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '24px 28px', marginBottom: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1e3a5f', margin: '0 0 18px' }}>
            📍 Adresse
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 20px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>Adresse (rue + numéro)</label>
              <input style={inp} value={form.address} onChange={set('address')} placeholder="Rue de la Loi 1" />
            </div>
            <div>
              <label style={lbl}>Ville + Code postal</label>
              <input style={inp} value={form.city} onChange={set('city')} placeholder="1000 Bruxelles" />
            </div>
            <div>
              <label style={lbl}>Pays</label>
              <input style={inp} value={form.country} onChange={set('country')} placeholder="Belgique" />
            </div>
          </div>
        </div>

        {/* Coordonnées bancaires */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '24px 28px', marginBottom: 28, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1e3a5f', margin: '0 0 18px' }}>
            🏦 Coordonnées bancaires
          </h2>
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16, marginTop: -8 }}>
            Apparaissent en bas de chaque facture.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 20px' }}>
            <div>
              <label style={lbl}>IBAN</label>
              <input style={inp} value={form.iban} onChange={set('iban')} placeholder="BE00 0000 0000 0000" />
            </div>
            <div>
              <label style={lbl}>BIC / SWIFT</label>
              <input style={inp} value={form.bic} onChange={set('bic')} placeholder="GEBABEBB" />
            </div>
          </div>
        </div>

        {/* Messages */}
        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 9, padding: '12px 16px', marginBottom: 16, color: '#dc2626', fontSize: 14 }}>
            {error}
          </div>
        )}
        {saved && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 9, padding: '12px 16px', marginBottom: 16, color: '#16a34a', fontSize: 14, fontWeight: 600 }}>
            ✅ Paramètres sauvegardés avec succès !
          </div>
        )}

        <button type="submit" disabled={saving} style={{
          padding: '12px 32px', background: saving ? '#94a3b8' : '#1e3a5f',
          color: '#fff', border: 'none', borderRadius: 10,
          fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
          transition: 'background 0.15s',
        }}>
          {saving ? 'Sauvegarde...' : 'Sauvegarder les paramètres'}
        </button>

      </form>
    </div>
  )
}
