-- Élargit le CHECK constraint invoices.type pour accepter FR + EN
-- Permet au code d'envoyer 'invoice' (EN) sans casser sur les anciens enregistrements FR.

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_type_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_type_check
  CHECK (type = ANY (ARRAY['invoice','quote','credit_note','proforma','facture','devis','avoir','facture_proforma']));

-- Idem pour external_invoices (fournisseurs) si un type distinct existe
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
