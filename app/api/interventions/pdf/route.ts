/**
 * POST /api/interventions/pdf
 * Génère un rapport d'intervention PDF à partir d'un payload structuré.
 *
 * Le payload est libre (l'intervention n'a pas encore de table dédiée
 * dans la DB). Quand tu créeras une table interventions, ce endpoint
 * lira depuis la DB.
 *
 * Pour l'instant : reçoit le payload complet, génère le PDF, le retourne.
 */
import { withAuth, ok, badRequest, serverError } from '@/lib/api-helpers'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { generateInterventionPdf } from '@/lib/pdf-intervention'

const InterventionSchema = z.object({
  intervention_number: z.string().min(1).max(50),
  date:                 z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  start_time:           z.string().regex(/^\d{2}:\d{2}$/).nullish(),
  end_time:             z.string().regex(/^\d{2}:\d{2}$/).nullish(),
  client_name:          z.string().max(200).nullish(),
  site_address:         z.string().max(500).nullish(),
  technician_name:      z.string().max(200).nullish(),
  technician_phone:     z.string().max(40).nullish(),
  problem_description:  z.string().min(1).max(2000),
  work_done:            z.string().min(1).max(2000),
  observations:         z.string().max(2000).nullish(),
  recommendations:      z.string().max(2000).nullish(),
  status:               z.enum(['planned', 'in_progress', 'done', 'billed', 'cancelled']).default('done'),
  currency:             z.string().length(3).default('EUR'),
  client: z.object({
    name: z.string(),
    address: z.string().nullish(),
    city: z.string().nullish(),
    zip_code: z.string().nullish(),
    contact_name: z.string().nullish(),
    contact_phone: z.string().nullish(),
    contact_email: z.string().nullish(),
  }).nullish(),
  tasks: z.array(z.object({
    description: z.string().min(1).max(300),
    hours:       z.number().nonnegative(),
    rate:        z.number().nonnegative(),
  })).optional(),
  parts: z.array(z.object({
    reference:  z.string().min(1).max(50),
    description:z.string().min(1).max(300),
    quantity:   z.number().positive(),
    unit_price: z.number().nonnegative(),
  })).optional(),
})

export const POST = withAuth(async ({ body }) => {
  const payload = InterventionSchema.parse(body)

  // Charge company_settings du user
  const cookieSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  )
  const { data: company } = await cookieSupabase
    .from('company_settings')
    .select('*')
    .maybeSingle()

  const doc = generateInterventionPdf(payload as any, company || {})

  // Retourne le PDF en base64 ou en blob selon preference
  const pdfBase64 = doc.output('datauristring')

  return ok({
    intervention_number: payload.intervention_number,
    pdf_base64: pdfBase64,
    filename: `${payload.intervention_number}.pdf`,
    size_kb: Math.round((pdfBase64.length * 3 / 4) / 1024),
  })
}, InterventionSchema)