-- ============================================================================
-- 20260919000007_external_invoices_rls_repair.sql
--
-- Réparation ciblée pour "new row violates row-level security policy" sur
-- external_invoices lors d'un INSERT. Le problème : soit le trigger
-- trg_set_user_id n'existe pas sur cette table, soit la policy tenant_insert
-- manque (les migrations 01/02 visaient à les poser mais leur exécution
-- idempotente peut laisser des trous si une exécution partielle a eu lieu).
--
-- On garantit :
--   1. Colonne user_id (uuid, FK auth.users) sur external_invoices
--   2. Fonction set_user_id() qui remplit NEW.user_id := auth.uid() si NULL
--   3. Trigger trg_set_user_id BEFORE INSERT sur external_invoices
--   4. Policy tenant_insert WITH CHECK (user_id = auth.uid())
--   5. Policy tenant_select USING (user_id = auth.uid())
--   6. NOTIFY pgrst pour recharger le cache
--
-- ⚠ IMPORTANT : après exécution, "Reload schema cache" dans Supabase Dashboard.
-- ============================================================================

-- 1. Colonne user_id (idempotent, NOT NULL après remplissage par trigger)
ALTER TABLE public.external_invoices
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_external_invoices_user_repair
  ON public.external_invoices(user_id);

-- 2. Fonction set_user_id (CREATE OR REPLACE = idempotent)
CREATE OR REPLACE FUNCTION public.set_user_id()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    NEW.user_id := auth.uid();
  END IF;
  RETURN NEW;
END $$;

-- 3. Trigger BEFORE INSERT sur external_invoices
DROP TRIGGER IF EXISTS trg_set_user_id ON public.external_invoices;
CREATE TRIGGER trg_set_user_id
  BEFORE INSERT ON public.external_invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

-- 4. RLS activé
ALTER TABLE public.external_invoices ENABLE ROW LEVEL SECURITY;

-- 5. Policies (DROP IF EXISTS puis CREATE = idempotent complet)
DROP POLICY IF EXISTS tenant_insert ON public.external_invoices;
CREATE POLICY tenant_insert ON public.external_invoices
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS tenant_select ON public.external_invoices;
CREATE POLICY tenant_select ON public.external_invoices
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS tenant_update ON public.external_invoices;
CREATE POLICY tenant_update ON public.external_invoices
  FOR UPDATE
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS tenant_delete ON public.external_invoices;
CREATE POLICY tenant_delete ON public.external_invoices
  FOR DELETE USING (user_id = auth.uid());

-- 6. Notification PostgREST
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

-- 7. Vérification finale avec RAISE NOTICE détaillé
DO $$
DECLARE
  has_col       BOOLEAN;
  has_func       BOOLEAN;
  has_trigger    BOOLEAN;
  has_policy_ins BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='external_invoices' AND column_name='user_id'
  ) INTO has_col;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='set_user_id'
  ) INTO has_func;

  SELECT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_set_user_id'
      AND tgrelid = 'public.external_invoices'::regclass
  ) INTO has_trigger;

  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='external_invoices' AND policyname='tenant_insert'
  ) INTO has_policy_ins;

  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE 'Migration 07 — external_invoices RLS repair :';
  RAISE NOTICE '  colonne user_id           : %', CASE WHEN has_col       THEN '✅' ELSE '❌' END;
  RAISE NOTICE '  fonction set_user_id()    : %', CASE WHEN has_func       THEN '✅' ELSE '❌' END;
  RAISE NOTICE '  trigger trg_set_user_id   : %', CASE WHEN has_trigger    THEN '✅' ELSE '❌' END;
  RAISE NOTICE '  policy tenant_insert      : %', CASE WHEN has_policy_ins THEN '✅' ELSE '❌' END;
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE 'PROCHAINE ÉTAPE : Dashboard → Settings → API → bouton';
  RAISE NOTICE '"Reload schema cache" (le NOTIFY aide mais ne suffit pas).';
END $$;