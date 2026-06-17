import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    
    // Données envoyées par Power Automate
    const { 
      pdf_base64,    // PDF en base64
      email_subject, // Sujet de l'email
      email_sender,  // Expéditeur
      file_name      // Nom du fichier
    } = body

    // ── Appel DeepSeek pour extraire les données ──
    const deepseekRes = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: `Tu es un expert comptable. Extrais les données d'une facture fournisseur et retourne UNIQUEMENT un JSON valide sans markdown.
Format requis:
{
  "supplier_name": "Nom du fournisseur",
  "amount_ht": 0.00,
  "vat_amount": 0.00,
  "total_amount": 0.00,
  "issue_date": "YYYY-MM-DD",
  "due_date": "YYYY-MM-DD",
  "category": "Prestation|Matériel|Logistique|Loyer|Utilities|Assurance|Honoraires|Autre",
  "notes": "Numéro de facture et autres infos utiles"
}`
          },
          {
            role: 'user',
            content: `Voici les informations de l'email:
Sujet: ${email_subject}
Expéditeur: ${email_sender}
Contenu PDF en base64: ${pdf_base64?.substring(0, 3000) || 'Non disponible'}

Extrait les données de facturation.`
          }
        ],
        temperature: 0.1
      })
    })

    const deepseekData = await deepseekRes.json()
    const rawContent = deepseekData.choices?.[0]?.message?.content || '{}'
    
    // Parse le JSON retourné par DeepSeek
    let extracted: Record<string, unknown> = {}
    try {
      const cleaned = rawContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      extracted = JSON.parse(cleaned)
    } catch {
      console.error('DeepSeek parse error:', rawContent)
      extracted = {}
    }

    // ── Upload PDF dans Supabase Storage ──
    let file_url = ''
    if (pdf_base64) {
      const buffer = Buffer.from(pdf_base64, 'base64')
      const safeName = `${Date.now()}-${(file_name || 'facture.pdf').replace(/[^a-z0-9.\-_]/gi, '_')}`
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('invoices')
        .upload(safeName, buffer, {
          contentType: 'application/pdf',
          upsert: false
        })
      
      if (!uploadError && uploadData) {
        const { data: urlData } = supabase.storage
          .from('invoices')
          .getPublicUrl(safeName)
        file_url = urlData.publicUrl
      }
    }

    // ── Sauvegarde dans Supabase ──
    const invoice = {
      type:          'incoming',
      supplier_name: extracted.supplier_name || email_sender || 'Inconnu',
      amount_ht:     Number(extracted.amount_ht)    || 0,
      vat_amount:    Number(extracted.vat_amount)   || 0,
      total_amount:  Number(extracted.total_amount) || 0,
      issue_date:    (extracted.issue_date as string) || new Date().toISOString().split('T')[0],
      due_date:      (extracted.due_date as string)  || null,
      category:      (extracted.category as string)  || 'Autre',
      notes:         `${extracted.notes || ''}\nImporté depuis: ${email_subject}`.trim(),
      status:        'pending',
      file_name:     file_name || 'facture.pdf',
      file_url:      file_url || null,
      client_id:     null,
      project_id:    null,
      supplier_id:   null,
    }

    const { data, error } = await supabase
      .from('external_invoices')
      .insert(invoice)
      .select()
      .single()

    if (error) {
      console.error('Supabase insert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true, 
      invoice: data,
      extracted 
    })

  } catch (err) {
    console.error('parse-email error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
