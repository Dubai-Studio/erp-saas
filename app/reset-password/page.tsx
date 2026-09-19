'use client'

import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

function sb () {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

export default function ResetPasswordPage () {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [done, setDone]         = useState(false)

  async function handleSubmit (e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) return setError('Minimum 8 caractères')
    if (password !== confirm) return setError('Les mots de passe ne correspondent pas')

    setLoading(true)
    try {
      const { error } = await sb().auth.updateUser({ password })
      if (error) throw error
      setDone(true)
      setTimeout(() => router.push('/dashboard'), 1500)
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la réinitialisation')
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9' }}>
        <div style={{ background: '#fff', padding: 40, borderRadius: 12, textAlign: 'center', maxWidth: 400 }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>✅</div>
          <h1 style={{ fontSize: 20, color: '#0f172a', marginBottom: 8 }}>Mot de passe mis à jour</h1>
          <p style={{ color: '#64748b' }}>Redirection vers le tableau de bord…</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9' }}>
      <form onSubmit={handleSubmit} style={{ background: '#fff', padding: 32, borderRadius: 12, width: '100%', maxWidth: 420, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <h1 style={{ fontSize: 22, color: '#0f172a', marginBottom: 8 }}>Nouveau mot de passe</h1>
        <p style={{ color: '#64748b', fontSize: 13, marginBottom: 24 }}>Choisissez un mot de passe d'au moins 8 caractères.</p>

        {error && <div style={{ padding: '10px 14px', background: '#fef2f2', color: '#b91c1c', borderRadius: 8, fontSize: 13, marginBottom: 14 }}>{error}</div>}

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 5, textTransform: 'uppercase' }}>Nouveau mot de passe</label>
          <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: '100%', padding: '10px 13px', border: '1.5px solid #e2e8f0', borderRadius: 9, fontSize: 14 }} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 5, textTransform: 'uppercase' }}>Confirmer</label>
          <input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} style={{ width: '100%', padding: '10px 13px', border: '1.5px solid #e2e8f0', borderRadius: 9, fontSize: 14 }} />
        </div>

        <button type="submit" disabled={loading} style={{
          width: '100%', padding: '12px', background: loading ? '#94a3b8' : '#1e3a5f', color: '#fff', border: 'none', borderRadius: 9, fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
        }}>
          {loading ? 'Mise à jour…' : 'Mettre à jour'}
        </button>
        <Link href="/login" style={{ display: 'block', textAlign: 'center', marginTop: 14, color: '#64748b', fontSize: 13, textDecoration: 'none' }}>← Retour</Link>
      </form>
    </div>
  )
}