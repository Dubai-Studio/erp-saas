'use client'

/**
 * Browser-side OCR module for supplier invoices — Next.ERP-Pro.
 *
 * Stack 2026-Q3 :
 *   • Tesseract.js v6.0.1 + core v6.1.2 (LSTM only, modèles entraînés 2024+)
 *   • pdfjs-dist v4.10.38 pour le rendu PDF (worker depuis CDN)
 *   • Pipeline pre-processing canvas : grayscale → contraste → binarisation
 *   • Multi-langues : fra + eng + nld + deu (couvre FR/BE/NL/DE)
 *   • Résolution PDF : scale 3 (au lieu de 2) pour les petits caractères
 *   • Heuristiques LAYOUT-AWARE via bbox + confidence retournés par Tesseract
 *     → le nom du fournisseur = la plus grande police en haut de la page
 *
 * Tout tourne dans le navigateur, aucun envoi vers un serveur externe.
 */

import Tesseract from 'tesseract.js'

// Chemins CDN stables (jsdelivr) — survivent aux rebuilds Next.js.
const TESSERACT_CDN = {
  workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/worker.min.js',
  corePath:   'https://cdn.jsdelivr.net/npm/tesseract.js-core@6.1.2',
  // tessdata reste sur projectnaptha — héberge les .traineddata pour 100+ langues.
  // IMPORTANT : tesseract.js ajoute automatiquement ".traineddata.gz" au nom
  // de langue (fra -> fra.traineddata.gz). Le dossier "4.0.0" contient les
  // modèles LSTM pour fra/eng/nld/deu et ~100 autres langues.
  langPath:   'https://tessdata.projectnaptha.com/4.0.0',
}

export interface OcrResult {
  rawText: string
  confidence: number
  supplier_name?: string
  issue_date?: string   // ISO YYYY-MM-DD
  due_date?: string     // ISO YYYY-MM-DD
  amount_ht?: number
  vat_rate?: number     // % (0/6/12/21 BE standard)
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

// ────────────────────────────────────────────────────────────────────────────
// PRE-PROCESSING (canvas)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Convertit l'image en niveaux de gris via le standard ITU-R BT.601.
 * Améliore la lisibilité pour Tesseract sur les PDF scannés en couleur.
 */
function toGrayscale(imageData: ImageData): ImageData {
  const d = imageData.data
  for (let i = 0; i < d.length; i += 4) {
    // BT.601 luminance : Y = 0.299 R + 0.587 G + 0.114 B
    const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    d[i] = d[i + 1] = d[i + 2] = y
  }
  return imageData
}

/**
 * Augmente le contraste par expansion linéaire autour du milieu (128).
 * `factor`=1.4 : +40% de contraste — valeur sûre pour la plupart des scans.
 */
function increaseContrast(imageData: ImageData, factor = 1.4): ImageData {
  const d = imageData.data
  const c = (factor - 1) * 128
  for (let i = 0; i < d.length; i += 4) {
    d[i]     = Math.max(0, Math.min(255, factor * d[i]     - c))
    d[i + 1] = Math.max(0, Math.min(255, factor * d[i + 1] - c))
    d[i + 2] = Math.max(0, Math.min(255, factor * d[i + 2] - c))
  }
  return imageData
}

/**
 * Binarisation par seuil simple (Otsu serait mieux mais ~3x plus lent).
 * `threshold`=180 : sombre = texte, clair = fond — typique pour scans PDF.
 * Si une page a un fond très sombre, on inverse.
 */
function binarize(imageData: ImageData, threshold = 180): ImageData {
  const d = imageData.data
  // Échantillonne pour décider si on doit inverser (fond sombre, texte clair)
  let darkCount = 0
  const sampleStep = Math.max(4, Math.floor(d.length / 4 / 1000) * 4)
  for (let i = 0; i < d.length; i += sampleStep * 4) {
    if (d[i] < 128) darkCount++
  }
  const darkRatio = darkCount / (d.length / sampleStep / 4)
  const invert = darkRatio > 0.6 // fond majoritairement sombre → on inverse
  for (let i = 0; i < d.length; i += 4) {
    const v = d[i] // après grayscale, R=G=B
    const bw = invert ? (v > threshold ? 0 : 255) : (v > threshold ? 255 : 0)
    d[i] = d[i + 1] = d[i + 2] = bw
  }
  return imageData
}

/**
 * Pipeline pre-processing complet appliqué à un canvas.
 * Retourne le même canvas, modifié en place.
 */
function preprocessCanvas(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  toGrayscale(img)
  increaseContrast(img, 1.4)
  binarize(img, 180)
  ctx.putImageData(img, 0, 0)
}

// ────────────────────────────────────────────────────────────────────────────
// OCR entry points
// ────────────────────────────────────────────────────────────────────────────

/**
 * Runs OCR on an image file (JPG/PNG/etc.) using French + English + Dutch + German.
 * Pre-processing appliqué avant Tesseract pour maximiser la lisibilité.
 */
export async function ocrFromImage(
  file: File,
  lang = 'fra+eng+nld',
  onProgress?: ProgressCallback,
): Promise<OcrResult> {
  // Charge l'image dans un canvas pour pouvoir la pré-traiter.
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width  = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D indisponible')
  ctx.drawImage(bitmap, 0, 0)
  preprocessCanvas(canvas)

  const blob: Blob | null = await new Promise(resolve =>
    canvas.toBlob(resolve, 'image/png'),
  )
  if (!blob) throw new Error('Échec de la conversion canvas → PNG')

  const { data } = await Tesseract.recognize(blob, lang, {
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
  return extractFields(data.text, data.confidence, data.blocks)
}

/**
 * Runs OCR on a PDF file by rendering every page to a canvas at scale 3
 * (résolution supérieure aux scale 2 précédents — meilleur pour les petits
 * caractères), pre-processing appliqué, puis Tesseract.
 * Concatenates text and averages confidence across pages.
 */
export async function ocrFromPdf(
  file: File,
  lang = 'fra+eng+nld',
  onProgress?: ProgressCallback,
): Promise<OcrResult> {
  const pdfjsLib = await import('pdfjs-dist')
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
  const allBlocks: any[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    // Scale 3 (vs 2 avant) : pixel-densité plus élevée pour petits caractères.
    // Pour une A4 à 72 DPI natif → 216 DPI effectifs (qualité OCR).
    const viewport = page.getViewport({ scale: 3.0 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')
    if (!ctx) continue
    await page.render({ canvasContext: ctx, viewport }).promise

    // Pre-processing canvas avant Tesseract
    preprocessCanvas(canvas)

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
    if (Array.isArray(data.blocks)) allBlocks.push(...data.blocks)
  }

  return extractFields(
    fullText,
    pageCount > 0 ? totalConfidence / pageCount : 0,
    allBlocks,
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
  if (isPdf) return ocrFromPdf(file, 'fra+eng+nld', onProgress)
  return ocrFromImage(file, 'fra+eng+nld', onProgress)
}

// ────────────────────────────────────────────────────────────────────────────
// Field extraction (regex-based + layout-aware)
// ────────────────────────────────────────────────────────────────────────────

type TesseractBlock = {
  bbox: { x0: number; y0: number; x1: number; y1: number }
  paragraphs?: Array<{
    bbox: { x0: number; y0: number; x1: number; y1: number }
    lines: Array<{
      bbox: { x0: number; y0: number; x1: number; y1: number }
      text: string
      confidence: number
      words: Array<{
        text: string
        confidence: number
        bbox: { x0: number; y0: number; x1: number; y1: number }
        font_name?: string
      }>
    }>
  }>
}

function extractFields(
  text: string,
  confidence: number,
  blocks?: TesseractBlock[] | null,
): OcrResult {
  const result: OcrResult = {
    rawText: text,
    confidence,
    lowConfidence: confidence > 0 && confidence < 60,
  }

  result.supplier_name = extractSupplierName(text, blocks)
  result.issue_date    = extractDate(text, /(?:date\s*(?:de\s*)?(?:facture|émission|invoice|facturatiedatum)|datum|issued|factuurdatum|rechnungsdatum)/i)
                        ?? extractFirstDate(text)

  result.due_date      = extractDate(
    text,
    /(?:échéance|due\s*date|vervaldatum|payable\s*(?:avant|by|before)|à\s*payer\s*le|te\s*betalen|zahlbar)/i,
  )

  result.total_amount  = extractAmount(
    text,
    /(?:total\s*(?:à\s*payer|ttc|totaal|général|invoice\s*total|general|gross|amount\s*due|te\s*betalen|gesamt))/i,
    true,
  )

  result.amount_ht     = extractAmount(
    text,
    /(?:montant\s*(?:ht|htva|hors\s*taxe|hors\s*tv)|subtotal|net\s*(?:amount|à\s*payer)|base\s*taxable|btw\s*excl|netto)/i,
    false,
  )

  result.vat_amount    = extractAmount(
    text,
    /(?:tva|btw|vat|tax(?:es)?|mwst)(?!\s*number|\s*num)/i,
    false,
  )

  result.iban          = extractIban(text)
  result.vat_rate      = extractVatRate(text)

  // Reconciliation
  if (result.amount_ht === undefined && result.total_amount !== undefined && result.vat_amount !== undefined) {
    result.amount_ht = round2(result.total_amount - result.vat_amount)
  }
  if (result.vat_amount === undefined && result.total_amount !== undefined && result.amount_ht !== undefined) {
    result.vat_amount = round2(result.total_amount - result.amount_ht)
  }
  if (result.total_amount === undefined && result.amount_ht !== undefined && result.vat_amount !== undefined) {
    result.total_amount = round2(result.amount_ht + result.vat_amount)
  }
  // Si le taux n'a pas été trouvé dans le texte, dérive-le depuis HT + TVA.
  if (result.vat_rate === undefined && result.amount_ht !== undefined && result.amount_ht > 0
      && result.vat_amount !== undefined && result.vat_amount > 0) {
    const derived = (result.vat_amount / result.amount_ht) * 100
    if (derived >= 0 && derived <= 100) {
      result.vat_rate = Math.round(derived * 100) / 100
    }
  }

  for (const k of [
    'supplier_name', 'issue_date', 'due_date',
    'amount_ht', 'vat_rate', 'vat_amount', 'total_amount', 'iban',
  ] as const) {
    const v = result[k]
    if (v === undefined) continue
    if (typeof v === 'string' && v.trim() === '') delete result[k]
  }

  return result
}

// ────────────────────────────────────────────────────────────────────────────
// Supplier name extraction — LAYOUT-AWARE
// ────────────────────────────────────────────────────────────────────────────

function extractSupplierName(
  text: string,
  blocks?: TesseractBlock[] | null,
): string | undefined {
  const suffixes =
    /\b(?:SA|SPRL|BVBA|NV|SRL|SAS|SARL|GMBH|LTD|INC|LLC|SCS|SNC|SC|AS|AB|OY)\b\.?/i

  const labelRe = /^(?:factur[ée]?\s*[àa]|invoice\s*to|bill\s*to|client|to|from|vendor|supplier|fournisseur|emetteur|[àa]\s*:)$/i

  const labelKeywordsRegex =
    /\b(date|d[eé]mission|[eé]ch[eé]ance|conditions?|paiement|montant|tva|t\.?t\.?c|ttc|ht|net|brut|facture|invoice|num[ée]ro|r[ée]f[eé]rence|tbd|tba|modalit[eé]s?|escompte|remise|p[eé]nalit[eé]|int[eé]r[eê]ts?|klant|leverancier|datum|btw|kvk|iban|bic|swift|rib)\b/gi

  const labelHit = (line: string) => {
    const re = new RegExp(labelKeywordsRegex.source, 'gi')
    return (line.match(re) || []).length
  }

  const BIC_RE = /\b[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b/
  const IBAN_RE = /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/

  const rawLines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)

  // ── Stratégie 0 : label « ÉMETTEUR / FOURNISSEUR / VENDOR / SUPPLIER / FROM »
  const emitLineRe = /^\s*(?:[eé]metteur|emitter|exp[eé]diteur|from|vendor|supplier|fournisseur|leverancier|absender|abs\.?)\s*[:\-]?\s*(.{2,80})$/i
  for (let i = 0; i < rawLines.length; i++) {
    const m = rawLines[i].match(emitLineRe)
    if (!m) continue
    const value = (m[1] ?? '').replace(/\s+/g, ' ').trim()
    if (!value || labelRe.test(value)) continue
    if (/^[\d\s.,\/\-+()]+$/.test(value)) continue
    if (labelHit(value) >= 2) continue
    if (BIC_RE.test(value) || IBAN_RE.test(value)) continue
    if (value.length > 70) continue
    if (looksLikeCompanyName(value)) return cleanName(value)
    const next = rawLines[i + 1]?.replace(/\s+/g, ' ').trim() ?? ''
    if (next && !labelRe.test(next) && labelHit(next) < 2 && next.length <= 70
        && !/^[\d\s.,\/\-+()]+$/.test(next) && !BIC_RE.test(next) && !IBAN_RE.test(next)) {
      return cleanName(next)
    }
    return cleanName(value)
  }

  // ── Stratégie LAYOUT-AWARE (NOUVELLE) : utilise les bbox retournées par
  //    Tesseract. Le nom du fournisseur = la plus grande police située dans
  //    le top 30% de la page, OU le plus grand texte confiant sur la page.
  if (Array.isArray(blocks) && blocks.length > 0) {
    const layoutName = extractSupplierFromLayout(blocks)
    if (layoutName) return layoutName
  }

  // Construire la liste de candidats "propres" pour les stratégies texte-only.
  const candidates: string[] = []
  for (const raw of rawLines.slice(0, 40)) {
    const line = raw.replace(/\s+/g, ' ').trim()
    if (line.length < 3) continue
    if (/^[\d\s.,\/\-+()]+$/.test(line)) continue
    if (labelRe.test(line)) continue
    if (labelHit(line) >= 2) continue
    if (/^\d{1,4}[-/.]\d{1,2}[-/.]\d{2,4}/.test(line)) continue
    if (/@/.test(line)) continue
    if (/^(TVA|BTW|VAT|N[°ºo])\b/i.test(line)) continue
    if (/^(IBAN|BIC|SWIFT|RIB)\b/i.test(line)) continue
    if (/^(T[ée]l|Tel|Phone|Fax|Gsm|Mobile|GSM)\b/i.test(line)) continue
    if (/^https?:\/\//i.test(line)) continue
    if (BIC_RE.test(line)) continue
    if (IBAN_RE.test(line)) continue
    if (/^[A-Z]{8,11}$/.test(line)) continue
    if (/^[A-Z]{6,11}\s*\([A-Z]{2,5}\)\s*$/.test(line)) continue
    if (line.length > 70) continue
    candidates.push(line)
  }

  for (const line of candidates) {
    if (suffixes.test(line)) return cleanName(line)
  }
  for (const line of candidates) {
    const letters = (line.match(/\p{L}/gu) || []).length
    if (letters < 4) continue
    const upperRatio = (line.match(/[A-ZÀ-Ÿ]/g) || []).length / letters
    if (upperRatio >= 0.6) return cleanName(line)
  }
  for (const line of candidates) {
    const letters = (line.match(/\p{L}/gu) || []).length
    if (letters < 4) continue
    if (line.length > 50) continue
    if (/[A-ZÀ-Ÿ]/.test(line) && /[a-zà-ÿ]/.test(line)) return cleanName(line)
  }
  return candidates[0] ? cleanName(candidates[0]) : undefined
}

/**
 * LAYOUT-AWARE supplier extraction : se base sur la position (top de page)
 * et la taille de police (bbox.height) des lignes renvoyées par Tesseract.
 *
 * Heuristique : sur 95% des factures, le nom du fournisseur est dans le
 * top 30% de la page, écrit en plus gros que les lignes de labels en-dessous.
 */
function extractSupplierFromLayout(blocks: TesseractBlock[]): string | undefined {
  // Récupère toutes les lignes avec leur bbox et leur texte.
  type LineInfo = { text: string; top: number; height: number; confidence: number; yCenter: number }
  const allLines: LineInfo[] = []
  let pageHeight = 0
  let pageWidth = 0

  for (const block of blocks) {
    pageHeight = Math.max(pageHeight, block.bbox.y1)
    pageWidth = Math.max(pageWidth, block.bbox.x1)
    for (const para of (block.paragraphs ?? [])) {
      for (const line of (para.lines ?? [])) {
        allLines.push({
          text: line.text.replace(/\s+/g, ' ').trim(),
          top: line.bbox.y0,
          height: line.bbox.y1 - line.bbox.y0,
          confidence: line.confidence,
          yCenter: (line.bbox.y0 + line.bbox.y1) / 2,
        })
      }
    }
  }

  if (allLines.length === 0) return undefined

  // Filtre : top 30% de la page ET hauteur >= médiane (texte plus gros).
  const headerThreshold = pageHeight * 0.35
  const headerLines = allLines.filter(l => l.yCenter < headerThreshold && l.height > 0)

  if (headerLines.length === 0) return undefined

  // Calcule la médiane des hauteurs dans le header.
  const sortedHeights = headerLines.map(l => l.height).sort((a, b) => a - b)
  const medianHeight = sortedHeights[Math.floor(sortedHeights.length / 2)] ?? 0

  // Garde seulement les lignes dont la hauteur dépasse 1.2x la médiane (vraiment gros).
  const bigLines = headerLines
    .filter(l => l.height >= medianHeight * 1.2 && l.confidence >= 50)
    .sort((a, b) => b.height * b.confidence - a.height * a.confidence)

  for (const ln of bigLines) {
    if (ln.text.length < 3 || ln.text.length > 70) continue
    if (/^[\d\s.,\/\-+()]+$/.test(ln.text)) continue
    if (/^(TVA|BTW|VAT|N[°ºo]|IBAN|BIC|SWIFT|RIB|T[ée]l|Tel|Phone|Fax|Gsm|Mobile)\b/i.test(ln.text)) continue
    if (/\b[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b/.test(ln.text)) continue
    if (/\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/.test(ln.text)) continue
    if (/^[A-Z]{8,11}$/.test(ln.text)) continue
    if (/^\d{1,4}[-/.]\d{1,2}[-/.]\d{2,4}/.test(ln.text)) continue
    // Refuse les lignes qui sont uniquement des mots-clés label.
    const labelKeywordsRegexLocal =
      /\b(date|d[eé]mission|[eé]ch[eé]ance|conditions?|paiement|montant|tva|t\.?t\.?c|ttc|ht|net|brut|facture|invoice|num[ée]ro|r[ée]f[eé]rence|tbd|tba|modalit[eé]s?|escompte|remise|p[eé]nalit[eé]|int[eé]r[eê]ts?)\b/gi
    const hits = (ln.text.match(labelKeywordsRegexLocal) || []).length
    if (hits >= 2) continue
    // Au moins 3 lettres alphabétiques
    if ((ln.text.match(/\p{L}/gu) || []).length < 3) continue
    return cleanName(ln.text)
  }

  return undefined
}

function looksLikeCompanyName(s: string): boolean {
  const letters = (s.match(/\p{L}/gu) || []).length
  if (letters < 3) return false
  if (/^[\d\s.,\/\-+()]+$/.test(s)) return false
  if (/@/.test(s)) return false
  return true
}

function cleanName(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

// ────────────────────────────────────────────────────────────────────────────
// Date / Amount / IBAN extraction (regex-based)
// ────────────────────────────────────────────────────────────────────────────

function extractFirstDate(text: string): string | undefined {
  const m =
    text.match(/\b(\d{1,2}[-/.]\d{1,2}[-/.](?:20\d{2}|\d{2}))\b/) ||
    text.match(/\b(20\d{2}[-/.]\d{1,2}[-/.]\d{1,2})\b/)
  if (!m) return undefined
  return normalizeDate(m[1])
}

function extractDate(text: string, labelRe: RegExp): string | undefined {
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
  if (y.length === 2) y = '20' + y
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
  const cleaned = s.replace(/\s/g, '').replace(/[^\d.,-]/g, '')
  if (!cleaned) return 0
  const hasDot = cleaned.includes('.')
  const hasComma = cleaned.includes(',')
  if (hasDot && hasComma) {
    if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
      return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0
    }
    return parseFloat(cleaned.replace(/,/g, '')) || 0
  }
  if (hasComma) {
    return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0
  }
  return parseFloat(cleaned) || 0
}

function extractIban(text: string): string | undefined {
  const m = text.match(
    /\b([A-Z]{2}\s?\d{2}(?:\s?[A-Z0-9]{1,4}){2,8})\b/i,
  )
  if (!m) return undefined
  const compact = m[1].replace(/\s+/g, '').toUpperCase()
  if (!isValidIbanShape(compact)) return undefined
  return compact
}

/**
 * Extrait le TAUX de TVA (%) imprimé sur la facture. Plusieurs patterns
 * reconnus (FR/BE/NL/DE) :
 *   • "TVA 21%", "Taux TVA : 21%", "TVA 21 %"
 *   • "BTW 21%", "21% BTW", "B.T.W. 21 %"
 *   • "VAT 21%", "MwSt. 21%", "USt. 19%"
 *   • "21%" seul à proximité d'un label TVA
 *
 * Renvoie undefined si pas trouvé, ou un nombre 0-100 arrondi 2 décimales.
 */
function extractVatRate(text: string): number | undefined {
  // Pattern 1 : label TVA + nombre + %  →  "TVA 21%", "Taux TVA: 21 %"
  let m = text.match(
    /\b(?:taux\s+)?(?:TVA|BTW|VAT|MWST|UST|TVA\b)(?:[^\d\n]{0,15})(\d{1,2}(?:[.,]\d+)?)\s*%/i,
  )
  if (m) return clampRate(m[1])

  // Pattern 2 : nombre + % + label TVA  →  "21 % TVA", "6% BTW"
  m = text.match(/(\d{1,2}(?:[.,]\d+)?)\s*%\s*(?:TVA|BTW|VAT|MWST|UST)\b/i)
  if (m) return clampRate(m[1])

  // Pattern 3 : ligne "TVA X% : 100,00 €" où on lit X dans le label
  m = text.match(/\b(?:TVA|BTW|VAT|MWST|UST)\s*\(?\s*(\d{1,2}(?:[.,]\d+)?)\s*%\s*\)?/i)
  if (m) return clampRate(m[1])

  // Pattern 4 : "21%" suivi d'un label TVA dans la même ligne (rare)
  m = text.match(/(\d{1,2}(?:[.,]\d+)?)\s*%\s*\((?:TVA|BTW|VAT|MWST|UST)/i)
  if (m) return clampRate(m[1])

  return undefined
}

function clampRate(raw: string | undefined): number | undefined {
  if (!raw) return undefined
  const n = parseFloat(raw.replace(',', '.'))
  if (!Number.isFinite(n)) return undefined
  if (n < 0 || n > 100) return undefined
  return Math.round(n * 100) / 100
}

function isValidIbanShape(iban: string): boolean {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) return false
  if (iban.length < 15 || iban.length > 34) return false
  return true
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
