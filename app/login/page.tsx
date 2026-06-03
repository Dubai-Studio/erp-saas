'use client'
export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  // Mode "mot de passe oublié"
  const [resetMode,    setResetMode]    = useState(false)
  const [resetEmail,   setResetEmail]   = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetMsg,     setResetMsg]     = useState('')
  const [resetError,   setResetError]   = useState('')

  function getSupabase() {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { data, error } = await getSupabase().auth.signInWithPassword({ email, password })
    if (error) {
      setError('Email ou mot de passe incorrect')
      setLoading(false)
      return
    }
    if (data.session) {
      localStorage.setItem('erp_token', data.session.access_token)
      router.push('/dashboard')
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setResetLoading(true)
    setResetError('')
    setResetMsg('')
    const { error } = await getSupabase().auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) {
      setResetError('Impossible d\'envoyer l\'email. Vérifiez l\'adresse.')
    } else {
      setResetMsg('Email envoyé ! Vérifiez votre boîte mail pour réinitialiser votre mot de passe.')
    }
    setResetLoading(false)
  }

  const s = {
    page: {
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #1A3C5E 0%, #0F6E56 100%)',
    } as React.CSSProperties,
    card: {
      background: 'white', borderRadius: 16, padding: 40,
      width: '100%', maxWidth: 420,
      boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
    } as React.CSSProperties,
    inp: {
      width: '100%', padding: '10px 14px',
      border: '1px solid #e5e7eb', borderRadius: 8,
      fontSize: 14, outline: 'none', boxSizing: 'border-box' as const,
    } as React.CSSProperties,
    btn: {
      width: '100%', padding: 12, color: 'white', border: 'none',
      borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer',
    } as React.CSSProperties,
    errBox: {
      background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
      padding: 12, marginBottom: 16, color: '#dc2626', fontSize: 14,
    } as React.CSSProperties,
    okBox: {
      background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8,
      padding: 12, marginBottom: 16, color: '#16a34a', fontSize: 14,
    } as React.CSSProperties,
  }

  // ── Écran "Mot de passe oublié" ──
  if (resetMode) {
    return (
      <div style={s.page}>
        <div style={s.card}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🔑</div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1A3C5E' }}>Mot de passe oublié</h1>
            <p style={{ color: '#6b7280', marginTop: 6, fontSize: 14 }}>
              Entrez votre email et nous vous enverrons un lien de réinitialisation.
            </p>
          </div>

          {resetError && <div style={s.errBox}>{resetError}</div>}
          {resetMsg   && <div style={s.okBox}>{resetMsg}</div>}

          {!resetMsg && (
            <form onSubmit={handleReset}>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: 14 }}>
                  Adresse email
                </label>
                <input
                  type="email" required
                  value={resetEmail}
                  onChange={e => setResetEmail(e.target.value)}
                  style={s.inp}
                  placeholder="votre@email.com"
                />
              </div>
              <button
                type="submit"
                disabled={resetLoading}
                style={{ ...s.btn, background: resetLoading ? '#9ca3af' : '#1A3C5E' }}
              >
                {resetLoading ? 'Envoi en cours…' : 'Envoyer le lien de réinitialisation'}
              </button>
            </form>
          )}

          <p style={{ textAlign: 'center', marginTop: 20, fontSize: 14, color: '#6b7280' }}>
            <button
              onClick={() => { setResetMode(false); setResetMsg(''); setResetError('') }}
              style={{ background: 'none', border: 'none', color: '#1A3C5E', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}
            >
              ← Retour à la connexion
            </button>
          </p>
        </div>
      </div>
    )
  }

  // ── Écran connexion normal ──
  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#1A3C5E' }}>Next-ERP</h1>
          <p style={{ color: '#6b7280', marginTop: 8 }}>Connectez-vous à votre espace</p>
        </div>

        {error && <div style={s.errBox}>{error}</div>}

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: 14 }}>Email</label>
            <input
              type="email" required
              value={email} onChange={e => setEmail(e.target.value)}
              style={s.inp} placeholder="votre@email.com"
            />
          </div>

          <div style={{ marginBottom: 8 }}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: 14 }}>Mot de passe</label>
            <input
              type="password" required
              value={password} onChange={e => setPassword(e.target.value)}
              style={s.inp} placeholder="••••••••"
            />
          </div>

          {/* Lien mot de passe oublié */}
          <div style={{ textAlign: 'right', marginBottom: 20 }}>
            <button
              type="button"
              onClick={() => { setResetMode(true); setResetEmail(email) }}
              style={{ background: 'none', border: 'none', color: '#1A3C5E', fontSize: 13, cursor: 'pointer', fontWeight: 500 }}
            >
              Mot de passe oublié ?
            </button>
          </div>

          <button
            type="submit" disabled={loading}
            style={{ ...s.btn, background: loading ? '#9ca3af' : '#1A3C5E' }}
          >
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 14, color: '#6b7280' }}>
          Pas encore de compte ?{' '}
          <a href="/register" style={{ color: '#1A3C5E', fontWeight: 600 }}>S&apos;inscrire</a>
        </p>
      </div>
    </div>
  )
}
