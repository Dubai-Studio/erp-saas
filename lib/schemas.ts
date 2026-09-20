/**
 * Schémas Zod de validation d'entrée pour toutes les routes API.
 * Avant ce fichier, chaque route faisait `if (!body.x)` partiels, sans contrat
 * → mass assignment, NaN dans les calculs, types vides en DB.
 */
import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const optionalString = z.string().trim().max(2000).nullish()
const optionalUuid   = z.string().uuid().nullish()
const nonNegativeNum = z.number().nonnegative().finite()
const isoDate        = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date YYYY-MM-DD')
const isoDateTime    = z.string().datetime({ offset: true }).nullish()
const positiveAmount = z.number().positive().finite()
const vatRate        = z.number().min(0).max(100)

// ─────────────────────────────────────────────────────────────────────────────
// Clients
// ─────────────────────────────────────────────────────────────────────────────

export const ClientCreate = z.object({
  name:        z.string().trim().min(1, 'name requis').max(200),
  email:       z.string().email().nullish().or(z.literal('')),
  phone:       optionalString,
  address:     optionalString,
  city:        optionalString,
  zip_code:    optionalString,
  country:     optionalString,
  vat_number:  optionalString,
  notes:       optionalString,
  status:      z.enum(['active', 'inactive', 'prospect', 'archived']).default('active'),
})

export const ClientUpdate = ClientCreate.partial()

// ─────────────────────────────────────────────────────────────────────────────
// Invoices
// ─────────────────────────────────────────────────────────────────────────────

const InvoiceLine = z.object({
  description: z.string().trim().min(1).max(500),
  quantity:    positiveAmount,
  unit_price:  nonNegativeNum,
  vat_rate:    vatRate.default(20),
}).transform((l) => ({
  description: l.description,
  quantity:    l.quantity,
  unit_price:  l.unit_price,
  vat_rate:    l.vat_rate ?? 20,
  total:       Number((l.quantity * l.unit_price * (1 + (l.vat_rate ?? 20) / 100)).toFixed(2)),
}))

export const InvoiceCreate = z.object({
  client_id:      optionalUuid,
  client_name:    optionalString,
  type:           z.enum(['invoice', 'quote', 'credit_note', 'proforma']).default('invoice'),
  status:         z.enum(['draft', 'pending', 'sent', 'paid', 'overdue', 'cancelled']).default('draft'),
  issue_date:     isoDate.nullish(),
  due_date:       isoDate.nullish(),
  payment_terms:  z.string().max(200).nullish(),
  notes:          optionalString,
  lines:          z.array(InvoiceLine).min(1, 'au moins une ligne'),
  currency:       z.string().length(3).default('EUR'),
})

export const InvoiceUpdate = z.object({
  id:             z.string().uuid(),
  client_id:      optionalUuid,
  client_name:    optionalString,
  type:           z.enum(['invoice', 'quote', 'credit_note', 'proforma']).optional(),
  status:         z.enum(['draft', 'pending', 'sent', 'paid', 'overdue', 'cancelled']).optional(),
  issue_date:     isoDate.optional(),
  due_date:       isoDate.optional(),
  payment_terms:  z.string().max(200).nullish(),
  notes:          optionalString,
  lines:          z.array(InvoiceLine).min(1).optional(),
})

// ─────────────────────────────────────────────────────────────────────────────
// External (incoming) invoices — fournisseurs
// ─────────────────────────────────────────────────────────────────────────────

export const ExternalInvoiceCreate = z.object({
  supplier_name: z.string().trim().min(1).max(200),
  supplier_id:   optionalUuid,
  client_id:     optionalUuid,
  project_id:    optionalUuid,
  amount_ht:     nonNegativeNum,
  vat_amount:    nonNegativeNum.default(0),
  total_amount:  nonNegativeNum,
  issue_date:    isoDate.nullish(),
  due_date:      isoDate.nullish(),
  category:      z.string().max(100).nullish(),
  notes:         optionalString,
  status:        z.enum(['pending', 'paid', 'overdue', 'cancelled']).default('pending'),
  file_name:     optionalString,
  file_url:      optionalString,
}).refine(
  (v) => Math.abs(v.total_amount - (v.amount_ht + v.vat_amount)) < 0.05,
  { message: 'total_amount doit être ≈ amount_ht + vat_amount', path: ['total_amount'] },
)

// Whitelist explicite pour PATCH — JAMAIS d'id / user_id (le trigger RLS gère user_id)
export const ExternalInvoiceUpdate = z.object({
  supplier_name: z.string().trim().min(1).max(200).optional(),
  supplier_id:   optionalUuid,
  client_id:     optionalUuid,
  project_id:    optionalUuid,
  amount_ht:     nonNegativeNum.optional(),
  vat_amount:    nonNegativeNum.optional(),
  total_amount:  nonNegativeNum.optional(),
  issue_date:    isoDate.nullish(),
  due_date:      isoDate.nullish(),
  category:      z.string().max(100).nullish(),
  notes:         optionalString,
  status:        z.enum(['pending', 'paid', 'overdue', 'cancelled']).optional(),
  file_name:     optionalString,
  file_url:      optionalString,
})

// ─────────────────────────────────────────────────────────────────────────────
// Employees
// ─────────────────────────────────────────────────────────────────────────────

export const EmployeeCreate = z.object({
  first_name:        z.string().trim().min(1).max(100),
  last_name:         z.string().trim().min(1).max(100),
  email:             z.string().email().nullish().or(z.literal('')),
  phone:             optionalString,
  position:          optionalString,
  department:        optionalString,
  hire_date:         isoDate.nullish(),
  salary:            nonNegativeNum.default(0),
  status:            z.enum(['active', 'inactive', 'leave']).default('active'),
  // Ta DB a une colonne `worker_type` (CHECK {salarie, horaire}), pas contract_type.
  // On accepte les deux valeurs historiques + CDI/CDD/etc. si tu les utilises déjà ailleurs.
  worker_type:       z.enum(['salarie', 'horaire', 'CDI', 'CDD', 'Freelance', 'Stage', 'Alternance']).default('salarie'),
  payment_method:    z.string().max(50).default('Virement'),
  payment_day:       z.number().int().min(1).max(31).default(28),
  payment_frequency: z.enum(['Mensuel', 'Bimensuel', 'Hebdomada']).default('Mensuel'),
  iban:              z.string().regex(/^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/, 'IBAN invalide').nullish().or(z.literal('')),
  national_id:       optionalString,
  address:           optionalString,
  emergency_contact: optionalString,
})

export const EmployeeUpdate = EmployeeCreate.partial()

// ─────────────────────────────────────────────────────────────────────────────
// Fleet
// ─────────────────────────────────────────────────────────────────────────────

export const FleetVehicleBase = z.object({
  name:               optionalString,
  brand:              optionalString,
  model:              optionalString,
  year:               z.number().int().min(1900).max(2100).nullish(),
  plate:              optionalString,
  vin:                optionalString,
  type:               z.enum(['voiture', 'camion', 'camionnette', 'moto', 'utilitaire', 'autre']).default('voiture'),
  fuel_type:          z.enum(['diesel', 'essence', 'hybride', 'electrique', 'gpl', 'autre']).default('diesel'),
  color:              optionalString,
  mileage:            nonNegativeNum.default(0),
  mileage_last_update: isoDate.nullish(),
  purchase_date:      isoDate.nullish(),
  purchase_price:     nonNegativeNum.default(0),
  insurance_company:  optionalString,
  insurance_ref:      optionalString,
  insurance_expiry:   isoDate.nullish(),
  control_expiry:     isoDate.nullish(),
  driver:             optionalString,
  department:         optionalString,
  status:             z.enum(['actif', 'inactif', 'en réparation', 'vendu', 'hors service']).default('actif'),
  notes:              optionalString,
})

export const FleetVehicleCreate = FleetVehicleBase.refine(
  (v) => v.brand || v.name || v.model,
  { message: 'brand, model ou name requis' },
)

export const FleetVehicleUpdate = FleetVehicleBase.partial()

const ExpenseType = z.enum([
  'carburant', 'assurance', 'entretien', 'réparation',
  'contrôle technique', 'pneus', 'lavage', 'amende',
  'parking', 'péage', 'location', 'autre',
])

export const FleetExpenseCreate = z.object({
  vehicle_id:  z.string().uuid(),
  type:        ExpenseType.default('autre'),
  amount:      positiveAmount,
  date:        isoDate.nullish(),
  month:       z.string().regex(/^\d{4}-\d{2}$/).nullish(),
  mileage:     z.number().int().nonnegative().nullish(),
  description: optionalString,
  supplier:    optionalString,
  invoice_ref: optionalString,
})

// Whitelist explicite pour PATCH — JAMAIS d'id / user_id (le trigger RLS gère user_id)
export const FleetExpenseUpdate = z.object({
  vehicle_id:  z.string().uuid().optional(),
  type:        ExpenseType.optional(),
  amount:      positiveAmount.optional(),
  date:        isoDate.nullish(),
  month:       z.string().regex(/^\d{4}-\d{2}$/).nullish(),
  mileage:     z.number().int().nonnegative().nullish(),
  description: optionalString,
  supplier:    optionalString,
  invoice_ref: optionalString,
})

// ─────────────────────────────────────────────────────────────────────────────
// Stock
// ─────────────────────────────────────────────────────────────────────────────

export const StockItemCreate = z.object({
  name:           z.string().trim().min(1).max(200),
  sku:            optionalString,
  reference:      optionalString,
  supplier_ref:   optionalString,
  category:       optionalString,
  unit:           z.string().max(20).default('pièce'),
  quantity:       nonNegativeNum.default(0),
  min_quantity:   nonNegativeNum.default(0),
  max_quantity:   nonNegativeNum.nullish(),
  unit_price:     nonNegativeNum.default(0),
  purchase_price: nonNegativeNum.default(0),
  selling_price:  nonNegativeNum.default(0),
  vat_rate:       vatRate.default(19),
  supplier:       optionalString,
  location:       optionalString,
  description:    optionalString,
  notes:          optionalString,
  status:         z.enum(['in_stock', 'low_stock', 'out_of_stock', 'inactif', 'archivé']).default('in_stock'),
  last_restock:   isoDate.nullish(),
  expiry_date:    isoDate.nullish(),
})

export const StockItemUpdate = StockItemCreate.partial()

export const StockMovementCreate = z.object({
  // Ta DB utilise stock_item_id (FK vers stock_items). On garde une API claire.
  stock_item_id: z.string().uuid(),
  // Le CHECK DB accepte FR + EN. On envoie EN, on lit ce qui est en DB.
  type:       z.enum(['in', 'out', 'adjust', 'entrée', 'sortie', 'ajustement', 'retour', 'transfert']),
  quantity:   positiveAmount,
  unit_price: nonNegativeNum.default(0),
  reason:     optionalString,
  reference:  optionalString,
  date:       isoDate.nullish(),
})

// ─────────────────────────────────────────────────────────────────────────────
// Projects / Expenses / Time entries / Pay adjustments
// ─────────────────────────────────────────────────────────────────────────────

export const ProjectCreate = z.object({
  name:        z.string().trim().min(1).max(200),
  description: optionalString,
  client_id:   optionalUuid,
  client_name: optionalString,
  color:       z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#f59e0b'),
  start_date:  isoDate.nullish(),
  end_date:    isoDate.nullish(),
  budget:      nonNegativeNum.default(0),
  spent:       nonNegativeNum.default(0),
  status:      z.enum(['active', 'paused', 'completed', 'cancelled']).default('active'),
  priority:    z.enum(['low', 'normale', 'high', 'urgent']).default('normale'),
  progress:    z.number().min(0).max(100).default(0),
  manager:     optionalString,
  tags:        z.array(z.string().max(40)).nullish(),
})

export const ExpenseCreate = z.object({
  project_id:   optionalUuid,
  employee_id:  optionalUuid,
  date:         isoDate,
  amount:       positiveAmount,
  category:     z.string().max(100).default('autre'),
  description:  optionalString,
  receipt_url:  optionalString,
  month:        z.string().regex(/^\d{4}-\d{2}$/).nullish(),
})

export const TimeEntryCreate = z.object({
  employee_id:    z.string().uuid(),
  date:           isoDate,
  month:          z.string().regex(/^\d{4}-\d{2}$/).nullish(),
  start_time:     z.string().regex(/^\d{2}:\d{2}$/).nullish(),
  end_time:       z.string().regex(/^\d{2}:\d{2}$/).nullish(),
  break_minutes:  z.number().int().min(0).max(480).default(0),
  hours_worked:   nonNegativeNum.nullish(),
  entry_type:     z.enum(['normal', 'overtime', 'night', 'holiday']).default('normal'),
  hourly_rate:    nonNegativeNum.default(0),
  rate_applied:   z.number().min(0).max(100).default(0),
  amount:         nonNegativeNum.nullish(),
  status:         z.enum(['draft', 'submitted', 'approved', 'paid']).default('draft'),
  notes:          optionalString,
})

export const PayAdjustmentCreate = z.object({
  employee_id: z.string().uuid(),
  type:        z.enum(['salaire', 'prime', 'avance', 'deduction', 'autre']).default('autre'),
  amount:      z.number(), // peut être négatif pour déductions
  reason:      optionalString,
  date:        isoDate.nullish(),
  month:       z.string().regex(/^\d{4}-\d{2}$/).nullish(),
  project_id:  optionalUuid,
})

export const EmployeePaymentCreate = z.object({
  employee_id:     z.string().uuid(),
  month:           z.string().regex(/^\d{4}-\d{2}$/),
  year:            z.number().int().min(2000).max(2100),
  type:            z.enum(['salaire', 'prime', 'avance']).default('salaire'),
  amount:          nonNegativeNum,
  status:          z.enum(['pending', 'paid', 'cancelled']).default('pending'),
  payment_date:    isoDate.nullish(),
  payment_method:  z.string().max(50).default('Virement'),
  note:            optionalString,
})

// Whitelist explicite pour PATCH — JAMAIS d'id / user_id (le trigger RLS gère user_id)
export const EmployeePaymentUpdate = z.object({
  employee_id:     z.string().uuid().optional(),
  month:           z.string().regex(/^\d{4}-\d{2}$/).optional(),
  year:            z.number().int().min(2000).max(2100).optional(),
  type:            z.enum(['salaire', 'prime', 'avance']).optional(),
  amount:          nonNegativeNum.optional(),
  status:          z.enum(['pending', 'paid', 'cancelled']).optional(),
  payment_date:    isoDate.nullish(),
  payment_method:  z.string().max(50).optional(),
  note:            optionalString,
})

// Whitelist explicite pour PATCH time_entries — JAMAIS d'id / user_id
export const TimeEntryUpdate = z.object({
  employee_id:    z.string().uuid().optional(),
  date:           isoDate.optional(),
  month:          z.string().regex(/^\d{4}-\d{2}$/).nullish(),
  start_time:     z.string().regex(/^\d{2}:\d{2}$/).nullish(),
  end_time:       z.string().regex(/^\d{2}:\d{2}$/).nullish(),
  break_minutes:  z.number().int().min(0).max(480).optional(),
  hours_worked:   nonNegativeNum.nullish(),
  entry_type:     z.enum(['normal', 'overtime', 'night', 'holiday']).optional(),
  hourly_rate:    nonNegativeNum.optional(),
  rate_applied:   z.number().min(0).max(100).optional(),
  amount:         nonNegativeNum.nullish(),
  status:         z.enum(['draft', 'submitted', 'approved', 'paid']).optional(),
  notes:          optionalString,
})

// Whitelist explicite pour PATCH pay_adjustments — JAMAIS d'id / user_id
export const PayAdjustmentUpdate = z.object({
  employee_id: z.string().uuid().optional(),
  type:        z.enum(['salaire', 'prime', 'avance', 'deduction', 'autre']).optional(),
  amount:      z.number().optional(),
  reason:      optionalString,
  date:        isoDate.nullish(),
  month:       z.string().regex(/^\d{4}-\d{2}$/).nullish(),
  project_id:  optionalUuid,
})

// ─────────────────────────────────────────────────────────────────────────────
// Settings
// ─────────────────────────────────────────────────────────────────────────────

const IBAN_REGEX = /^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/
const BIC_REGEX  = /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/
const VAT_REGEX  = /^[A-Z]{0,2}[A-Z0-9]{2,15}$/

export const CompanySettingsUpsert = z.object({
  company_name: z.string().trim().min(1).max(200),
  address:      z.string().max(300).nullish(),
  city:         z.string().max(100).nullish(),
  zip_code:     z.string().max(20).nullish(),
  country:      z.string().max(100).default('Belgique'),
  vat_number:   z.string().max(20).regex(VAT_REGEX, 'Numéro TVA invalide').nullish().or(z.literal('')),
  email:        z.string().email().nullish().or(z.literal('')),
  phone:        z.string().max(40).nullish(),
  iban:         z.string().regex(IBAN_REGEX, 'IBAN invalide').nullish().or(z.literal('')),
  bic:          z.string().regex(BIC_REGEX, 'BIC invalide').nullish().or(z.literal('')),
  logo_url:     z.string().url().nullish().or(z.literal('')),
  default_vat:  vatRate.default(20),
  default_currency: z.string().length(3).default('EUR'),
})

// ─────────────────────────────────────────────────────────────────────────────
// Storage upload
// ─────────────────────────────────────────────────────────────────────────────

export const StorageUploadMeta = z.object({
  bucket:      z.enum(['invoices', 'receipts', 'attachments']).default('invoices'),
  folder:      z.string().regex(/^[a-z0-9\-_\/]+$/i).max(200).default('general'),
  file_name:   z.string().min(1).max(200),
  content_type: z.string().max(100).default('application/octet-stream'),
})

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024 // 25 MB
export const ALLOWED_MIME = [
  'application/pdf',
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
  'application/vnd.ms-excel',
  'text/csv',
]