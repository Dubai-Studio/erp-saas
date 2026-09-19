-- ============================================================================
-- 20260919000001_tenant_isolation.sql
-- Isolation multi-tenant + Row Level Security
-- À exécuter dans Supabase Studio → SQL Editor (sur la prod DB).
-- Idempotent : peut être rejoué en développement.
-- ============================================================================

-- 1. Colonnes user_id manquantes (FK vers auth.users) --------------------------

ALTER TABLE public.clients          ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.invoices         ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.external_invoices ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.employees        ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.employee_payments ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.fleet_vehicles   ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.fleet_expenses   ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.stock_items      ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.stock_movements  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- employee_payments dérive d'un employé (donc user_id par transitivité).
-- On garde user_id dénormalisé pour des requêtes directes sans jointure.

-- 2. Indexes ------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_clients_user           ON public.clients(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_user          ON public.invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_external_invoices_user ON public.external_invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_employees_user         ON public.employees(user_id);
CREATE INDEX IF NOT EXISTS idx_employee_payments_user ON public.employee_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_fleet_vehicles_user    ON public.fleet_vehicles(user_id);
CREATE INDEX IF NOT EXISTS idx_fleet_expenses_user    ON public.fleet_expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_stock_items_user       ON public.stock_items(user_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_user   ON public.stock_movements(user_id);

CREATE INDEX IF NOT EXISTS idx_invoices_status        ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_issue_date    ON public.invoices(issue_date);
CREATE INDEX IF NOT EXISTS idx_external_invoices_status ON public.external_invoices(status);
CREATE INDEX IF NOT EXISTS idx_fleet_expenses_date    ON public.fleet_expenses(date);
CREATE INDEX IF NOT EXISTS idx_stock_movements_date   ON public.stock_movements(date);
CREATE INDEX IF NOT EXISTS idx_time_entries_date      ON public.time_entries(date);

-- 3. Activer RLS --------------------------------------------------------------

ALTER TABLE public.clients            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_invoices  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_payments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_vehicles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_expenses     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entries       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pay_adjustments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_settings   ENABLE ROW LEVEL SECURITY;

-- 4. Policies : un utilisateur ne lit/écrit que ses lignes -------------------

-- Helper : policy pour table avec colonne user_id explicite
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'clients','invoices','external_invoices','projects',
      'employees','employee_payments',
      'fleet_vehicles','fleet_expenses',
      'stock_items','stock_movements',
      'expenses','time_entries','pay_adjustments','company_settings'
    ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_select ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_insert ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_update ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_delete ON public.%I', t);

    EXECUTE format($f$
      CREATE POLICY tenant_select ON public.%I
        FOR SELECT USING (user_id = auth.uid())
    $f$, t);
    EXECUTE format($f$
      CREATE POLICY tenant_insert ON public.%I
        FOR INSERT WITH CHECK (user_id = auth.uid())
    $f$, t);
    EXECUTE format($f$
      CREATE POLICY tenant_update ON public.%I
        FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())
    $f$, t);
    EXECUTE format($f$
      CREATE POLICY tenant_delete ON public.%I
        FOR DELETE USING (user_id = auth.uid())
    $f$, t);
  END LOOP;
END $$;

-- 5. Trigger de remplissage automatique de user_id si absent ------------------
-- Garantit que les INSERT côté serveur (SERVICE key) injectent auth.uid()
-- si l'appelant oublie de le préciser. Côté ANON key, la policy INSERT
-- exige déjà user_id = auth.uid(), donc elle rejette les autres valeurs.

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
      'clients','invoices','external_invoices','employees','employee_payments',
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

-- 6. Storage policies ---------------------------------------------------------
-- Buckets attendus : 'invoices' (PDFs sortants), 'receipts' (justificatifs),
-- 'attachments' (pièces jointes diverses). À créer depuis le dashboard Supabase
-- s'ils n'existent pas, puis appliquer les policies ci-dessous.

-- IMPORTANT : ces policies exigent que le bucket existe. Si le bucket n'est pas
-- encore créé, l'instruction lèvera une erreur ; créer le bucket d'abord.

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

-- 7. Nettoyage : ancien code mort éventuel -----------------------------------
-- Si la table 'invoices' stockait `x-user-id` côté payload JSON, on ne peut
-- rien faire ici. Le code applicatif doit maintenant lire depuis auth.uid().

-- 8. Note --------------------------------------------------------------------
-- Le projet utilise actuellement SUPABASE_SERVICE_KEY partout, ce qui bypasse
-- RLS. Le code applicatif doit basculer sur l'ANON key (avec le JWT du user)
-- pour que les policies s'appliquent. Voir lib/supabase-server.ts.