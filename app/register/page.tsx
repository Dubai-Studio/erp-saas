'use client'

import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'

export default function RegisterPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } }
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setSuccess('Compte créé ! Vérifiez votre email.')
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #1A3C5E 0%, #0F6E56 100%)'
    }}>
      <div style={{
        background: 'white',
        borderRadius: '16px',
        padding: '40px',
        width: '100%',
        maxWidth: '420px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: '800', color: '#1A3C5E' }}>Next-ERP</h1>
          <p style={{ color: '#6b7280', marginTop: '8px' }}>Créer votre compte</p>
        </div>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px', marginBottom: '16px', color: '#dc2626', fontSize: '14px' }}>
            {error}
          </div>
        )}

        {success && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '12px', marginBottom: '16px', color: '#16a34a', fontSize: '14px' }}>
            {success}
          </div>
        )}

        <form onSubmit={handleRegister}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', fontSize: '14px' }}>Nom complet</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} required
              style={{ width: '100%', padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', outline: 'none' }}
              placeholder="Jean Dupont" />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', fontSize: '14px' }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              style={{ width: '100%', padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', outline: 'none' }}
              placeholder="votre@email.com" />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', fontSize: '14px' }}>Mot de passe</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              style={{ width: '100%', padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', outline: 'none' }}
              placeholder="••••••••" />
          </div>

          <button type="submit" disabled={loading}
            style={{ width: '100%', padding: '12px', background: loading ? '#9ca3af' : '#1A3C5E', color: 'white', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Création...' : 'Créer mon compte'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '20px', fontSize: '14px', color: '#6b7280' }}>
          Déjà un compte ? <a href="/login" style={{ color: '#1A3C5E', fontWeight: '600' }}>Se connecter</a>
        </p>
      </div>
    </div>
  )
}
