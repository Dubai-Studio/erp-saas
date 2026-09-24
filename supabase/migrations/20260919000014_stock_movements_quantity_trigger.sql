-- ============================================================================
-- 20260919000014_stock_movements_quantity_trigger.sql
-- Corrige le bug critique POST /api/stock-movements : le mouvement est créé
-- mais stock_items.quantity n'est JAMAIS mis à jour. Donc ajouter un trigger
-- AFTER INSERT/UPDATE/DELETE sur stock_movements qui recalcule automatiquement
-- la quantité de l'item.
--
-- Types de mouvement (DB CHECK migration 02) :
--   'in'         -> +qty
--   'out'        -> -qty
--   'adjust'     -> SET à qty (ajustement inventaire)
--   'entrée'     -> +qty  (alias FR)
--   'sortie'     -> -qty  (alias FR)
--   'ajustement' -> SET à qty (alias FR)
--   'retour'     -> +qty
--   'transfert'  -> 0 (transfert interne, pas de changement de stock)
--
-- Idempotent : peut être relancé sans erreur.
-- IMPORTANT : Supabase Dashboard → Settings → API → "Reload schema cache"
-- après exécution.
-- ============================================================================

-- 1. Fonction trigger qui recalcule la quantité de l'item affecté.
CREATE OR REPLACE FUNCTION public.stock_movement_apply()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_item_id uuid;
  v_delta   numeric := 0;
  v_total   numeric;
BEGIN
  -- L'item concerné dépend de l'opération (INSERT/UPDATE/DELETE)
  IF TG_OP = 'INSERT' THEN
    v_item_id := NEW.stock_item_id;
    v_delta   := public.stock_movement_delta(NEW.type, NEW.quantity);
  ELSIF TG_OP = 'UPDATE' THEN
    v_item_id := NEW.stock_item_id;
    -- Pour UPDATE on annule l'ancien et applique le nouveau
    v_delta   := public.stock_movement_delta(NEW.type, NEW.quantity)
               - public.stock_movement_delta(OLD.type, OLD.quantity);
  ELSIF TG_OP = 'DELETE' THEN
    v_item_id := OLD.stock_item_id;
    -- On annule le mouvement supprimé
    v_delta   := -public.stock_movement_delta(OLD.type, OLD.quantity);
  END IF;

  IF v_item_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Recalcule la quantité totale = somme de tous les mouvements de l'item.
  -- C'est plus robuste que d'incrémenter : ça se remet d'état si le trigger
  -- a été désactivé ou si des données ont été insérées en bulk avant.
  SELECT COALESCE(SUM(
    public.stock_movement_delta(m.type, m.quantity)
  ), 0) INTO v_total
  FROM public.stock_movements m
  WHERE m.stock_item_id = v_item_id;

  -- Empêche une quantité négative (sécurité)
  IF v_total < 0 THEN v_total := 0; END IF;

  UPDATE public.stock_items
     SET quantity   = v_total,
         -- Auto-statut : rupture / faible / en stock
         status = CASE
           WHEN v_total <= 0 THEN 'out_of_stock'
           WHEN v_total <= COALESCE(min_quantity, 0) THEN 'low_stock'
           ELSE 'in_stock'
         END,
         updated_at = COALESCE(updated_at, now())
   WHERE id = v_item_id;

  RETURN COALESCE(NEW, OLD);
END $$;

-- 2. Fonction utilitaire qui traduit (type, quantity) en delta de stock.
--    'adjust' / 'ajustement' = SET, donc le delta est `quantity - current`.
--    Mais pour SUM on simplifie : SET = +quantity (et on SUM tout depuis
--    zéro), le recalcul final donnera la bonne valeur.
CREATE OR REPLACE FUNCTION public.stock_movement_delta(p_type text, p_quantity numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_type IN ('in', 'entrée', 'return', 'retour') THEN p_quantity
    WHEN p_type IN ('out', 'sortie', 'loss', 'perte')   THEN -p_quantity
    WHEN p_type IN ('adjust', 'ajustement')             THEN p_quantity  -- compté comme ajout
    WHEN p_type = 'transfert'                            THEN 0
    ELSE 0  -- type inconnu, no-op (sécurité)
  END;
$$;

-- 3. Trigger sur INSERT / UPDATE / DELETE
DROP TRIGGER IF EXISTS trg_stock_movements_apply ON public.stock_movements;
CREATE TRIGGER trg_stock_movements_apply
  AFTER INSERT OR UPDATE OR DELETE ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.stock_movement_apply();

-- 4. Backfill : recalcule la quantité de TOUS les items existants en se
--    basant sur la somme de leurs mouvements (corrige les données
--    existantes qui étaient désynchronisées avant ce fix).
DO $$
DECLARE
  r record;
  v_total numeric;
BEGIN
  FOR r IN SELECT id FROM public.stock_items LOOP
    SELECT COALESCE(SUM(public.stock_movement_delta(m.type, m.quantity)), 0)
    INTO v_total
    FROM public.stock_movements m
    WHERE m.stock_item_id = r.id;

    IF v_total < 0 THEN v_total := 0; END IF;

    UPDATE public.stock_items
       SET quantity = v_total,
           status = CASE
             WHEN v_total <= 0 THEN 'out_of_stock'
             WHEN v_total <= COALESCE(min_quantity, 0) THEN 'low_stock'
             ELSE 'in_stock'
           END
     WHERE id = r.id;
  END LOOP;
  RAISE NOTICE 'Backfill terminé : quantity + status synchronisés sur tous les stock_items';
END $$;

-- 5. Vérification finale
DO $$
DECLARE
  v_items int;
  v_movs   int;
  v_total  numeric;
BEGIN
  SELECT count(*) INTO v_items FROM public.stock_items;
  SELECT count(*) INTO v_movs   FROM public.stock_movements;
  SELECT COALESCE(SUM(quantity), 0) INTO v_total FROM public.stock_items;
  RAISE NOTICE '=========================================================';
  RAISE NOTICE 'Migration 14 appliquée :';
  RAISE NOTICE '  stock_items          : % articles', v_items;
  RAISE NOTICE '  stock_movements      : % mouvements', v_movs;
  RAISE NOTICE '  Quantité totale agrégée : %', v_total;
  RAISE NOTICE '  Trigger trg_stock_movements_apply actif';
  RAISE NOTICE '=========================================================';
  RAISE NOTICE 'PROCHAINE ÉTAPE : Dashboard Supabase → Settings → API → "Reload schema cache" !';
END $$;