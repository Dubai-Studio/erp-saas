-- ============================================================
-- ERP SaaS — Schema Supabase complet
-- À exécuter dans l'éditeur SQL de Supabase (SQL Editor)
-- ============================================================

-- ─── 1. TABLE fleet_expenses ───────────────────────────────
CREATE TABLE IF NOT EXISTS fleet_expenses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id   UUID NOT NULL REFERENCES fleet(id) ON DELETE CASCADE,
  vehicle_name TEXT,
  plate        TEXT,
  type         TEXT NOT NULL DEFAULT 'fuel',
  amount       NUMERIC(12,2) NOT NULL DEFAULT 0,
  vat_rate     NUMERIC(5,2) NOT NULL DEFAULT 21,
  description  TEXT,
  date         DATE NOT NULL DEFAULT CURRENT_DATE,
  km           NUMERIC(10,0),
  invoice_ref  TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Si la table existe déjà mais manque des colonnes :
ALTER TABLE fleet_expenses ADD COLUMN IF NOT EXISTS vehicle_name TEXT;
ALTER TABLE fleet_expenses ADD COLUMN IF NOT EXISTS plate        TEXT;
ALTER TABLE fleet_expenses ADD COLUMN IF NOT EXISTS type         TEXT NOT NULL DEFAULT 'fuel';
ALTER TABLE fleet_expenses ADD COLUMN IF NOT EXISTS vat_rate     NUMERIC(5,2) NOT NULL DEFAULT 21;
ALTER TABLE fleet_expenses ADD COLUMN IF NOT EXISTS km           NUMERIC(10,0);
ALTER TABLE fleet_expenses ADD COLUMN IF NOT EXISTS invoice_ref  TEXT;
ALTER TABLE fleet_expenses ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ DEFAULT NOW();

-- Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_fleet_expenses_vehicle_id ON fleet_expenses(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_fleet_expenses_date       ON fleet_expenses(date DESC);

-- RLS
ALTER TABLE fleet_expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fleet_expenses_all" ON fleet_expenses;
CREATE POLICY "fleet_expenses_all" ON fleet_expenses FOR ALL USING (true);
GRANT ALL ON fleet_expenses TO anon, authenticated, service_role;


-- ─── 2. TABLE pay_adjustments ──────────────────────────────
CREATE TABLE IF NOT EXISTS pay_adjustments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  type        TEXT NOT NULL DEFAULT 'bonus',  -- bonus | advance | deduction | correction
  amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  reason      TEXT NOT NULL,
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  month       TEXT,  -- format YYYY-MM
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Si la table existe déjà mais manque des colonnes :
ALTER TABLE pay_adjustments ADD COLUMN IF NOT EXISTS date  DATE NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE pay_adjustments ADD COLUMN IF NOT EXISTS month TEXT;

-- Index
CREATE INDEX IF NOT EXISTS idx_pay_adjustments_employee_id ON pay_adjustments(employee_id);
CREATE INDEX IF NOT EXISTS idx_pay_adjustments_month       ON pay_adjustments(month);

-- RLS
ALTER TABLE pay_adjustments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pay_adjustments_all" ON pay_adjustments;
CREATE POLICY "pay_adjustments_all" ON pay_adjustments FOR ALL USING (true);
GRANT ALL ON pay_adjustments TO anon, authenticated, service_role;


-- ─── 3. TABLE employees — colonnes supplémentaires ─────────
ALTER TABLE employees ADD COLUMN IF NOT EXISTS payment_method    TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS payment_day       INTEGER DEFAULT 28;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS payment_frequency TEXT DEFAULT 'Mensuel';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS iban              TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS national_id       TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS address           TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS emergency_contact TEXT;


-- ─── 4. TABLE company_settings ─────────────────────────────
CREATE TABLE IF NOT EXISTS company_settings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL UNIQUE,
  company_name TEXT,
  vat_number   TEXT,
  email        TEXT,
  phone        TEXT,
  address      TEXT,
  city         TEXT,
  country      TEXT DEFAULT 'Belgique',
  iban         TEXT,
  bic          TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_settings_owner" ON company_settings;
CREATE POLICY "company_settings_owner" ON company_settings
  FOR ALL USING (user_id = auth.uid());
GRANT ALL ON company_settings TO anon, authenticated, service_role;


-- ─── 5. TABLE fleet — vérification colonnes ────────────────
ALTER TABLE fleet ADD COLUMN IF NOT EXISTS driver_id  UUID;
ALTER TABLE fleet ADD COLUMN IF NOT EXISTS fuel_card  TEXT;
ALTER TABLE fleet ADD COLUMN IF NOT EXISTS location   TEXT;
ALTER TABLE fleet ADD COLUMN IF NOT EXISTS notes      TEXT;
ALTER TABLE fleet ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
