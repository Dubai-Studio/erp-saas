-- ============================================================================
-- 20260919000009_external_invoices_secdef_insert.sql
--
-- Crée une fonction RPC SECURITY DEFINER qui permet d'insérer dans
-- external_invoices en bypassant RLS de manière ciblée et sûre.
--
-- Pourquoi : malgré migration 08 (trigger + policies correctes),
-- PostgREST sert encore l'ancienne policy en cache tant que
-- "Reload schema cache" n'est pas cliqué dans Supabase Dashboard.
-- Pour ne PAS casser la production, on offre une voie alternative
-- via RPC qui marche immédiatement après exécution.
--
-- Sécurité :
-- - SECURITY DEFINER : la fonction s'exécute avec les droits du owner
--   (postgres) donc RLS est bypassée
-- - Mais on vérifie auth.uid() à l'intérieur et on impose
--   user_id = auth.uid() dans l'INSERT
-- - On n'accepte que les colonnes du schéma ExternalInvoiceCreate
-- - search_path = public pour éviter les attaques de search_path
--
-- ============================================================================

CREATE OR REPLACE FUNCTION public.insert_external_invoice(
  p_supplier_name text,
  p_supplier_id   uuid,
  p_client_id     uuid,
  p_project_id    uuid,
  p_amount_ht     numeric,
  p_vat_amount    numeric,
  p_total_amount  numeric,
  p_issue_date    date,
  p_due_date      date,
  p_category      text,
  p_notes         text,
  p_status        text,
  p_file_name     text,
  p_file_url      text,
  p_type          text DEFAULT 'incoming'
)
RETURNS public.external_invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_type    text;
  v_status  text;
  v_row     public.external_invoices;
BEGIN
  -- 1. Récupère l'user authentifié
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501';
  END IF;

  -- 2. Valide le type (par défaut 'incoming')
  v_type := COALESCE(NULLIF(p_type, ''), 'incoming');
  IF v_type NOT IN ('incoming','supplier_invoice','facture_fournisseur','expense') THEN
    RAISE EXCEPTION 'Type invalide : %', v_type USING ERRCODE = '22023';
  END IF;

  -- 3. Valide le status
  v_status := COALESCE(NULLIF(p_status, ''), 'pending');
  IF v_status NOT IN ('pending','paid','overdue','cancelled','contested') THEN
    RAISE EXCEPTION 'Statut invalide : %', v_status USING ERRCODE = '22023';
  END IF;

  -- 4. INSERT — user_id forcé à auth.uid() côté serveur
  INSERT INTO public.external_invoices (
    user_id, type, supplier_name, supplier_id, client_id, project_id,
    amount_ht, vat_amount, total_amount,
    issue_date, due_date, category, notes, status,
    file_name, file_url, created_at
  ) VALUES (
    v_user_id, v_type, p_supplier_name, p_supplier_id, p_client_id, p_project_id,
    p_amount_ht, p_vat_amount, p_total_amount,
    p_issue_date, p_due_date, p_category, p_notes, v_status,
    p_file_name, p_file_url, now()
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END $$;

-- 5. GRANT EXECUTE aux utilisateurs authentifiés
GRANT EXECUTE ON FUNCTION public.insert_external_invoice(
  text, uuid, uuid, uuid, numeric, numeric, numeric,
  date, date, text, text, text, text, text, text
) TO authenticated;

DO $$ BEGIN
  RAISE NOTICE '✅ RPC public.insert_external_invoice(...) créée';
  RAISE NOTICE '   GRANT EXECUTE to authenticated ✅';
  RAISE NOTICE '   → L''API POST /api/external-invoices peut basculer dessus';
  RAISE NOTICE '   → Cette migration est SANS dépendance sur le schema cache,';
  RAISE NOTICE '     elle marche dès que le SQL est exécuté.';
END $$;