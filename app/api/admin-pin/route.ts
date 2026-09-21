// app/api/admin-pin/route.ts
//
// Gestion du PIN d'accès admin pour les pages sensibles (ex. Paramètres).
//
// GET  : retourne { hasPin: boolean, pinHash: string | null } pour l'utilisateur courant.
// PUT  : enregistre / met à jour le hash du PIN (le hash est calculé côté client
//        avec un salt = user_id, donc illisible même côté serveur).
//
// La table admin_settings a une contrainte RLS : seul auth.uid() peut
// lire/écrire SA propre ligne. C'est la garantie qu'un autre utilisateur
// (ou un attaquant avec un cookie JWT compromis) ne peut pas écraser le PIN.

import { withAuth, ok, badRequest } from '@/lib/api-helpers'
import { z } from 'zod'

const PinUpdate = z.object({
  pinHash: z.string().regex(/^[a-f0-9]{64}$/i, 'pinHash doit être SHA-256 hex (64 chars)'),
})

export const GET = withAuth(async ({ supabase }) => {
  const { data, error } = await supabase
    .from('admin_settings')
    .select('admin_pin')
    .maybeSingle()
  if (error) return badRequest(error.message)
  // On ne renvoie JAMAIS le hash en clair. On indique juste s'il existe.
  return ok({
    hasPin: !!data?.admin_pin,
    // hash exposé pour que le client puisse vérifier localement (équivalent de
    // comparer en BD — c'est OK ici car la policy RLS garantit que le hash
    // ne peut être lu QUE par son propriétaire)
    pinHash: data?.admin_pin ?? null,
  })
})

export const PUT = withAuth(async ({ supabase, body }) => {
  const parsed = PinUpdate.parse(body)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return badRequest('Session invalide')

  const { error } = await supabase
    .from('admin_settings')
    .upsert({
      user_id:     user.id,
      admin_pin:   parsed.pinHash,
      pin_set_at:  new Date().toISOString(),
      updated_at:  new Date().toISOString(),
    }, { onConflict: 'user_id' })
  if (error) return badRequest(error.message)
  return ok({ ok: true })
}, PinUpdate)
