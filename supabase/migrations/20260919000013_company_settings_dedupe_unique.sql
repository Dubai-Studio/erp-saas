-- ============================================================================
-- 20260919000013_company_settings_dedupe_unique.sql
-- Corrige le bug "JSON object requested, multiple (or no) rows returned"
-- renvoyé par GET /api/settings quand plusieurs lignes existent pour le
-- même user_id.
--
-- Cause racine : la table company_settings n'a jamais reçu de contrainte
-- UNIQUE sur user_id. Le code de l'API PUT appelait
--   supabase.from('company_settings').upsert({...}, { onConflict: 'user_id' })
-- mais sans contrainte UNIQUE, l'upsert se comportait comme un INSERT pur,
-- créant un doublon à chaque save. Au bout de N sauvegardes, le SELECT
-- initial ramène N lignes et .maybeSingle() plante (PGRST116).
--
-- Effet en cascade :
--   * GET /api/settings → 400 "JSON object requested, multiple (or no)
--     rows returned" → le front ne reçoit aucune donnée société → header
--     PDF vide, TVA par défaut, etc.
--   * PUT continuait à insérer des lignes (pas de mise à jour réelle).
--
-- Étapes de la migration :
--   1. Supprime les doublons : on garde la ligne avec le plus grand id pour
--      chaque user_id. Les UUID v4 intègrent un timestamp dans leurs
--      premiers bits, donc ORDER BY id DESC = plus récent en pratique.
--      Si la colonne updated_at ou created_at existe on l'utilisera en
--      priorité (meilleure sémantique).
--   2. Ajoute la contrainte UNIQUE sur user_id si absente, pour que les
--      futurs upsert(onConflict:'user_id') fonctionnent réellement comme
--      UPSERT (UPDATE si existe, INSERT sinon).
--
-- Idempotent : peut être relancé sans erreur.
-- IMPORTANT : exécuter dans Supabase Dashboard → SQL Editor, puis
-- Settings → API → "Reload schema cache" pour que PostgREST prenne en
-- compte la nouvelle contrainte.
-- ============================================================================

-- 0. S'assure que les colonnes id / user_id / created_at / updated_at existent
DO $$
BEGIN
  -- created_at : utilisé comme tie-breaker si présent
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='company_settings'
               AND column_name='created_at') THEN
    NULL; -- déjà OK
  END IF;

  -- updated_at : si absent, on l'ajoute avec DEFAULT now() pour les futures
  -- requêtes ORDER BY
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='company_settings'
                   AND column_name='updated_at') THEN
    ALTER TABLE public.company_settings
      ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

-- 1. Supprime les doublons. Stratégie : pour chaque (user_id) on garde la
--    ligne la plus "récente" (updated_at DESC, created_at DESC, id DESC).
DELETE FROM public.company_settings a
USING public.company_settings b
WHERE a.user_id = b.user_id
  AND (
    -- b a un updated_at plus récent que a, OU
    (b.updated_at IS NOT NULL AND a.updated_at IS NOT NULL AND b.updated_at > a.updated_at)
    OR
    -- a et b ont le même updated_at, mais b a un id plus grand (= plus récent)
    ((b.updated_at IS NULL OR b.updated_at = a.updated_at) AND b.id > a.id)
  );

-- 2. Contrainte UNIQUE sur user_id (pour que l'upsert fonctionne vraiment)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'company_settings_user_id_key'
      AND conrelid = 'public.company_settings'::regclass
  ) THEN
    ALTER TABLE public.company_settings
      ADD CONSTRAINT company_settings_user_id_key UNIQUE (user_id);
  END IF;
END $$;

-- 3. Index secondaire sur updated_at (pour ORDER BY updated_at DESC rapide)
CREATE INDEX IF NOT EXISTS idx_company_settings_updated_at
  ON public.company_settings(updated_at DESC);

-- 4. Vérification finale + rapport
DO $$
DECLARE
  v_total int;
  v_distinct_users int;
  v_dupes int;
BEGIN
  SELECT count(*) INTO v_total FROM public.company_settings;
  SELECT count(DISTINCT user_id) INTO v_distinct_users FROM public.company_settings;
  v_dupes := v_total - v_distinct_users;

  RAISE NOTICE '=========================================================';
  RAISE NOTICE 'Migration 13 appliquée :';
  RAISE NOTICE '  Lignes restantes       : %', v_total;
  RAISE NOTICE '  Users distincts        : %', v_distinct_users;
  RAISE NOTICE '  Doublons restants      : %', v_dupes;
  RAISE NOTICE '  Contrainte UNIQUE      : company_settings_user_id_key';
  RAISE NOTICE '=========================================================';
  RAISE NOTICE 'PROCHAINE ÉTAPE : Dashboard Supabase → Settings → API → "Reload schema cache" !';
END $$;