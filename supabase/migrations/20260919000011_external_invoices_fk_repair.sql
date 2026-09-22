-- ============================================================================
-- 20260919000011_external_invoices_fk_repair.sql
--
-- Réparation de la FK external_invoices.project_id → projects.id
-- PostgREST ne trouve pas la relation dans son schema cache → erreur 400
-- sur tout embed projects(*).
--
-- On s'assure que :
--   1. La colonne project_id existe
--   2. La FK existe vers public.projects(id)
--   3. La FK existe vers public.clients(id) (pour le même genre d'embed)
--   4. NOTIFY pgrst pour recharger le cache
-- ============================================================================

DO $$
BEGIN
  -- 1. Colonne project_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='external_invoices' AND column_name='project_id'
  ) THEN
    ALTER TABLE public.external_invoices
      ADD COLUMN project_id uuid;
  END IF;

  -- 2. Colonne client_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='external_invoices' AND column_name='client_id'
  ) THEN
    ALTER TABLE public.external_invoices
      ADD COLUMN client_id uuid;
  END IF;
END $$;

-- 3. FK project_id → projects(id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema='public' AND table_name='external_invoices'
      AND constraint_name='external_invoices_project_id_fkey'
  ) THEN
    ALTER TABLE public.external_invoices
      ADD CONSTRAINT external_invoices_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 4. FK client_id → clients(id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema='public' AND table_name='external_invoices'
      AND constraint_name='external_invoices_client_id_fkey'
  ) THEN
    ALTER TABLE public.external_invoices
      ADD CONSTRAINT external_invoices_client_id_fkey
      FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 5. Index utiles (PostgREST peut s'en servir pour les jointures)
CREATE INDEX IF NOT EXISTS idx_external_invoices_project_id
  ON public.external_invoices(project_id);
CREATE INDEX IF NOT EXISTS idx_external_invoices_client_id
  ON public.external_invoices(client_id);

-- 6. NOTIFY PostgREST pour recharger son cache de schéma
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

-- 7. Diagnostic final
DO $$
DECLARE
  has_fk_proj BOOLEAN;
  has_fk_cli  BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema='public' AND table_name='external_invoices'
      AND constraint_name='external_invoices_project_id_fkey'
  ) INTO has_fk_proj;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema='public' AND table_name='external_invoices'
      AND constraint_name='external_invoices_client_id_fkey'
  ) INTO has_fk_cli;

  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE 'Migration 11 — external_invoices FK repair :';
  RAISE NOTICE '  FK external_invoices_project_id_fkey : %',
    CASE WHEN has_fk_proj THEN '✅' ELSE '❌' END;
  RAISE NOTICE '  FK external_invoices_client_id_fkey  : %',
    CASE WHEN has_fk_cli  THEN '✅' ELSE '❌' END;
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE 'PROCHAINE ÉTAPE : Dashboard → Settings → API → Reload schema cache';
  RAISE NOTICE 'Après ça, vous pourrez re-activer les embed projects(name) si désiré.';
END $$;