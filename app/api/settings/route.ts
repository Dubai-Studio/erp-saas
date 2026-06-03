import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )
}

// GET — récupère les paramètres de la société pour l'utilisateur connecté
export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get('x-user-id')
    if (!userId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { data, error } = await getSupabase()
      .from('company_settings')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (error && error.code !== 'PGRST116') {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Retourne les données ou des valeurs par défaut vides
    return NextResponse.json(data ?? {
      company_name: '',
      address: '',
      city: '',
      country: 'Belgique',
      vat_number: '',
      email: '',
      phone: '',
      iban: '',
      bic: '',
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur serveur' }, { status: 500 })
  }
}

// PUT — crée ou met à jour les paramètres de la société
export async function PUT(req: NextRequest) {
  try {
    const userId = req.headers.get('x-user-id')
    if (!userId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const body = await req.json()

    const payload = {
      user_id:      userId,
      company_name: body.company_name?.trim() || '',
      address:      body.address?.trim()      || '',
      city:         body.city?.trim()         || '',
      country:      body.country?.trim()      || 'Belgique',
      vat_number:   body.vat_number?.trim()   || '',
      email:        body.email?.trim()        || '',
      phone:        body.phone?.trim()        || '',
      iban:         body.iban?.trim()         || '',
      bic:          body.bic?.trim()          || '',
      updated_at:   new Date().toISOString(),
    }

    const { data, error } = await getSupabase()
      .from('company_settings')
      .upsert(payload, { onConflict: 'user_id' })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur serveur' }, { status: 500 })
  }
}
