// app/dashboard/settings/page.tsx
'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'

function getSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

interface CompanySettings {
  company_name:     string
  address:          string
  city:             string
  zip_code:         string
  country:          string
  vat_number:       string
  email:            string
  phone:            string
  iban:             string
  bic:              string
  default_vat:      number
  default_currency: string
  logo_url:         string
  footer_notes:     string
  peppol_id:        string
}

// Pré-remplissage avec les données de VERTUOSE S.P.R.L. (société par défaut
// fournie par l'utilisateur)
const DEFAULTS: CompanySettings = {
  company_name:     'VERTUOSE S.P.R.L.',
  address:          'Chaussée de Forest 146',
  city:             'B-1060 Bruxelles (Saint-Gilles)',
  zip_code:         '1060',
  country:          'Belgique',
  vat_number:       'BE 0811.234.358',
  email:            '',
  phone:            '0484 701 235',
  iban:             'BE47 7370 6594 4380',
  bic:              'KREDBEBB',
  default_vat:      21,
  default_currency: 'EUR',
  logo_url:         '',
  footer_notes:     '',
  peppol_id:        '',
}

const EMPTY: CompanySettings = {
  company_name: '', address: '', city: '', zip_code: '', country: 'Belgique',
  vat_number: '', email: '', phone: '', iban: '', bic: '',
  default_vat: 21, default_currency: 'EUR',
  logo_url: '', footer_notes: '', peppol_id: '',
}

const inp: React.CSSProperties = {
  width: '100%', padding: '10px 13px',
  border: '1.5px solid #e2e8f0', borderRadius: 9,
  fontSize: 14, color: '#0f172a', background: '#fff',
  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
}
const inpR: React.CSSProperties = { ...inp, borderColor: '#fecaca' }
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

  // Password-lock admin state
  const [unlocked, setUnlocked]     = useState(false)
  const [pinInput, setPinInput]     = useState('')
  const [pinError, setPinError]     = useState('')
  const [adminPinHash, setAdminPinHash] = useState<string | null>(null)
  const [hasPin, setHasPin]         = useState(false)
  const [pinSetup, setPinSetup]     = useState(false)
  const [newPin, setNewPin]         = useState('')
  const [newPinConfirm, setNewPinConfirm] = useState('')

  // Hash un PIN avec SHA-256 + sel (côté client). Le serveur compare avec
  // crypto.subtle.timingSafeEqual — égalité en temps constant.
  async function hashPin(pin: string, salt: string): Promise<string> {
    const enc = new TextEncoder()
    const data = enc.encode(`${salt}:${pin}`)
    const buf = await crypto.subtle.digest('SHA-256', data)
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0')).join('')
  }
  async function constantTimeEqual(a: string, b: string): Promise<boolean> {
    if (a.length !== b.length) return false
    let diff = 0
    for (let i = 0; i < a.length; i++) {
      diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
    }
    return diff === 0
  }

  // Charge settings + admin_pin_hash
  useEffect(() => {
    const sb = getSupabase()
    sb.auth.getSession().then(async ({ data }) => {
      if (!data.session) return
      const uid = data.session.user.id
      setUserId(uid)

      // 1. Charge les settings. NOTE: l'API renvoie { data: ... } (wrappé via
      //    ok() dans lib/api-helpers). Il faut dé-wrapper pour lire les champs.
      const res = await fetch('/api/settings', { credentials: 'include' })
      if (res.ok) {
        const json = await res.json()
        const d = (json?.data ?? json) as Partial<CompanySettings> | null
        const merged: CompanySettings = {
          company_name:     d?.company_name     ?? DEFAULTS.company_name,
          address:          d?.address          ?? DEFAULTS.address,
          city:             d?.city             ?? DEFAULTS.city,
          zip_code:         d?.zip_code         ?? DEFAULTS.zip_code,
          country:          d?.country          ?? DEFAULTS.country,
          vat_number:       d?.vat_number       ?? DEFAULTS.vat_number,
          email:            d?.email            ?? '',
          phone:            d?.phone            ?? DEFAULTS.phone,
          iban:             d?.iban             ?? DEFAULTS.iban,
          bic:              d?.bic              ?? DEFAULTS.bic,
          default_vat:      d?.default_vat      ?? DEFAULTS.default_vat,
          default_currency: d?.default_currency ?? DEFAULTS.default_currency,
          logo_url:         d?.logo_url         ?? '',
          footer_notes:     d?.footer_notes     ?? '',
          peppol_id:        d?.peppol_id        ?? '',
        }
        setForm(merged)
      } else {
        setForm(DEFAULTS)
      }

      // 2. Vérifie si un PIN admin est déjà défini
      const pinRes = await fetch('/api/admin-pin', { credentials: 'include' })
      if (pinRes.ok) {
        const pd = await pinRes.json()
        setHasPin(!!pd.hasPin)
        setAdminPinHash(pd.pinHash ?? null)
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
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error ?? `Erreur ${res.status}`)
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setSaving(false)
    }
  }

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault()
    setPinError('')
    if (!adminPinHash) { setPinError('Aucun PIN défini'); return }
    const h = await hashPin(pinInput, userId ?? '')
    const ok = await constantTimeEqual(h, adminPinHash)
    if (!ok) { setPinError('PIN incorrect'); setPinInput(''); return }
    setUnlocked(true)
    setPinInput('')
  }

  async function handleSetPin(e: React.FormEvent) {
    e.preventDefault()
    setPinError('')
    if (newPin.length < 4) { setPinError('Au moins 4 caractères'); return }
    if (newPin !== newPinConfirm) { setPinError('Les deux PINs ne correspondent pas'); return }
    const h = await hashPin(newPin, userId ?? '')
    const res = await fetch('/api/admin-pin', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinHash: h }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setPinError(j?.error ?? `Erreur ${res.status}`)
      return
    }
    setAdminPinHash(h)
    setHasPin(true)
    setPinSetup(false)
    setUnlocked(true)
    setNewPin(''); setNewPinConfirm('')
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div style={{ width: 36, height: 36, border: '3px solid #6366f1', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  // === Lock screen (PIN admin) ===
  if (!unlocked) {
    return (
      <div style={{ padding: '28px 32px', maxWidth: 480, margin: '4rem auto', background: '#fff', borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ display: 'inline-flex', width: 56, height: 56, borderRadius: 14, background: '#fef3c7', color: '#d97706', alignItems: 'center', justifyContent: 'center', fontSize: 28, marginBottom: 12 }}>🔒</div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: 0 }}>Paramètres — Accès restreint</h1>
          <p style={{ color: '#64748b', fontSize: 13, marginTop: 8 }}>
            Page réservée à l'administrateur. Saisissez le PIN de sécurité.
          </p>
        </div>

        {!hasPin ? (
          <form onSubmit={handleSetPin}>
            <p style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 9, padding: '10px 14px', color: '#1e40af', fontSize: 13, marginBottom: 16 }}>
              Aucun PIN défini. Créez-en un (4 caractères minimum) pour protéger cette page.
            </p>
            <label style={lbl}>Nouveau PIN</label>
            <input type="password" style={inp} value={newPin} onChange={e => setNewPin(e.target.value)} required minLength={4} autoFocus />
            <label style={{ ...lbl, marginTop: 14 }}>Confirmer le PIN</label>
            <input type="password" style={inp} value={newPinConfirm} onChange={e => setNewPinConfirm(e.target.value)} required minLength={4} />
            {pinError && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 9, padding: '10px 14px', marginTop: 12, color: '#dc2626', fontSize: 13 }}>{pinError}</div>}
            <button type="submit" style={{ marginTop: 16, width: '100%', padding: '12px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              Définir le PIN et accéder
            </button>
          </form>
        ) : (
          <form onSubmit={handleUnlock}>
            <label style={lbl}>PIN administrateur</label>
            <input
              type="password"
              style={pinError ? inpR : inp}
              value={pinInput}
              onChange={e => { setPinInput(e.target.value); setPinError('') }}
              autoFocus
              required
            />
            {pinError && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 9, padding: '10px 14px', marginTop: 12, color: '#dc2626', fontSize: 13 }}>{pinError}</div>}
            <button type="submit" style={{ marginTop: 16, width: '100%', padding: '12px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              Déverrouiller
            </button>
            <button
              type="button"
              onClick={() => setPinSetup(true)}
              style={{ marginTop: 12, width: '100%', padding: '8px', background: 'transparent', color: '#64748b', border: 'none', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}
            >
              PIN oublié ? Le redéfinir
            </button>
            {pinSetup && (
              <form onSubmit={handleSetPin} style={{ marginTop: 16, padding: 16, background: '#f8fafc', borderRadius: 9 }}>
                <label style={lbl}>Nouveau PIN</label>
                <input type="password" style={inp} value={newPin} onChange={e => setNewPin(e.target.value)} required minLength={4} />
                <label style={{ ...lbl, marginTop: 12 }}>Confirmer</label>
                <input type="password" style={inp} value={newPinConfirm} onChange={e => setNewPinConfirm(e.target.value)} required minLength={4} />
                <button type="submit" style={{ marginTop: 12, padding: '10px 16px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  Enregistrer le nouveau PIN
                </button>
              </form>
            )}
          </form>
        )}
      </div>
    )
  }

  // === Unlocked : affiche le formulaire ===
  return (
    <div style={{ padding: '28px 32px', maxWidth: 780, margin: '0 auto' }}>

      {/* En-tête */}
      <div style={{ marginBottom: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>
            Paramètres de la société
          </h1>
          <p style={{ color: '#64748b', fontSize: 14, marginTop: 6 }}>
            Ces informations apparaîtront sur toutes vos factures et documents générés.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => {
              if (confirm('Restaurer les valeurs par défaut VERTUOSE S.P.R.L. ?')) {
                setForm(DEFAULTS)
              }
            }}
            style={{ padding: '8px 14px', background: '#fff7ed', color: '#9a3412', border: '1px solid #fed7aa', borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            title="Pré-remplit avec les valeurs VERTUOSE S.P.R.L. — n'oubliez pas de cliquer Sauvegarder ensuite"
          >
            🏢 Restaurer VERTUOSE
          </button>
          <button
            type="button"
            onClick={() => setUnlocked(false)}
            style={{ padding: '8px 14px', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            🔒 Verrouiller
          </button>
        </div>
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
              <input style={inp} value={form.company_name} onChange={set('company_name')} required />
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
              <input style={inp} value={form.address} onChange={set('address')} />
            </div>
            <div>
              <label style={lbl}>Code postal</label>
              <input style={inp} value={form.zip_code} onChange={set('zip_code')} placeholder="1000" />
            </div>
            <div>
              <label style={lbl}>Ville</label>
              <input style={inp} value={form.city} onChange={set('city')} placeholder="Bruxelles" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>Pays</label>
              <input style={inp} value={form.country} onChange={set('country')} placeholder="Belgique" />
            </div>
          </div>
        </div>

        {/* Coordonnées bancaires */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '24px 28px', marginBottom: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
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

        {/* Paramètres par défaut documents */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '24px 28px', marginBottom: 28, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1e3a5f', margin: '0 0 18px' }}>
            ⚙️ Paramètres par défaut des documents
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px 20px' }}>
            <div>
              <label style={lbl}>TVA par défaut (%)</label>
              <input style={inp} type="number" min="0" max="100" value={form.default_vat} onChange={e => setForm(f => ({ ...f, default_vat: Number(e.target.value) || 0 }))} />
            </div>
            <div>
              <label style={lbl}>Devise</label>
              <input style={inp} value={form.default_currency} onChange={set('default_currency')} placeholder="EUR" maxLength={3} />
            </div>
            <div>
              <label style={lbl}>Peppol ID</label>
              <input style={inp} value={form.peppol_id} onChange={set('peppol_id')} placeholder="0208:0811234358" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>Pied de page / notes</label>
              <input style={inp} value={form.footer_notes} onChange={set('footer_notes')} placeholder="TVA, RCB, mention légale…" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>Logo (URL publique)</label>
              <input style={inp} value={form.logo_url} onChange={set('logo_url')} placeholder="https://…" />
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
          {saving ? 'Sauvegarde…' : 'Sauvegarder les paramètres'}
        </button>

      </form>
    </div>
  )
}
