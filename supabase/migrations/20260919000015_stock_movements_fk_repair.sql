-- ============================================================================
-- 20260919000015_stock_movements_fk_repair.sql
-- Répare la FK explicite stock_movements.stock_item_id → stock_items.id
-- pour que PostgREST puisse résoudre l'embed `stock_items(name)` dans le
-- GET /api/stock-movements. Sans cette FK déclarée, PostgREST ne détecte
-- pas la relation et renvoie 400 "Could not find a relationship between
-- 'stock_movements' and 'stock_items' in the schema cache".
--
-- Idempotent : peut être relancé sans erreur.
-- IMPORTANT : Supabase Dashboard → Settings → API → "Reload schema cache"
-- après exécution.
-- ============================================================================

-- 1. Ajoute la contrainte FK si absente. ON DELETE CASCADE pour qu'un item
--    supprimé nettoie automatiquement ses mouvements.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stock_movements_stock_item_id_fkey'
      AND conrelid = 'public.stock_movements'::regclass
  ) THEN
    ALTER TABLE public.stock_movements
      ADD CONSTRAINT stock_movements_stock_item_id_fkey
      FOREIGN KEY (stock_item_id) REFERENCES public.stock_items(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- 2. Idem pour client_id (déjà utilisé par d'autres routes)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stock_movements_client_id_fkey'
      AND conrelid = 'public.stock_movements'::regclass
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='stock_movements' AND column_name='client_id'
  ) THEN
    ALTER TABLE public.stock_movements
      ADD CONSTRAINT stock_movements_client_id_fkey
      FOREIGN KEY (client_id) REFERENCES public.clients(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 3. Index sur stock_item_id (accélère les SUM/SELECT dans le trigger 14
--    et dans les requêtes de listing par item)
CREATE INDEX IF NOT EXISTS idx_stock_movements_stock_item_id
  ON public.stock_movements(stock_item_id);

-- 4. Notification PostgREST pour invalider le schema cache (équivalent du
--    "Reload schema cache" côté dashboard — fonctionne en self-hosted Supabase).
NOTIFY pgrst, 'reload schema';

-- 5. Vérif finale
DO $$
DECLARE
  v_fk_count int;
BEGIN
  SELECT count(*) INTO v_fk_count
  FROM pg_constraint
  WHERE conrelid = 'public.stock_movements'::regclass
    AND contype = 'f'
    AND pg_constraint.conname LIKE '%stock_item%';
  RAISE NOTICE '=========================================================';
  RAISE NOTICE 'Migration 15 appliquée :';
  RAISE NOTICE '  FK stock_movements.stock_item_id -> stock_items.id : %', v_fk_count;
  RAISE NOTICE '  NOTIFY pgrst envoyé (reload schema cache)';
  RAISE NOTICE '=========================================================';
  RAISE NOTICE 'PROCHAINE ÉTAPE : Dashboard Supabase → Settings → API → "Reload schema cache" !';
END $$;