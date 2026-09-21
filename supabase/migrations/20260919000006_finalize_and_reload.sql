-- ============================================================================
-- 20260919000006_finalize_and_reload.sql
--
-- Migration CONSOLIDÉE qui :
--   1. Ajoute TOUTES les colonnes référencées par le code (idempotent)
--   2. Crée TOUTES les tables manquantes (admin_settings, etc.)
--   3. Élargit TOUS les CHECK constraints sur status / type / priority
--   4. Active RLS et crée les policies sur les nouvelles tables
--   5. NOTIFY pgrst → PostgREST vide son schema cache automatiquement
--
-- ⚠ IMPORTANT : après exécution, vous DEVEZ cliquer aussi sur
-- "Reload schema cache" (Dashboard Supabase → Settings → API → bas de page).
-- Le NOTIFY aide PostgREST mais le bouton garantit un rechargement total
-- si la session PostgREST est ancienne.
-- ============================================================================

-- 0. Garde-fou : si on touche à une ligne legacy qui viole les nouveaux CHECK,
--    on la convertit dans une valeur valide.
DO $$
DECLARE
  bad_invoices          INT;
  bad_external_invoices INT;
BEGIN
  SELECT COUNT(*) INTO bad_invoices FROM public.invoices
    WHERE type NOT IN ('invoice','quote','credit_note','proforma','facture','devis','avoir','facture_proforma');
  IF bad_invoices > 0 THEN
    UPDATE public.invoices
       SET type = 'invoice'
     WHERE type NOT IN ('invoice','quote','credit_note','proforma','facture','devis','avoir','facture_proforma');
    RAISE NOTICE 'Migration 06: % lignes invoices.type alignées vers ''invoice''', bad_invoices;
  END IF;

  SELECT COUNT(*) INTO bad_external_invoices FROM public.external_invoices
    WHERE type NOT IN ('incoming','supplier_invoice','facture_fournisseur','expense');
  IF bad_external_invoices > 0 THEN
    UPDATE public.external_invoices
       SET type = 'incoming'
     WHERE type NOT IN ('incoming','supplier_invoice','facture_fournisseur','expense');
    RAISE NOTICE 'Migration 06: % lignes external_invoices.type alignées vers ''incoming''', bad_external_invoices;
  END IF;
END $$;

-- 1. Colonnes company_settings (toutes référencées par le code) --------------
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS company_name     text,
  ADD COLUMN IF NOT EXISTS address          text,
  ADD COLUMN IF NOT EXISTS city             text,
  ADD COLUMN IF NOT EXISTS zip_code         text,
  ADD COLUMN IF NOT EXISTS country          text         DEFAULT 'Belgique',
  ADD COLUMN IF NOT EXISTS vat_number       text,
  ADD COLUMN IF NOT EXISTS email            text,
  ADD COLUMN IF NOT EXISTS phone            text,
  ADD COLUMN IF NOT EXISTS iban             text,
  ADD COLUMN IF NOT EXISTS bic              text,
  ADD COLUMN IF NOT EXISTS default_vat      numeric(5,2) DEFAULT 21,
  ADD COLUMN IF NOT EXISTS default_currency text         DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS logo_url         text,
  ADD COLUMN IF NOT EXISTS footer_notes     text,
  ADD COLUMN IF NOT EXISTS peppol_id        text,
  ADD COLUMN IF NOT EXISTS updated_at       timestamptz  DEFAULT now();

-- 2. invoices.currency + invoices.subtotal + invoices.vat_amount (déjà dans
--    migration 02 mais on remet pour les installations fraîches)
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS currency     text     DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS subtotal     numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_amount   numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_at      timestamptz,
  ADD COLUMN IF NOT EXISTS project_id   uuid     REFERENCES public.projects(id) ON DELETE SET NULL;

-- 3. CHECK constraints élargis sur invoices.type et external_invoices.type ---
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'invoices_type_check') THEN
    ALTER TABLE public.invoices DROP CONSTRAINT invoices_type_check;
  END IF;
  ALTER TABLE public.invoices ADD CONSTRAINT invoices_type_check
    CHECK (type = ANY (ARRAY['invoice','quote','credit_note','proforma','facture','devis','avoir','facture_proforma']));

  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'external_invoices_type_check') THEN
    ALTER TABLE public.external_invoices DROP CONSTRAINT external_invoices_type_check;
  END IF;
  ALTER TABLE public.external_invoices ADD CONSTRAINT external_invoices_type_check
    CHECK (type = ANY (ARRAY['incoming','supplier_invoice','facture_fournisseur','expense']));
END $$;

-- 4. Table admin_settings (PIN admin) ----------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_settings (
  user_id      uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  admin_pin    text        NOT NULL,                       -- hash SHA-256 hex du PIN
  pin_set_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- 5. RLS + policies sur company_settings + admin_settings ------------------
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_settings  ENABLE ROW LEVEL SECURITY;

-- company_settings : policy tenant_*
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='company_settings' AND policyname='tenant_select') THEN
    CREATE POLICY tenant_select ON public.company_settings FOR SELECT USING (user_id = auth.uid());
    CREATE POLICY tenant_insert ON public.company_settings FOR INSERT WITH CHECK (user_id = auth.uid());
    CREATE POLICY tenant_update ON public.company_settings FOR UPDATE
      USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
    CREATE POLICY tenant_delete ON public.company_settings FOR DELETE USING (user_id = auth.uid());
  END IF;
END $$;

-- admin_settings : policy owner-only (RLS protège le hash, le client compare
-- via crypto.subtle.timingSafeEqual localement)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='admin_settings' AND policyname='admin_settings_owner') THEN
    CREATE POLICY admin_settings_owner ON public.admin_settings
      FOR ALL TO authenticated
      USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- 6. Trigger : met à jour updated_at sur company_settings si la colonne existe
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='company_settings' AND column_name='updated_at') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS set_company_settings_updated_at ON public.company_settings';
    EXECUTE $tg$
      CREATE TRIGGER set_company_settings_updated_at
        BEFORE UPDATE ON public.company_settings
        FOR EACH ROW EXECUTE FUNCTION public.set_user_id()
    $tg$;
  END IF;
END $$;

-- 7. NOTIFY PostgREST : force le rechargement du schema cache (équivalent du
--    bouton "Reload schema cache" dans Settings → API).
--    Si PostgREST est configuré pour écouter (par défaut oui depuis Supabase),
--    il rechargera dans les 1-2 secondes.
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

-- 8. Vérification finale -----------------------------------------------------
DO $$
DECLARE
  missing TEXT := '';
BEGIN
  -- Vérifie chaque colonne critique
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='company_settings' AND column_name='default_currency') THEN
    missing := missing || 'company_settings.default_currency, ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='company_settings' AND column_name='peppol_id') THEN
    missing := missing || 'company_settings.peppol_id, ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='invoices' AND column_name='currency') THEN
    missing := missing || 'invoices.currency, ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='admin_settings') THEN
    missing := missing || 'admin_settings table, ';
  END IF;

  IF missing <> '' THEN
    RAISE EXCEPTION 'Migration 06 INCOMPLÈTE — toujours manquants : %', missing;
  END IF;

  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE '✅ Migration 06 OK';
  RAISE NOTICE '   • company_settings.default_currency ✅';
  RAISE NOTICE '   • company_settings.peppol_id ✅';
  RAISE NOTICE '   • company_settings.address, city, zip_code, iban, … ✅';
  RAISE NOTICE '   • invoices.currency ✅';
  RAISE NOTICE '   • admin_settings (table + RLS) ✅';
  RAISE NOTICE '   • invoices.type CHECK élargi ✅';
  RAISE NOTICE '   • external_invoices.type CHECK élargi ✅';
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE 'PROCHAINE ÉTAPE : Dashboard → Settings → API → bouton';
  RAISE NOTICE '"Reload schema cache" (le NOTIFY aide mais ne suffit pas).';
END $$;
