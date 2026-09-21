-- ============================================================================
-- 20260919000005_company_settings_full.sql
-- Ajoute toutes les colonnes référencées par le code dans company_settings
--   (default_currency, default_vat, logo_url, address, city, zip_code, phone,
--    email, iban, bic, vat_number, siret/peppol, footer_notes).
-- + élargit la contrainte CHECK pour external_invoices.type si elle existe
--   (au cas où la migration 04 n'aurait pas été appliquée ou aurait été
--   annulée partiellement).
-- + crée la table admin_settings (mot de passe admin pour la page Paramètres).
--
-- Idempotent : peut être rejoué sans erreur.
-- À exécuter dans Supabase SQL Editor PUIS cliquer sur "Reload schema cache"
-- dans Settings → API.
-- ============================================================================

-- 1. Colonnes manquantes sur company_settings --------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='company_settings') THEN
    ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS company_name    text;
    ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS address         text;
    ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS city            text;
    ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS zip_code        text;
    ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS country         text DEFAULT 'Belgique';
    ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS vat_number      text;
    ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS email           text;
    ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS phone           text;
    ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS iban            text;
    ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS bic             text;
    ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS default_vat     numeric(5,2) DEFAULT 21;
    ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS default_currency text DEFAULT 'EUR';
    ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS logo_url        text;
    ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS footer_notes    text;
    ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS peppol_id       text;
  END IF;
END $$;

-- 2. S'assure que RLS est activée et que la policy tenant_select existe (sécurise)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='company_settings') THEN
    ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
    -- Drop & recréer la policy si elle manque
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='company_settings' AND policyname='tenant_select') THEN
      CREATE POLICY tenant_select ON public.company_settings FOR SELECT USING (user_id = auth.uid());
      CREATE POLICY tenant_insert ON public.company_settings FOR INSERT WITH CHECK (user_id = auth.uid());
      CREATE POLICY tenant_update ON public.company_settings FOR UPDATE
        USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
      CREATE POLICY tenant_delete ON public.company_settings FOR DELETE USING (user_id = auth.uid());
    END IF;
  END IF;
END $$;

-- 3. Élargit external_invoices.type si la contrainte existe (idempotent) ----
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'external_invoices_type_check'
  ) THEN
    -- Récupère les valeurs existantes via une migration de données
    UPDATE public.external_invoices
       SET type = 'incoming'
     WHERE type IS NULL OR type NOT IN ('incoming','supplier_invoice','facture_fournisseur','expense');
    ALTER TABLE public.external_invoices DROP CONSTRAINT external_invoices_type_check;
    ALTER TABLE public.external_invoices ADD CONSTRAINT external_invoices_type_check
      CHECK (type = ANY (ARRAY['incoming','supplier_invoice','facture_fournisseur','expense']));
  END IF;
END $$;

-- 4. Idem pour invoices.type
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'invoices_type_check'
  ) THEN
    UPDATE public.invoices
       SET type = 'invoice'
     WHERE type IS NULL OR type NOT IN ('invoice','quote','credit_note','proforma','facture','devis','avoir','facture_proforma');
    ALTER TABLE public.invoices DROP CONSTRAINT invoices_type_check;
    ALTER TABLE public.invoices ADD CONSTRAINT invoices_type_check
      CHECK (type = ANY (ARRAY['invoice','quote','credit_note','proforma','facture','devis','avoir','facture_proforma']));
  END IF;
END $$;

-- 5. Table admin_settings (mot de passe admin pour page Paramètres) -------
CREATE TABLE IF NOT EXISTS public.admin_settings (
  user_id      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  admin_pin    text NOT NULL,                           -- hash bcrypt/SHA du PIN
  pin_set_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

-- L'user peut lire/écrire SON admin_settings uniquement (mais le code Node
-- vérifie le pin avant de renvoyer les colonnes sensibles — secret côté serveur)
DROP POLICY IF EXISTS admin_settings_owner ON public.admin_settings;
CREATE POLICY admin_settings_owner ON public.admin_settings
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 6. Table settings (singulier, l'app-wide non-user-scoped) — la garder ----
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authenticated_read_settings ON public.settings;
CREATE POLICY authenticated_read_settings ON public.settings
  FOR SELECT TO authenticated USING (true);

-- 7. Notification post-migration (lue dans SQL Editor history)
DO $$
BEGIN
  RAISE NOTICE 'Migration 05 appliquée : company_settings enrichie, admin_settings créée, contraintes invoices/external_invoices.type élargies.';
  RAISE NOTICE 'IMPORTANT : dans le dashboard Supabase → Settings → API → "Reload schema cache" !';
END $$;
