-- 20260919000012_external_invoices_vat_rate.sql
-- Ajoute la colonne `vat_rate` (taux de TVA en %) sur external_invoices.
-- Avant on stockait seulement `vat_amount` (€). Maintenant on stocke aussi
-- le taux (0/6/12/21 BE standard) ce qui correspond à ce qui est imprimé
-- sur la facture. Permet au formulaire d'afficher un selecteur cohérent
-- et à l'OCR d'extraire le taux affiché sur la facture.
--
-- Backfill : pour les factures existantes avec amount_ht > 0 et vat_amount
-- renseignés, on dérive le taux (arrondi 2 décimales). On évite d'écraser
-- les cas où amount_ht = 0 (données incomplètes).

ALTER TABLE public.external_invoices
  ADD COLUMN IF NOT EXISTS vat_rate numeric(5,2);

-- Backfill best-effort : vat_rate = vat_amount / amount_ht * 100.
UPDATE public.external_invoices
SET vat_rate = ROUND(((vat_amount / NULLIF(amount_ht, 0)) * 100)::numeric, 2)
WHERE vat_rate IS NULL
  AND amount_ht IS NOT NULL
  AND amount_ht > 0
  AND vat_amount IS NOT NULL;

COMMENT ON COLUMN public.external_invoices.vat_rate IS
  'Taux de TVA en pourcentage (BE: 0, 6, 12, 21). Dérivé de vat_amount/amount_ht si non renseigné.';

-- Recharge le cache PostgREST pour exposer la nouvelle colonne immédiatement.
NOTIFY pgrst, 'reload schema';
