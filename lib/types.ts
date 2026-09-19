/**
 * Types partagés entre API et front.
 * On évite `any` au maximum et on documente les unions de status.
 */

export type ID = string

export type InvoiceStatus = 'draft' | 'pending' | 'sent' | 'paid' | 'overdue' | 'cancelled'
export type InvoiceType   = 'invoice' | 'quote' | 'credit_note' | 'proforma'

// Statuts projets alignés sur ta DB (planning, active, on_hold, completed, cancelled, paused)
export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled' | 'paused'
export type ProjectPriority = 'low' | 'medium' | 'normale' | 'high' | 'critical' | 'urgent'

// External invoices : aligned DB {pending, paid, contested, overdue, cancelled}
export type ExternalInvoiceStatus = 'pending' | 'paid' | 'contested' | 'overdue' | 'cancelled'

// Stock movements : accepte FR + EN grâce à l'élargissement du CHECK DB
export type StockMovementType = 'entrée' | 'sortie' | 'ajustement' | 'retour' | 'transfert' | 'in' | 'out' | 'adjust'

export interface InvoiceLine {
  description: string
  quantity:    number
  unit_price:  number
  vat_rate:    number
  total:       number
}

export interface Invoice {
  id:             ID
  user_id:        ID
  invoice_number: string
  client_id:      ID | null
  project_id:     ID | null
  client_name:    string | null
  type:           InvoiceType
  status:         InvoiceStatus
  issue_date:     string | null
  due_date:       string | null
  paid_at:        string | null
  payment_terms:  string | null
  lines:          InvoiceLine[]
  subtotal:       number
  vat_amount:     number
  total_amount:   number
  notes:          string | null
  currency:       string
  created_at:     string
  updated_at:     string
}

export interface Client {
  id:         ID
  user_id:    ID
  name:       string
  email:      string | null
  phone:      string | null
  address:    string | null
  city:       string | null
  zip_code:   string | null
  country:    string | null
  vat_number: string | null
  notes:      string | null
  status:     'active' | 'inactive' | 'prospect' | 'archived'
  created_at: string
  updated_at: string
}

export interface CompanySettings {
  id:               ID
  user_id:          ID
  company_name:     string
  address:          string | null
  city:             string | null
  zip_code:         string | null
  country:          string
  vat_number:       string | null
  email:            string | null
  phone:            string | null
  iban:             string | null
  bic:              string | null
  logo_url:         string | null
  default_vat:      number
  default_currency: string
  updated_at:       string
}

export interface Employee {
  id:                 ID
  user_id:            ID
  first_name:         string
  last_name:          string
  email:              string | null
  phone:              string | null
  position:           string | null
  department:         string | null
  hire_date:          string | null
  salary:             number
  status:             'active' | 'inactive' | 'leave'
  worker_type:        'salarie' | 'horaire' | 'CDI' | 'CDD' | 'Freelance' | 'Stage' | 'Alternance'
  payment_method:     string
  payment_day:        number
  payment_frequency:  'Mensuel' | 'Bimensuel' | 'Hebdomada'
  iban:               string | null
  national_id:        string | null
  address:            string | null
  emergency_contact:  string | null
  created_at:         string
}

export interface FleetVehicle {
  id:                 ID
  user_id:            ID
  name:               string | null
  brand:              string | null
  model:              string | null
  year:               number | null
  plate:              string | null
  vin:                string | null
  type:               'voiture' | 'camion' | 'camionnette' | 'moto' | 'utilitaire' | 'autre'
  fuel_type:          'diesel' | 'essence' | 'hybride' | 'electrique' | 'gpl' | 'autre'
  color:              string | null
  mileage:            number
  mileage_last_update: string | null
  purchase_date:      string | null
  purchase_price:     number
  insurance_company:  string | null
  insurance_ref:      string | null
  insurance_expiry:   string | null
  control_expiry:     string | null
  driver:             string | null
  department:         string | null
  status:             'actif' | 'inactif' | 'en réparation' | 'vendu' | 'hors service'
  notes:              string | null
}

export interface StockItem {
  id:             ID
  user_id:        ID
  name:           string
  sku:            string | null
  reference:      string | null
  supplier_ref:   string | null
  category:       string | null
  unit:           string
  quantity:       number
  min_quantity:   number
  max_quantity:   number | null
  unit_price:     number
  purchase_price: number
  selling_price:  number
  vat_rate:       number
  supplier:       string | null
  location:       string | null
  description:    string | null
  notes:          string | null
  status:         'in_stock' | 'low_stock' | 'out_of_stock' | 'inactif' | 'archivé'
  last_restock:   string | null
  expiry_date:    string | null
}

export interface Project {
  id:          ID
  user_id:     ID
  name:        string
  description: string | null
  client_id:   ID | null
  client_name: string | null
  color:       string
  start_date:  string | null
  end_date:    string | null
  budget:      number
  spent:       number
  status:      'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled' | 'paused'
  priority:    'low' | 'medium' | 'normale' | 'high' | 'critical' | 'urgent'
  progress:    number
  manager:     string | null
  tags:        string[] | null
  created_at:  string
}

export interface Expense {
  id:           ID
  user_id:      ID
  project_id:   ID | null
  employee_id:  ID | null
  date:         string
  amount:       number
  category:     string
  description:  string | null
  receipt_url:  string | null
  month:        string
  created_at:   string
}

export interface DashboardKPIs {
  revenue:        { total: number; pending: number; overdue: number; thisMonth: number; growthPct: number }
  expenses:       { total: number; byCategory: Record<string, number>; thisMonth: number; growthPct: number }
  margin:         { net: number; marginPct: number }
  clients:        { total: number; active: number; new_this_month: number; churn_rate_pct: number }
  invoices:       { total: number; paid: number; pending: number; overdue: number; avg_payment_days: number }
  projects:       { total: number; active: number; budget_total: number; spent_total: number; margin_pct: number }
  employees:      { total: number; active: number; payroll_month: number; payroll_annual: number }
  fleet:          { total: number; active: number; total_km: number; cost_per_km: number; maintenance_due: number; insurance_due: number }
  stock:          { total: number; low_stock: number; out_of_stock: number; total_value: number; total_sell_value: number; rotation_days: number }
  cashflow:       { inflow: number; outflow: number; net: number; runway_months: number }
  top_clients:    Array<{ id: ID; name: string; revenue: number; invoice_count: number }>
  top_expenses:   Array<{ category: string; amount: number }>
  alerts:         Array<{ severity: 'info' | 'warning' | 'critical'; title: string; detail?: string; href?: string }>
  chart_revenue_vs_expenses: Array<{ month: string; year: number; key: string; revenus: number; depenses: number; marge: number }>
  chart_cashflow:             Array<{ month: string; key: string; inflow: number; outflow: number; net: number }>
  chart_top_categories:       Array<{ category: string; amount: number }>
  chart_clients_acquisition:  Array<{ month: string; new: number; lost: number }>
  chart_invoice_aging:        Array<{ bucket: string; amount: number; count: number }>
}