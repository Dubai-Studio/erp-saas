-- ============================================================================
-- 20260919000008_external_invoices_diagnose.sql
--
-- Diagnostic brutal + réparation définitive pour external_invoices.
-- Affiche l'état réel de la table (colonnes, triggers, policies, fonction),
-- tente de recréer ce qui manque, et NOTIFY pgrst en fin.
--
-- IMPORTANT : "Reload schema cache" dans Supabase Dashboard après exécution.
-- ============================================================================

DO $$ BEGIN
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE 'DIAGNOSTIC external_invoices';
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
END $$;

-- 1. État de la table
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN
    SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='external_invoices'
      ORDER BY ordinal_position
  LOOP
    RAISE NOTICE '  COL % : % (nullable=%, default=%)',
      r.column_name, r.data_type, r.is_nullable, COALESCE(r.column_default::text, 'NULL');
  END LOOP;
END $$;

-- 2. RLS activé ?
DO $$ BEGIN
  RAISE NOTICE '  RLS_ENABLED = %',
    (SELECT relrowsecurity FROM pg_class WHERE relname='external_invoices' AND relnamespace='public'::regnamespace);
END $$;

-- 3. Triggers présents sur external_invoices
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT tgname FROM pg_trigger
    WHERE tgrelid = 'public.external_invoices'::regclass AND NOT tgisinternal
  LOOP
    RAISE NOTICE '  TRIGGER %', r.tgname;
  END LOOP;
END $$;

-- 4. Policies présentes
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN
    SELECT policyname, cmd::text AS cmd, qual AS using_clause, with_check
      FROM pg_policies WHERE schemaname='public' AND tablename='external_invoices'
  LOOP
    RAISE NOTICE '  POLICY % (cmd=%) USING=% WITH_CHECK=%',
      r.policyname, r.cmd, COALESCE(r.using_clause, 'NULL'), COALESCE(r.with_check, 'NULL');
  END LOOP;
END $$;

-- 5. Garantir la fonction set_user_id (idempotent)
CREATE OR REPLACE FUNCTION public.set_user_id()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    NEW.user_id := auth.uid();
  END IF;
  RETURN NEW;
END $$;
DO $$ BEGIN
  RAISE NOTICE '✅ fonction public.set_user_id() OK';
END $$;

-- 6. Garantir la colonne user_id (idempotent, sans casser les rows existantes)
ALTER TABLE public.external_invoices
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
DO $$ BEGIN
  RAISE NOTICE '✅ colonne user_id OK';
END $$;

-- 7. Drop & recréer trigger trg_set_user_id sur external_invoices
DROP TRIGGER IF EXISTS trg_set_user_id ON public.external_invoices;
CREATE TRIGGER trg_set_user_id
  BEFORE INSERT ON public.external_invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();
DO $$ BEGIN
  RAISE NOTICE '✅ trigger trg_set_user_id (BEFORE INSERT) recréé';
END $$;

-- 8. RLS activé (idempotent)
ALTER TABLE public.external_invoices ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  RAISE NOTICE '✅ RLS activé';
END $$;

-- 9. Drop & recréer les 4 policies (les plus permissives "owner-only")
DROP POLICY IF EXISTS tenant_select ON public.external_invoices;
DROP POLICY IF EXISTS tenant_insert ON public.external_invoices;
DROP POLICY IF EXISTS tenant_update ON public.external_invoices;
DROP POLICY IF EXISTS tenant_delete ON public.external_invoices;

CREATE POLICY tenant_select ON public.external_invoices
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY tenant_insert ON public.external_invoices
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY tenant_update ON public.external_invoices
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY tenant_delete ON public.external_invoices
  FOR DELETE TO authenticated USING (user_id = auth.uid());

DO $$ BEGIN
  RAISE NOTICE '✅ 4 policies tenant_* recréées (SELECT/INSERT/UPDATE/DELETE)';
END $$;

-- 10. NOTIFY PostgREST
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

DO $$ BEGIN
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE 'PROCHAINE ÉTAPE : Dashboard → Settings → API → "Reload schema cache"';
  RAISE NOTICE 'Puis hard-refresh navigateur (Ctrl+Shift+R) sur la page Invoices.';
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
END $$;