-- Migration 04 : aligner les valeurs existantes de `type` puis appliquer la contrainte élargie.
-- Concerne les rows legacy : 'incoming'/'outgoing' utilisées à tort dans `invoices`
-- et 'outgoing'/'other' dans `external_invoices`.

BEGIN;

-- 1. invoices : migrer 'incoming' et 'outgoing' vers 'invoice'
UPDATE public.invoices SET type = 'invoice' WHERE type NOT IN ('invoice','quote','credit_note','proforma','facture','devis','avoir','facture_proforma');
UPDATE public.invoices SET type = 'invoice' WHERE type IS NULL OR type = '';

-- 2. external_invoices : migrer 'outgoing'/'other' vers 'incoming'
UPDATE public.external_invoices SET type = 'incoming' WHERE type NOT IN ('incoming','supplier_invoice','facture_fournisseur','expense');
UPDATE public.external_invoices SET type = 'incoming' WHERE type IS NULL OR type = '';

-- 3. invoices.type : contrainte FR + EN
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_type_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_type_check
  CHECK (type = ANY (ARRAY['invoice','quote','credit_note','proforma','facture','devis','avoir','facture_proforma']));

-- 4. external_invoices.type : idem
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'external_invoices_type_check'
  ) THEN
    ALTER TABLE public.external_invoices DROP CONSTRAINT external_invoices_type_check;
    ALTER TABLE public.external_invoices ADD CONSTRAINT external_invoices_type_check
      CHECK (type = ANY (ARRAY['incoming','supplier_invoice','facture_fournisseur','expense']));
  END IF;
END $$;

-- 5. Vérification : aucun row ne viole la nouvelle contrainte
DO $$
DECLARE
  bad_count INT;
BEGIN
  SELECT COUNT(*) INTO bad_count FROM public.invoices
    WHERE type NOT IN ('invoice','quote','credit_note','proforma','facture','devis','avoir','facture_proforma');
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'Migration incomplete: % rows still have invalid type', bad_count;
  END IF;
END $$;

COMMIT;
