-- ============================================================================
-- 20260919000002_align_schema_for_app.sql
-- Aligne le schéma existant avec les besoins du code :
--   * ajoute user_id aux tables qui n'en ont pas
--   * élargit les CHECK constraints status/type pour accepter
--     les valeurs utilisées par le code
--   * active RLS, crée policies, indexes, trigger
--
-- Idempotent : peut être rejoué.
-- À exécuter APRÈS 20260919000001_tenant_isolation.sql (ou en remplacement
-- si les colonnes/enums sont déjà OK, grâce aux clauses IF NOT EXISTS).
-- ============================================================================

-- 1. Colonnes user_id manquantes ---------------------------------------------

ALTER TABLE public.clients           ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.invoices          ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.external_invoices ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.employees         ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.fleet_vehicles    ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.fleet_expenses    ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.stock_items       ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.stock_movements   ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- client_id nullable sur stock_movements si pas déjà (au cas où)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='stock_movements' AND column_name='client_id') THEN
    -- OK, déjà là
    NULL;
  END IF;
END $$;

-- 2. Élargir les CHECK constraints status / type ----------------------------

-- invoices.status : ajouter 'pending'
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_status_check
  CHECK (status = ANY (ARRAY['draft','sent','paid','overdue','cancelled','pending']));

-- external_invoices.status : ajouter 'overdue', 'cancelled'
ALTER TABLE public.external_invoices DROP CONSTRAINT IF EXISTS external_invoices_status_check;
ALTER TABLE public.external_invoices ADD CONSTRAINT external_invoices_status_check
  CHECK (status = ANY (ARRAY['pending','paid','contested','overdue','cancelled']));

-- clients.status : ajouter 'archived'
ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_status_check;
ALTER TABLE public.clients ADD CONSTRAINT clients_status_check
  CHECK (status = ANY (ARRAY['active','inactive','prospect','archived']));

-- projects.status : ajouter 'paused'
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE public.projects ADD CONSTRAINT projects_status_check
  CHECK (status = ANY (ARRAY['planning','active','on_hold','completed','cancelled','paused']));

-- projects.priority : ajouter 'normale' et 'urgent' (le code envoie ces valeurs)
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_priority_check;
ALTER TABLE public.projects ADD CONSTRAINT projects_priority_check
  CHECK (priority = ANY (ARRAY['low','medium','high','critical','normale','urgent']));

-- time_entries.status : ajouter 'submitted', 'approved'
ALTER TABLE public.time_entries DROP CONSTRAINT IF EXISTS time_entries_status_check;
ALTER TABLE public.time_entries ADD CONSTRAINT time_entries_status_check
  CHECK (status = ANY (ARRAY['draft','validated','paid','submitted','approved']));

-- stock_movements.type : ajouter les alias EN ('in', 'out', 'adjust') à côté des FR
ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_type_check;
ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_type_check
  CHECK (type = ANY (ARRAY[
    'entrée','sortie','ajustement','retour','transfert',
    'in','out','adjust'
  ]));

-- stock_items.status : union complète FR + EN (déjà permissive)
ALTER TABLE public.stock_items DROP CONSTRAINT IF EXISTS stock_items_status_check;
ALTER TABLE public.stock_items ADD CONSTRAINT stock_items_status_check
  CHECK (status = ANY (ARRAY[
    'actif','inactif','rupture','archivé',
    'active','inactive','archived','out_of_stock','in_stock','low_stock',
    'en stock','stock faible','rupture de stock'
  ]));

-- 3. Colonnes utiles pour le code (si absentes) ------------------------------

-- invoices.paid_at
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS paid_at timestamptz;

-- invoices.project_id
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;

-- invoices.subtotal, vat_amount, currency
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS subtotal numeric(12,2) DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS vat_amount numeric(12,2) DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS currency text DEFAULT 'EUR';

-- clients.zip_code (si pas déjà)
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS zip_code text;

-- external_invoices.project_id
ALTER TABLE public.external_invoices ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;
ALTER TABLE public.external_invoices ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;

-- employees.worker_type existe déjà, on s'assure que contract_type est absent
-- (le code lit/écrit worker_type)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='employees' AND column_name='contract_type') THEN
    RAISE NOTICE 'Colonne employees.contract_type existe encore, le code va ignorer ce nom et utiliser worker_type';
  END IF;
END $$;

-- stock_movements : alias product_id → stock_item_id
-- Le code attend product_id mais la DB s'appelle stock_item_id.
-- On crée une vue ou on ajoute un alias. Le plus simple : vue.
CREATE OR REPLACE VIEW public.stock_movements_view AS
SELECT
  id, user_id, stock_item_id AS product_id, type, quantity, unit_price,
  reason, reference, date, created_at
FROM public.stock_movements;

-- 4. Indexes ----------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_clients_user            ON public.clients(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_user           ON public.invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_external_invoices_user  ON public.external_invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_employees_user          ON public.employees(user_id);
CREATE INDEX IF NOT EXISTS idx_fleet_vehicles_user     ON public.fleet_vehicles(user_id);
CREATE INDEX IF NOT EXISTS idx_fleet_expenses_user     ON public.fleet_expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_stock_items_user        ON public.stock_items(user_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_user    ON public.stock_movements(user_id);

CREATE INDEX IF NOT EXISTS idx_invoices_project        ON public.invoices(project_id);
CREATE INDEX IF NOT EXISTS idx_invoices_client         ON public.invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status        ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_issue_date    ON public.invoices(issue_date);
CREATE INDEX IF NOT EXISTS idx_external_invoices_status ON public.external_invoices(status);
CREATE INDEX IF NOT EXISTS idx_external_invoices_issue_date ON public.external_invoices(issue_date);
CREATE INDEX IF NOT EXISTS idx_fleet_expenses_date    ON public.fleet_expenses(date);
CREATE INDEX IF NOT EXISTS idx_stock_movements_date   ON public.stock_movements(date);
CREATE INDEX IF NOT EXISTS idx_time_entries_date      ON public.time_entries(date);

-- 5. Activer RLS sur toutes les tables --------------------------------------

ALTER TABLE public.clients            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_invoices  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_vehicles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_expenses     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entries       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pay_adjustments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_settings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings           ENABLE ROW LEVEL SECURITY;  -- protégé quand même (default deny)

-- 6. Policies tenant_ -------------------------------------------------------

DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'clients','invoices','external_invoices','projects',
      'employees','fleet_vehicles','fleet_expenses',
      'stock_items','stock_movements',
      'expenses','time_entries','pay_adjustments','company_settings'
    ])
  LOOP
    -- Drop policies existantes si réexécution
    EXECUTE format('DROP POLICY IF EXISTS tenant_select ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_insert ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_update ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_delete ON public.%I', t);

    -- company_settings utilise user_id UNIQUE, les autres utilisent juste user_id
    IF t = 'company_settings' THEN
      EXECUTE format($f$
        CREATE POLICY tenant_select ON public.%I FOR SELECT USING (user_id = auth.uid())
      $f$, t);
      EXECUTE format($f$
        CREATE POLICY tenant_insert ON public.%I FOR INSERT WITH CHECK (user_id = auth.uid())
      $f$, t);
      EXECUTE format($f$
        CREATE POLICY tenant_update ON public.%I FOR UPDATE
        USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())
      $f$, t);
      EXECUTE format($f$
        CREATE POLICY tenant_delete ON public.%I FOR DELETE USING (user_id = auth.uid())
      $f$, t);
    ELSE
      EXECUTE format($f$
        CREATE POLICY tenant_select ON public.%I FOR SELECT USING (user_id = auth.uid())
      $f$, t);
      EXECUTE format($f$
        CREATE POLICY tenant_insert ON public.%I FOR INSERT WITH CHECK (user_id = auth.uid())
      $f$, t);
      EXECUTE format($f$
        CREATE POLICY tenant_update ON public.%I FOR UPDATE
        USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())
      $f$, t);
      EXECUTE format($f$
        CREATE POLICY tenant_delete ON public.%I FOR DELETE USING (user_id = auth.uid())
      $f$, t);
    END IF;
  END LOOP;
END $$;

-- 7. Trigger set_user_id (idempotent) ---------------------------------------

CREATE OR REPLACE FUNCTION public.set_user_id()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    NEW.user_id := auth.uid();
  END IF;
  RETURN NEW;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'clients','invoices','external_invoices','employees',
      'fleet_vehicles','fleet_expenses','stock_items','stock_movements'
    ])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_set_user_id ON public.%I', t);
    EXECUTE format($f$
      CREATE TRIGGER trg_set_user_id
        BEFORE INSERT ON public.%I
        FOR EACH ROW EXECUTE FUNCTION public.set_user_id()
    $f$, t);
  END LOOP;
END $$;

-- 8. Policy pour la table settings (app-wide, pas user-scoped) -------------
-- Tu pourras la modifier si tu veux que settings soit par-user.
-- Par défaut : lecture aux authentifiés, écriture refusée sauf via service role.

DROP POLICY IF EXISTS authenticated_read_settings ON public.settings;
CREATE POLICY authenticated_read_settings ON public.settings
  FOR SELECT TO authenticated USING (true);

-- 9. Storage policies (buckets à créer depuis le dashboard si pas encore) ---

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE name = 'invoices') THEN
    DROP POLICY IF EXISTS invoices_user ON storage.objects;
    CREATE POLICY invoices_user ON storage.objects
      FOR ALL TO authenticated
      USING  (bucket_id = 'invoices' AND (storage.foldername(name))[1] = auth.uid()::text)
      WITH CHECK (bucket_id = 'invoices' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;

  IF EXISTS (SELECT 1 FROM storage.buckets WHERE name = 'receipts') THEN
    DROP POLICY IF EXISTS receipts_user ON storage.objects;
    CREATE POLICY receipts_user ON storage.objects
      FOR ALL TO authenticated
      USING  (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text)
      WITH CHECK (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;

  IF EXISTS (SELECT 1 FROM storage.buckets WHERE name = 'attachments') THEN
    DROP POLICY IF EXISTS attachments_user ON storage.objects;
    CREATE POLICY attachments_user ON storage.objects
      FOR ALL TO authenticated
      USING  (bucket_id = 'attachments' AND (storage.foldername(name))[1] = auth.uid()::text)
      WITH CHECK (bucket_id = 'attachments' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
END $$;

-- 10. Vérification finale ----------------------------------------------------

DO $$
DECLARE t text; cnt int;
BEGIN
  FOR t IN SELECT unnest(ARRAY['clients','invoices','external_invoices','employees','fleet_vehicles','fleet_expenses','stock_items','stock_movements']) LOOP
    SELECT count(*) INTO cnt FROM information_schema.columns
      WHERE table_schema='public' AND table_name=t AND column_name='user_id';
    IF cnt = 0 THEN
      RAISE EXCEPTION 'Migration incomplète : table %.user_id manquante', t;
    END IF;
  END LOOP;
  RAISE NOTICE 'Migration OK : user_id présent sur les 8 tables cibles, RLS active, policies créées.';
END $$;