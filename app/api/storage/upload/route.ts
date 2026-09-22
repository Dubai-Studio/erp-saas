import { withAuth, badRequest, ok } from '@/lib/api-helpers'
import { ALLOWED_MIME, MAX_UPLOAD_BYTES, StorageUploadMeta } from '@/lib/schemas'

/**
 * POST /api/storage/upload
 * Upload un fichier dans un bucket Supabase Storage.
 * Authentification obligatoire, taille et MIME validés.
 * user_id du JWT est utilisé comme préfixe du chemin pour respecter les policies
 * de storage (chaque user ne peut voir que son dossier).
 */
export const POST = withAuth(async ({ req, supabase, body }) => {
  // Headers + meta
  const metaHeader = req.headers.get('x-upload-meta')
  let meta
  try {
    meta = StorageUploadMeta.parse(metaHeader ? JSON.parse(metaHeader) : {})
  } catch (e: any) {
    return badRequest('Meta invalides', e.message)
  }

  // Validation contenu
  if (!ALLOWED_MIME.includes(meta.content_type)) {
    return badRequest(`Type MIME non autorisé: ${meta.content_type}`)
  }

  const arrayBuffer = await req.arrayBuffer()
  console.log(`[upload] meta=${JSON.stringify(meta)} size=${arrayBuffer.byteLength}`)
  if (arrayBuffer.byteLength === 0) return badRequest('Fichier vide')
  if (arrayBuffer.byteLength > MAX_UPLOAD_BYTES) {
    return badRequest(`Fichier trop volumineux (max ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB)`)
  }

  const buffer = new Uint8Array(arrayBuffer)
  const safeName = meta.file_name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200)

  // Récupère l'user_id pour préfixer le chemin (policy storage)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return badRequest('Session invalide')

  const fullPath = `${user.id}/${meta.folder}/${Date.now()}-${safeName}`
  console.log(`[upload] path=${meta.bucket}/${fullPath}`)

  const { data, error } = await supabase.storage
    .from(meta.bucket)
    .upload(fullPath, buffer, {
      contentType: meta.content_type,
      upsert: false,
    })
  if (error) {
    console.error(`[upload] storage error: ${error.message} (bucket=${meta.bucket}, path=${fullPath})`)
    return badRequest(error.message)
  }

  // URL publique (le bucket doit être public pour getPublicUrl).
  // Si l'appel échoue (bucket inexistant ou policy restrict), on génère une URL
  // manuelle basée sur la convention Supabase Storage — l'utilisateur pourra
  // toujours tenter d'ouvrir le lien, et le bucket doit être marqué public via
  // la migration 10 pour que ça fonctionne réellement.
  let publicUrl = ''
  try {
    const { data: urlData } = supabase.storage.from(meta.bucket).getPublicUrl(data.path)
    publicUrl = urlData.publicUrl
    console.log(`[upload] publicUrl=${publicUrl}`)
  } catch (e: any) {
    console.warn(`[upload] getPublicUrl failed: ${e?.message ?? e}, falling back to manual URL`)
  }
  if (!publicUrl) {
    // Fallback : URL manuelle conforme au format Supabase Storage public.
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
    publicUrl = `${baseUrl}/storage/v1/object/public/${meta.bucket}/${data.path}`
    console.warn(`[upload] using fallback URL: ${publicUrl}`)
  }

  return ok({
    path: data.path,
    url: publicUrl,
    size: arrayBuffer.byteLength,
    content_type: meta.content_type,
  })
})