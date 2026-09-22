'use client'

/**
 * Browser-side OCR module for supplier invoices.
 *
 * - Tesseract.js: pure JS OCR engine, runs entirely in the browser, no API key.
 * - pdfjs-dist: PDF rendering in the browser (worker loaded from CDN).
 *
 * The OCR is intentionally lenient: any single field may be missing if the
 * source document is noisy / handwritten / in another language. The user is
 * always allowed to edit before saving.
 */

import Tesseract from 'tesseract.js'

// Chemins CDN stables (jsdelivr) — survivent aux rebuilds Next.js.
// Sans cela, Next.js打包 le worker Tesseract dans un chunk /_next/static/chunks/
// qui peut être absent après un redéploiement (chunk hash obsolète), faisant
// échouer l'OCR avec "Failed to load chunk …".
const TESSERACT_CDN = {
  workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',
  corePath:   'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.0.0',
  langPath:   'https://tessdata.projectnaptha.com/4.0.0',
}

export interface OcrResult {
  rawText: string
  confidence: number
  supplier_name?: string
  issue_date?: string   // ISO YYYY-MM-DD
  due_date?: string     // ISO YYYY-MM-DD
  amount_ht?: number
  vat_amount?: number
  total_amount?: number
  iban?: string
  /** True if Tesseract could not find enough text to be useful. */
  lowConfidence?: boolean
}

export interface OcrProgress {
  status: string
  progress: number // 0..1
}

export type ProgressCallback = (p: OcrProgress) => void

/**
 * Runs OCR on an image file (JPG/PNG/etc.) using French + English language data.
 */
export async function ocrFromImage(
  file: File,
  lang = 'fra+eng',
  onProgress?: ProgressCallback,
): Promise<OcrResult> {
  const { data } = await Tesseract.recognize(file, lang, {
    workerPath: TESSERACT_CDN.workerPath,
    corePath:   TESSERACT_CDN.corePath,
    langPath:   TESSERACT_CDN.langPath,
    logger: m => {
      if (onProgress) {
        onProgress({
          status: m.status || '',
          progress: typeof m.progress === 'number' ? m.progress : 0,
        })
      }
    },
  })
  return extractFields(data.text, data.confidence)
}

/**
 * Runs OCR on a PDF file by rendering every page to a canvas at scale 2 and
 * feeding each page to Tesseract. Concatenates text and averages confidence.
 */
export async function ocrFromPdf(
  file: File,
  lang = 'fra+eng',
  onProgress?: ProgressCallback,
): Promise<OcrResult> {
  // Dynamic import keeps pdfjs out of the initial bundle.
  const pdfjsLib = await import('pdfjs-dist')
  // Worker is loaded from a CDN to avoid Vercel size limits on /public.
  // Pinning a major version keeps the worker compatible with the lib.
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs'
  }

  const arrayBuffer = await file.arrayBuffer()
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })
  const pdf = await loadingTask.promise

  let fullText = ''
  let totalConfidence = 0
  let pageCount = 0

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 2.0 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')
    if (!ctx) continue
    // pdfjs-dist 4.10.38 (installé) : `canvasContext` est la clé attendue (TypeScript + runtime).
// NOTE: l'audit mentionnait que pdfjs-dist 4 avait renommé `canvasContext` → `canvas` ; ce n'est pas
// le cas pour la version 4.10.38 actuellement verrouillée dans package.json. On garde donc
// `canvasContext` pour respecter le typage strict et la compatibilité runtime.
await page.render({ canvasContext: ctx, viewport }).promise

    const blob: Blob | null = await new Promise(resolve =>
      canvas.toBlob(resolve, 'image/png'),
    )
    if (!blob) continue

    const imageFile = new File([blob], `page-${i}.png`, { type: 'image/png' })
    const { data } = await Tesseract.recognize(imageFile, lang, {
      workerPath: TESSERACT_CDN.workerPath,
      corePath:   TESSERACT_CDN.corePath,
      langPath:   TESSERACT_CDN.langPath,
      logger: m => {
        if (onProgress) {
          const pagePortion = 1 / pdf.numPages
          onProgress({
            status: `Page ${i}/${pdf.numPages} — ${m.status || ''}`,
            progress: Math.min(
              1,
              (i - 1) * pagePortion +
                pagePortion * (typeof m.progress === 'number' ? m.progress : 0),
            ),
          })
        }
      },
    })
    fullText += '\n' + data.text
    totalConfidence += data.confidence
    pageCount++
  }

  return extractFields(
    fullText,
    pageCount > 0 ? totalConfidence / pageCount : 0,
  )
}

/**
 * Picks the right pipeline based on the file type.
 */
export async function ocrInvoice(
  file: File,
  onProgress?: ProgressCallback,
): Promise<OcrResult> {
  const isPdf =
    file.type === 'application/pdf' ||
    file.name.toLowerCase().endsWith('.pdf')
  if (isPdf) return ocrFromPdf(file, 'fra+eng', onProgress)
  return ocrFromImage(file, 'fra+eng', onProgress)
}

// ────────────────────────────────────────────────────────────────────────────
// Field extraction (regex-based heuristics for FR/BE invoices)
// ────────────────────────────────────────────────────────────────────────────

function extractFields(text: string, confidence: number): OcrResult {
  const result: OcrResult = {
    rawText: text,
    confidence,
    lowConfidence: confidence > 0 && confidence < 60,
  }

  result.supplier_name = extractSupplierName(text)
  result.issue_date    = extractDate(text, /(?:date\s*(?:de\s*)?(?:facture|émission|invoice|facturatiedatum)|datum|issued|factuurdatum)/i)
                        ?? extractFirstDate(text)

  result.due_date      = extractDate(
    text,
    /(?:échéance|due\s*date|vervaldatum|payable\s*(?:avant|by|before)|à\s*payer\s*le|te\s*betalen)/i,
  )

  result.total_amount  = extractAmount(
    text,
    /(?:total\s*(?:à\s*payer|ttc|totaal|général|invoice\s*total|general|gross|amount\s*due))/i,
    true,
  )

  result.amount_ht     = extractAmount(
    text,
    /(?:montant\s*(?:ht|htva|hors\s*taxe|hors\s*tv)|subtotal|net\s*(?:amount|à\s*payer)|base\s*taxable|btw\s*excl)/i,
    false,
  )

  result.vat_amount    = extractAmount(
    text,
    /(?:tva|btw|vat|tax(?:es)?)(?!\s*number|\s*num)/i,
    false,
  )

  result.iban          = extractIban(text)

  // Reconciliation: if a value is missing but the other two are present,
  // derive it. This makes the form usable even on poorly structured invoices.
  if (
    result.amount_ht === undefined &&
    result.total_amount !== undefined &&
    result.vat_amount !== undefined
  ) {
    result.amount_ht = round2(result.total_amount - result.vat_amount)
  }
  if (
    result.vat_amount === undefined &&
    result.total_amount !== undefined &&
    result.amount_ht !== undefined
  ) {
    result.vat_amount = round2(result.total_amount - result.amount_ht)
  }
  if (
    result.total_amount === undefined &&
    result.amount_ht !== undefined &&
    result.vat_amount !== undefined
  ) {
    result.total_amount = round2(result.amount_ht + result.vat_amount)
  }

  // Final cleanup: strip empty optional fields so the UI doesn't render them.
  for (const k of [
    'supplier_name',
    'issue_date',
    'due_date',
    'amount_ht',
    'vat_amount',
    'total_amount',
    'iban',
  ] as const) {
    const v = result[k]
    if (v === undefined) continue
    if (typeof v === 'string' && v.trim() === '') delete result[k]
  }

  return result
}

function extractSupplierName(text: string): string | undefined {
  // Stratégies en cascade — chacune doit être essayée avant la suivante.
  //
  //   Stratégie 0 : label explicite « ÉMETTEUR / FOURNISSEUR / VENDOR / SUPPLIER »
  //                 suivi d'un nom de société sur la même ligne ou la suivante.
  //                 Très fiable sur les factures structurées.
  //   Stratégie 1 : suffixe juridique clair (SA, SPRL, BVBA, NV, SRL, ...)
  //   Stratégie 2 : ligne majoritairement en MAJUSCULES (≥ 60%) avec ≥ 4 lettres
  //   Stratégie 3 : ligne mixte (au moins 1 maj + 1 min, longueur raisonnable)
  //   Stratégie 4 : fallback — premier candidat raisonnable

  const suffixes =
    /\b(?:SA|SPRL|BVBA|NV|SRL|SAS|SARL|GMBH|LTD|INC|LLC|SCS|SNC|SC|AS|AB|OY)\b\.?/i

  // Labels courants en haut/au milieu d'une facture — à exclure comme nom
  // (la ligne ne doit pas être EXACTEMENT un de ces mots).
  const labelRe = /^(?:factur[ée]?\s*[àa]|invoice\s*to|bill\s*to|client|to|from|vendor|supplier|fournisseur|emetteur|[àa]\s*:)$/i

  // Mots-clés typiques d'une facture FR/BE/NL/DE qui, combinés ensemble ou
  // répétés, indiquent une ligne de labels et PAS un nom de société :
  //   "DATE DEMISSION DATE D'ECHEANCE CONDITIONS DE PAIEMENT"  ← bug classique
  //   "MONTANT HT TVA TOTAL TTC"
  //   "DATE D'EMISSION"  ← cas particulier, 2 mots-clés seulement
  const labelKeywordsRegex =
    /\b(date|d[eé]mission|[eé]ch[eé]ance|conditions?|paiement|montant|tva|t\.?t\.?c|ttc|ht|net|brut|facture|invoice|num[ée]ro|r[ée]f[eé]rence|tbd|tba|modalit[eé]s?|escompte|remise|p[eé]nalit[eé]|int[eé]r[eê]ts?)\b/gi

  // Compteur de mots-clés label présents dans une ligne.
  const labelHit = (line: string) => {
    const re = new RegExp(labelKeywordsRegex.source, 'gi')
    const hits = (line.match(re) || []).length
    return hits
  }

  // Lignes candidates : on garde les 40 premières (marge plus large pour
  // attraper un nom de société en haut de page).
  const rawLines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)

  // ── Stratégie 0 : label « ÉMETTEUR / FOURNISSEUR / VENDOR / SUPPLIER / FROM »
  //                  suivi du nom sur la même ligne OU la ligne suivante.
  const emitLineRe = /^\s*(?:[eé]metteur|emitter|exp[eé]diteur|from|vendor|supplier|fournisseur|leverancier|absender|abs\.?)\s*[:\-]?\s*(.{2,80})$/i
  for (let i = 0; i < rawLines.length; i++) {
    const m = rawLines[i].match(emitLineRe)
    if (!m) continue
    const value = (m[1] ?? '').replace(/\s+/g, ' ').trim()
    // Le nom ne doit pas être lui-même un label ni un simple numéro/date
    if (!value || labelRe.test(value)) continue
    if (/^[\d\s.,\/\-+()]+$/.test(value)) continue
    if (labelHit(value) >= 2) continue
    if (value.length > 70) continue
    if (looksLikeCompanyName(value)) return cleanName(value)
    // Ligne suivante (le nom peut être reporté sur 2 lignes dans le PDF)
    const next = rawLines[i + 1]?.replace(/\s+/g, ' ').trim() ?? ''
    if (next && !labelRe.test(next) && labelHit(next) < 2 && next.length <= 70 && !/^[\d\s.,\/\-+()]+$/.test(next)) {
      return cleanName(next)
    }
    return cleanName(value)
  }

  // Construire la liste de candidats "propres" pour les stratégies 1-4.
  const candidates: string[] = []
  for (const raw of rawLines.slice(0, 40)) {
    const line = raw.replace(/\s+/g, ' ').trim()
    if (line.length < 3) continue
    if (/^[\d\s.,\/\-+()]+$/.test(line)) continue          // nombres / tel / IBAN
    if (labelRe.test(line)) continue                          // "FACTURÉ À"
    // Rejet de toute ligne contenant ≥ 2 mots-clés label (avant on exigeait 3,
    // mais ça ratait "DATE D'EMISSION" qui n'en a que 2).
    if (labelHit(line) >= 2) continue
    if (/^\d{1,4}[-/.]\d{1,2}[-/.]\d{2,4}/.test(line)) continue   // date
    if (/@/.test(line)) continue                              // email
    if (/^(TVA|BTW|VAT|N[°ºo])\b/i.test(line)) continue        // numéros TVA, "N°"
    if (/^(IBAN|BIC|SWIFT|RIB)\b/i.test(line)) continue        // coordonnées bancaires
    if (/^(T[ée]l|Tel|Phone|Fax|Gsm|Mobile|GSM)\b/i.test(line)) continue
    if (/^https?:\/\//i.test(line)) continue                  // URL
    if (line.length > 70) continue                            // trop long pour un nom
    candidates.push(line)
  }

  // Stratégie 1 : ligne avec suffixe société clair (SA, SPRL, BVBA, ...)
  for (const line of candidates) {
    if (suffixes.test(line)) return cleanName(line)
  }
  // Stratégie 2 : ligne majoritairement en majuscules ET ≥ 4 caractères alphabétiques
  for (const line of candidates) {
    const letters = (line.match(/\p{L}/gu) || []).length
    if (letters < 4) continue
    const upperRatio = (line.match(/[A-ZÀ-Ÿ]/g) || []).length / letters
    if (upperRatio >= 0.6) return cleanName(line)
  }
  // Stratégie 3 : ligne mixte (ex: "ACME Industries") — au moins 1 maj + 1 min
  for (const line of candidates) {
    const letters = (line.match(/\p{L}/gu) || []).length
    if (letters < 4) continue
    if (line.length > 50) continue
    if (/[A-ZÀ-Ÿ]/.test(line) && /[a-zà-ÿ]/.test(line)) return cleanName(line)
  }
  // Stratégie 4 : au pire, premier candidat raisonnable
  return candidates[0] ? cleanName(candidates[0]) : undefined
}

/**
 * Vérifie heuristiquement qu'une chaîne ressemble à un nom de société :
 * au moins une lettre, pas que des chiffres/symboles, pas de mots parasites.
 */
function looksLikeCompanyName(s: string): boolean {
  const letters = (s.match(/\p{L}/gu) || []).length
  if (letters < 3) return false
  if (/^[\d\s.,\/\-+()]+$/.test(s)) return false
  if (/@/.test(s)) return false
  return true
}

function cleanName(s: string): string {
  // Collapse spaces, drop stray punctuation, return a sensible title case-ish
  // form. Tesseract often returns ALL CAPS which doesn't match the user's
  // saved suppliers; we keep it readable but not lower-cased.
  return s.replace(/\s+/g, ' ').trim()
}

function extractFirstDate(text: string): string | undefined {
  // Fallback used when no "Date de facture" keyword is found.
  // Matches the first dd/mm/yyyy or dd-mm-yyyy (or yyyy-mm-dd) date.
  const m =
    text.match(/\b(\d{1,2}[-/.]\d{1,2}[-/.](?:20\d{2}|\d{2}))\b/) ||
    text.match(/\b(20\d{2}[-/.]\d{1,2}[-/.]\d{1,2})\b/)
  if (!m) return undefined
  return normalizeDate(m[1])
}

function extractDate(
  text: string,
  labelRe: RegExp,
): string | undefined {
  // Try to find a label followed by a date within ~25 chars.
  const re = new RegExp(
    labelRe.source +
      '[^\\d\\n]{0,25}(\\d{1,2}[-/.]\\d{1,2}[-/.](?:20\\d{2}|\\d{2}))',
    'i',
  )
  const m = text.match(re)
  if (m) return normalizeDate(m[1])
  return undefined
}

function normalizeDate(raw: string): string | undefined {
  const parts = raw.split(/[-/.]/).map(p => p.trim())
  if (parts.length !== 3) return undefined
  let [a, b, y] = parts
  if (!a || !b || !y) return undefined
  // Handle 2-digit years.
  if (y.length === 2) y = '20' + y
  // If the first part looks like a year (yyyy-mm-dd), swap.
  let d: string, m: string
  if (a.length === 4) {
    y = a
    m = b
    d = y[2]!
  } else {
    d = a
    m = b
  }
  const dd = parseInt(d, 10)
  const mm = parseInt(m, 10)
  if (!Number.isFinite(dd) || !Number.isFinite(mm)) return undefined
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return undefined
  return `${y}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
}

function extractAmount(
  text: string,
  labelRe: RegExp,
  preferLast: boolean,
): number | undefined {
  // Find every line where the label appears and collect the first number that
  // follows. If `preferLast`, take the last match (often the "Total à payer"
  // appears below subtotals on the same document).
  const re = new RegExp(
    labelRe.source +
      '[^\\d\\n]{0,20}([\\d][\\d\\s.,]{1,15})\\s*(?:\\u20ac|eur|EUR|€)?',
    'gi',
  )
  const candidates: number[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const n = parseNumber(m[1] ?? '')
    if (Number.isFinite(n) && n > 0) candidates.push(n)
  }
  if (candidates.length === 0) return undefined
  return preferLast ? candidates[candidates.length - 1] : candidates[0]
}

function parseNumber(s: string): number {
  // Accept "1 234,56", "1.234,56", "1234.56", "1,234.56", "1234,56".
  const cleaned = s.replace(/\s/g, '').replace(/[^\d.,-]/g, '')
  if (!cleaned) return 0
  const hasDot = cleaned.includes('.')
  const hasComma = cleaned.includes(',')
  if (hasDot && hasComma) {
    // Whichever appears last is the decimal separator.
    if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
      return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0
    }
    return parseFloat(cleaned.replace(/,/g, '')) || 0
  }
  if (hasComma) {
    // Single comma: treat as decimal separator (FR/BE convention).
    return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0
  }
  return parseFloat(cleaned) || 0
}

function extractIban(text: string): string | undefined {
  // Standard IBAN: 2 letters + 2 digits + (1-7 groups of 4 alphanumerics) +
  // optional final group of 1-4 chars. Tolerant of spaces / hyphens.
  const m = text.match(
    /\b([A-Z]{2}\s?\d{2}(?:\s?[A-Z0-9]{1,4}){2,8})\b/i,
  )
  if (!m) return undefined
  // Mod-97 validation (best effort, lengths 15-32).
  const compact = m[1].replace(/\s+/g, '').toUpperCase()
  if (!isValidIbanShape(compact)) return undefined
  return compact
}

function isValidIbanShape(iban: string): boolean {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) return false
  if (iban.length < 15 || iban.length > 34) return false
  return true
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}