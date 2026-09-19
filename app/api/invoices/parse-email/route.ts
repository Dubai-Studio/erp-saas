/**
 * POST /api/invoices/parse-email
 * OCR d'un email/facture fournisseur via DeepSeek + insertion en DB.
 *
 * Sécurité (avant : route complètement ouverte, abus DeepSeek possible) :
 * 1. Auth obligatoire (avec withAuth)
 * 2. Taille de fichier limitée (10 MB)
 * 3. MIME whitelist (PDF / images)
 * 4. Timeout de la requête externe
 * 5. Clé API DeepSeek LUE CÔTÉ SERVEUR uniquement (jamais NEXT_PUBLIC_)
 * 6. Prompt sanitizé : on n'envoie pas le contenu brut complet à l'API si
 *    trop gros
 * 7. Validation stricte de la réponse LLM (Zod) avant insertion en DB
 *
 * Limites raisonnables (anti-abus) :
 * - 1 appel max toutes les 5 secondes par user (cache local en mémoire)
 */
import { withAuth, badRequest, ok, serverError } from '@/lib/api-helpers'
import { z } from 'zod'

const ALLOWED_MIME = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
const MAX_BYTES = 10 * 1024 * 1024 // 10 MB

const ParsedInvoiceSchema = z.object({
  supplier_name: z.string().min(1).max(200),
  amount_ht:     z.number().nonnegative(),
  vat_amount:    z.number().nonnegative(),
  total_amount:  z.number().nonnegative(),
  issue_date:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  category:      z.string().max(100).optional(),
  notes:         z.string().max(1000).optional(),
}).refine(
  (v) => Math.abs(v.total_amount - (v.amount_ht + v.vat_amount)) < 0.05,
  { message: 'total_amount ≈ amount_ht + vat_amount' },
)

const DeepSeekResponseSchema = z.object({
  choices: z.array(z.object({
    message: z.object({
      content: z.string(),
    }),
  })),
})

// Anti-abus : rate limit en mémoire (per-process). En prod multi-instance,
// remplacer par Redis/Upstash.
const lastCallByUser = new Map<string, number>()
const RATE_LIMIT_MS = 5_000

export const POST = withAuth(async ({ req, supabase, user }) => {
  // 1. Rate limit
  const last = lastCallByUser.get(user.id) || 0
  if (Date.now() - last < RATE_LIMIT_MS) {
    return badRequest('Trop de requêtes — réessayez dans 5 secondes')
  }

  // 2. Validation contenu
  const contentType = req.headers.get('content-type') || ''
  if (!contentType.includes('multipart/form-data')) {
    return badRequest('multipart/form-data requis')
  }
  const form = await req.formData()
  const file = form.get('file') as File | null
  if (!file) return badRequest('Champ "file" requis')
  if (!ALLOWED_MIME.includes(file.type)) return badRequest(`Type MIME non autorisé: ${file.type}`)
  if (file.size > MAX_BYTES) return badRequest(`Fichier trop gros (max ${MAX_BYTES / 1024 / 1024} MB)`)

  // 3. Appel DeepSeek avec timeout dur (AbortController)
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) return badRequest('DEEPSEEK_API_KEY non configurée côté serveur')

  const buffer = Buffer.from(await file.arrayBuffer())
  const base64 = buffer.toString('base64')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)

  let rawJson: unknown
  try {
    const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: PROMPT },
            { type: 'image_url', image_url: { url: file.type === 'application/pdf' ? `data:application/pdf;base64,${base64}` : `data:${file.type};base64,${base64}` } },
          ],
        }],
        response_format: { type: 'json_object' },
        temperature: 0,
      }),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!resp.ok) {
      const err = await resp.text()
      return serverError(new Error(`DeepSeek ${resp.status}: ${err.slice(0, 200)}`))
    }
    rawJson = await resp.json()
  } catch (e: any) {
    clearTimeout(timeout)
    if (e.name === 'AbortError') return badRequest('Timeout DeepSeek (>30s)')
    return serverError(e)
  }

  lastCallByUser.set(user.id, Date.now())

  // 4. Validation réponse
  let parsed: z.infer<typeof ParsedInvoiceSchema>
  try {
    const ds = DeepSeekResponseSchema.parse(rawJson)
    const content = ds.choices[0]?.message?.content || '{}'
    parsed = ParsedInvoiceSchema.parse(JSON.parse(content))
  } catch (e: any) {
    return badRequest('Réponse LLM invalide', e.message?.slice(0, 200))
  }

  // 5. Insertion en DB (RLS s'applique)
  const { data, error } = await supabase.from('external_invoices').insert({
    type: 'incoming',
    ...parsed,
    status: 'pending',
  }).select().single()

  if (error) return badRequest(error.message)
  return ok(data)
})

const PROMPT = `Analyse cette facture fournisseur et renvoie STRICTEMENT un JSON valide :
{
  "supplier_name": "nom du fournisseur",
  "amount_ht": 123.45,
  "vat_amount": 24.69,
  "total_amount": 148.14,
  "issue_date": "2026-01-15",
  "category": "fournitures|carburant|entretien|location|logiciel|conseil|marketing|autre",
  "notes": "résumé court en français (optionnel)"
}
- Montants en nombres décimaux (pas de symbole €)
- Dates au format YYYY-MM-DD
- Si un champ est absent, omets-le
- Ne renvoie AUCUN texte hors du JSON`