'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const NAV = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: (
      <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <rect x="3" y="3" width="7" height="7"/>
        <rect x="14" y="3" width="7" height="7"/>
        <rect x="3" y="14" width="7" height="7"/>
        <rect x="14" y="14" width="7" height="7"/>
      </svg>
    ),
  },
  {
    href: '/dashboard/clients',
    label: 'Clients',
    icon: (
      <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
  },
  {
    href: '/dashboard/invoices',
    label: 'Facturation',
    icon: (
      <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
    ),
  },
  {
    href: '/dashboard/projects',
    label: 'Projets',
    icon: (
      <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <polygon points="12 2 2 7 12 12 22 7 12 2"/>
        <polyline points="2 17 12 22 22 17"/>
        <polyline points="2 12 12 17 22 12"/>
      </svg>
    ),
  },
  {
    href: '/dashboard/employees',  // ✅ CORRIGÉ — était '/dashboard/hr'
    label: 'Ressources Humaines',
    icon: (
      <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <circle cx="12" cy="8" r="4"/>
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
      </svg>
    ),
  },
  {
    href: '/dashboard/stock',
    label: 'Stock',
    icon: (
      <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      </svg>
    ),
  },
  {
    href: '/dashboard/fleet',
    label: 'Flotte',
    icon: (
      <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <rect x="1" y="3" width="15" height="13" rx="2"/>
        <path d="M16 8h4l3 3v5h-7V8z"/>
        <circle cx="5.5" cy="18.5" r="2.5"/>
        <circle cx="18.5" cy="18.5" r="2.5"/>
      </svg>
    ),
  },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const [user,      setUser]      = useState<{ email: string } | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { router.push('/login'); return; }
      setUser(data.session.user as { email: string });
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) router.push('/login');
    });
    return () => subscription.unsubscribe();
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f1f5f9' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 40, height: 40, border: '3px solid #6366f1',
          borderTopColor: 'transparent', borderRadius: '50%',
          animation: 'spin 0.8s linear infinite', margin: '0 auto 12px',
        }} />
        <p style={{ color: '#94a3b8', fontSize: 14 }}>Chargement…</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );

  const sideW = collapsed ? 68 : 240;

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#f1f5f9' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        .nav-link {
          display: flex; align-items: center; gap: 12px;
          padding: 10px 16px; border-radius: 10px;
          color: #94a3b8; font-size: 13.5px; font-weight: 500;
          text-decoration: none; transition: all 0.15s;
          white-space: nowrap; overflow: hidden;
        }
        .nav-link:hover { background: rgba(255,255,255,0.08); color: #e2e8f0; }
        .nav-link.active { background: rgba(99,102,241,0.2); color: #a5b4fc; }
        .nav-link .icon { flex-shrink: 0; }
        .nav-label { overflow: hidden; transition: opacity 0.2s, width 0.2s; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
      `}</style>

      {/* ── Sidebar ── */}
      <aside style={{
        width: sideW, minWidth: sideW, height: '100vh',
        background: 'linear-gradient(180deg,#0f172a 0%,#1e293b 100%)',
        display: 'flex', flexDirection: 'column',
        transition: 'width 0.2s ease, min-width 0.2s ease',
        overflow: 'hidden', flexShrink: 0,
        boxShadow: '4px 0 24px rgba(0,0,0,0.15)',
        zIndex: 30,
      }}>

        {/* Logo */}
        <div style={{
          padding: '20px 16px 16px',
          display: 'flex', alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}>
          {!collapsed && (
            <div>
              <div style={{ color: '#fff', fontWeight: 800, fontSize: 16, letterSpacing: '-0.3px' }}>Next-ERP</div>
              <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>ERP SaaS PRO</div>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            style={{
              background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 8,
              padding: 7, cursor: 'pointer', color: '#94a3b8',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <line x1="3" y1="6"  x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 10px', overflowY: 'auto', overflowX: 'hidden' }}>
          {NAV.map(item => {
            const isActive = item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link${isActive ? ' active' : ''}`}
                title={collapsed ? item.label : ''}
                style={{
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  padding:        collapsed ? '10px'   : '10px 16px',
                  marginBottom: 2,
                }}
              >
                <span className="icon">{item.icon}</span>
                {!collapsed && <span className="nav-label">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* User + Logout */}
        <div style={{ padding: '12px 10px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
          {!collapsed && (
            <div style={{
              padding: '10px 12px', background: 'rgba(255,255,255,0.04)',
              borderRadius: 10, marginBottom: 8,
            }}>
              <div style={{
                width: 28, height: 28,
                background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                borderRadius: 8, display: 'flex', alignItems: 'center',
                justifyContent: 'center', color: '#fff', fontSize: 12,
                fontWeight: 700, marginBottom: 6,
              }}>
                {user?.email?.[0]?.toUpperCase() || 'U'}
              </div>
              <p style={{ color: '#e2e8f0', fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Utilisateur
              </p>
              <p style={{ color: '#64748b', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.email || ''}
              </p>
            </div>
          )}
          <button
            onClick={handleLogout}
            style={{
              width: '100%', display: 'flex', alignItems: 'center',
              justifyContent: collapsed ? 'center' : 'flex-start',
              gap: 10, padding: collapsed ? '10px' : '10px 12px',
              background: 'transparent', border: 'none', borderRadius: 10,
              color: '#64748b', fontSize: 13, fontWeight: 500,
              cursor: 'pointer', transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              const b = e.currentTarget as HTMLButtonElement;
              b.style.background = 'rgba(239,68,68,0.12)';
              b.style.color = '#f87171';
            }}
            onMouseLeave={e => {
              const b = e.currentTarget as HTMLButtonElement;
              b.style.background = 'transparent';
              b.style.color = '#64748b';
            }}
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            {!collapsed && 'Déconnexion'}
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* Topbar */}
        <header style={{
          height: 60, background: '#fff', borderBottom: '1px solid #e2e8f0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 24px', flexShrink: 0,
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)', zIndex: 20,
        }}>
          <div>
            <p style={{ color: '#94a3b8', fontSize: 13 }}>
              {new Date().toLocaleDateString('fr-BE', {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
              })}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              padding: 8, borderRadius: 8, color: '#94a3b8',
              display: 'flex', alignItems: 'center',
            }}>
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
            </button>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '6px 12px', background: '#f8fafc',
              borderRadius: 10, border: '1px solid #e2e8f0',
            }}>
              <div style={{
                width: 30, height: 30,
                background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                borderRadius: 8, display: 'flex', alignItems: 'center',
                justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 700,
              }}>
                {user?.email?.[0]?.toUpperCase() || 'U'}
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>Utilisateur</p>
                <p style={{ fontSize: 11, color: '#94a3b8' }}>Administrateur</p>
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          {children}
        </main>
      </div>
    </div>
  );
}
