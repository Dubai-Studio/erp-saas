/**
 * POST /api/payslips/:employeeId/pdf
 * Génère la fiche de paie PDF d'un employé pour un mois donné.
 *
 * Utilise les données :
 *  - employees (info, contrat, salaire)
 *  - time_entries (heures travaillées / supp / nuit / week-end)
 *  - pay_adjustments (primes, avances)
 *  - company_settings
 *
 * Le précompte professionnel et les cotisations sont calculés selon les
 * taux belges par défaut (configurables dans le payload).
 */
import { withAuth, ok, badRequest, notFound } from '@/lib/api-helpers'
import { generatePayslipPdf } from '@/lib/pdf-payslip'
import { isValidUuid } from '@/lib/calculations'
import { z } from 'zod'

const InputSchema = z.object({
  period_month:    z.string().regex(/^\d{4}-\d{2}$/),
  payment_date:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  worked_days:     z.number().int().nonnegative().nullish(),
  absence_days:    z.number().int().nonnegative().nullish(),
  social_security: z.object({
    employee_rate: z.number().min(0).max(50),
    employer_rate: z.number().min(0).max(100),
  }).optional(),
  fiscal: z.object({
    bracket:        z.number().min(0).max(60).nullish(),
    withholding_tax:z.number().nonnegative(),
    dependents:    z.number().int().nonnegative().nullish(),
  }).optional(),
  bonus:            z.number().nonnegative().default(0),
  advance:          z.number().nonnegative().default(0),
  other_deductions: z.number().nonnegative().default(0),
})

export const POST = withAuth(async ({ supabase, params, body }) => {
  const employeeId = params.employeeId
  if (!isValidUuid(employeeId)) return badRequest('employeeId invalide')

  const input = InputSchema.parse(body)

  // Récupère employé
  const { data: employee, error: empErr } = await supabase
    .from('employees')
    .select('*')
    .eq('id', employeeId)
    .maybeSingle()
  if (empErr) return badRequest(empErr.message)
  if (!employee) return notFound('Employé introuvable')

  // Récupère heures du mois
  const { data: timeEntries } = await supabase
    .from('time_entries')
    .select('*')
    .eq('employee_id', employeeId)
    .gte('date', `${input.period_month}-01`)
    .lte('date', `${input.period_month}-31`)

  // Agrège par type
  let hoursWorked = 0
  let overtimeHours = 0, overtimeRate = 0
  let nightHours    = 0, nightRate    = 0
  let weekendHours  = 0, weekendRate  = 0
  for (const e of timeEntries || []) {
    hoursWorked += Number(e.hours_worked || 0)
    if (e.entry_type === 'overtime') { overtimeHours += Number(e.hours_worked || 0); overtimeRate = Number(e.hourly_rate || 0) }
    if (e.entry_type === 'night')    { nightHours    += Number(e.hours_worked || 0); nightRate    = Number(e.hourly_rate || 0) }
    if (e.entry_type === 'weekend')  { weekendHours  += Number(e.hours_worked || 0); weekendRate  = Number(e.hourly_rate || 0) }
  }

  // Récupère ajustements du mois
  const { data: adjustments } = await supabase
    .from('pay_adjustments')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('month', input.period_month)

  let bonus = input.bonus
  let advance = input.advance
  let otherDeduct = input.other_deductions
  for (const a of adjustments || []) {
    if (a.type === 'prime')        bonus       += Number(a.amount || 0)
    else if (a.type === 'avance')   advance     += Number(a.amount || 0)
    else if (a.type === 'retenue') otherDeduct += Math.abs(Number(a.amount || 0))
  }

  // Récupère paramètres société. Robuste aux doublons : ORDER BY updated_at
  // DESC + LIMIT 1 + maybeSingle() retourne la ligne la plus récente pour
  // l'user courant (RLS filtre par user_id = auth.uid()).
  const { data: company } = await supabase
    .from('company_settings')
    .select('*')
    .order('updated_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()

  const baseSalary = Number(employee.salary || 0)

  // Si pas de précompte fourni, on calcule un forfait 0 (à intégrer avec un
  // barème progressif belge — voir module fiscal si besoin).
  const withholding = input.fiscal?.withholding_tax ?? 0

  const pdf = generatePayslipPdf({
    employee: {
      first_name:         employee.first_name,
      last_name:          employee.last_name,
      national_id:        employee.national_id,
      position:           employee.position,
      department:         employee.department,
      contract_type:      employee.contract_type,
      worker_type:        employee.worker_type,
      hire_date:          employee.hire_date,
      iban:               employee.iban,
      bic:                null,
      payment_method:     employee.payment_method,
      base_salary:        baseSalary,
      hours_worked:       hoursWorked,
      overtime_hours:     overtimeHours,
      overtime_rate:      overtimeRate,
      night_hours:        nightHours,
      night_rate:         nightRate,
      weekend_hours:      weekendHours,
      weekend_rate:       weekendRate,
      bonus,
      advance,
      other_deductions:   otherDeduct,
    },
    period: {
      month:        input.period_month,
      year:         parseInt(input.period_month.split('-')[0]),
      payment_date: input.payment_date,
      worked_days:  input.worked_days ?? undefined,
      absence_days: input.absence_days ?? undefined,
    },
    social_security: input.social_security,
    fiscal: input.fiscal
      ? {
          bracket:         input.fiscal.bracket ?? undefined,
          withholding_tax: withholding,
          dependents:      input.fiscal.dependents ?? undefined,
        }
      : { withholding_tax: withholding },
    company: company || {},
  })

  const pdfBase64 = pdf.output('datauristring')
  return ok({
    employee: { id: employeeId, name: `${employee.first_name} ${employee.last_name}` },
    period:   input.period_month,
    pdf_base64: pdfBase64,
    filename: `paie-${employee.last_name}-${input.period_month}.pdf`,
  })
}, InputSchema)