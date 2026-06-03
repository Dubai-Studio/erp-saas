import { createClient } from '@supabase/supabase-js'

// Lazy initialization — évite les erreurs au build time quand les vars d'env ne sont pas disponibles
function getSupabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || ''
}
function getAnonKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
}
function getServiceKey() {
  return process.env.SUPABASE_SERVICE_KEY || ''
}

let _supabase: ReturnType<typeof createClient> | null = null
let _supabaseAdmin: ReturnType<typeof createClient> | null = null

export function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(getSupabaseUrl(), getAnonKey())
  }
  return _supabase
}

export function getSupabaseAdmin() {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(getSupabaseUrl(), getServiceKey())
  }
  return _supabaseAdmin
}

// Exports compatibles avec l'ancien code (lazy proxy)
export const supabase = new Proxy({} as ReturnType<typeof createClient>, {
  get(_target, prop) {
    return (getSupabase() as unknown as Record<string, unknown>)[prop as string]
  }
})

export const supabaseAdmin = new Proxy({} as ReturnType<typeof createClient>, {
  get(_target, prop) {
    return (getSupabaseAdmin() as unknown as Record<string, unknown>)[prop as string]
  }
})
