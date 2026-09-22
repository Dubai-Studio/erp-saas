-- ============================================================================
-- 20260919000010_storage_invoices_repair.sql
--
-- Diagnostic + réparation du bucket 'invoices' (storage.objects policies).
-- Symptôme : POST /api/storage/upload renvoie 400 alors que l'API appelle
-- Supabase storage correctement. Cause probable : bucket manquant ou
-- policy storage incorrecte.
--
-- Sécurité :
-- - Le bucket 'invoices' reste PRIVATE pour les uploads (pas d'accès anonyme)
-- - Les owners authentifiés peuvent INSERT/UPDATE/DELETE/SELECT uniquement
--   dans leur propre sous-dossier (= leur user_id)
-- - getPublicUrl() côté code continuera de fonctionner si le bucket est
--   marqué "Public" dans Supabase Dashboard
-- ============================================================================

-- 1. S'assurer que le bucket existe
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'invoices',
  'invoices',
  true,                                          -- public pour getPublicUrl()
  26214400,                                      -- 25 MB
  ARRAY['application/pdf','image/png','image/jpeg','image/webp','image/gif',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel','text/csv','application/octet-stream']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Drop & recréer les policies storage.objects pour le bucket invoices
DROP POLICY IF EXISTS invoices_user_select ON storage.objects;
DROP POLICY IF EXISTS invoices_user_insert ON storage.objects;
DROP POLICY IF EXISTS invoices_user_update ON storage.objects;
DROP POLICY IF EXISTS invoices_user_delete ON storage.objects;
DROP POLICY IF EXISTS invoices_user ON storage.objects;

-- SELECT : user peut lire SES fichiers OU fichiers du bucket public
CREATE POLICY invoices_user_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'invoices'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- INSERT : user peut uploader UNIQUEMENT dans son dossier user_id/*
CREATE POLICY invoices_user_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'invoices'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- UPDATE : user peut renommer/metadata SES fichiers
CREATE POLICY invoices_user_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'invoices'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'invoices'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- DELETE : user peut supprimer SES fichiers
CREATE POLICY invoices_user_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'invoices'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 3. Idem pour bucket 'attachments' (probablement utilisé ailleurs)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('attachments', 'attachments', true, 26214400)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS attachments_user ON storage.objects;
CREATE POLICY attachments_user ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 4. Idem pour bucket 'receipts' (notes de frais)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('receipts', 'receipts', true, 10485760)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS receipts_user ON storage.objects;
CREATE POLICY receipts_user ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 5. NOTIFY PostgREST
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

-- 6. Diagnostic final
DO $$
DECLARE
  bkt_invoices    BOOLEAN;
  bkt_attachments BOOLEAN;
  bkt_receipts    BOOLEAN;
  cnt_pol         INT;
BEGIN
  SELECT EXISTS (SELECT 1 FROM storage.buckets WHERE id='invoices')    INTO bkt_invoices;
  SELECT EXISTS (SELECT 1 FROM storage.buckets WHERE id='attachments') INTO bkt_attachments;
  SELECT EXISTS (SELECT 1 FROM storage.buckets WHERE id='receipts')    INTO bkt_receipts;
  SELECT COUNT(*) INTO cnt_pol FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects' AND policyname LIKE 'invoices_user%';

  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE 'Migration 10 — storage repair :';
  RAISE NOTICE '  bucket invoices     : %', CASE WHEN bkt_invoices    THEN '✅' ELSE '❌' END;
  RAISE NOTICE '  bucket attachments  : %', CASE WHEN bkt_attachments THEN '✅' ELSE '❌' END;
  RAISE NOTICE '  bucket receipts     : %', CASE WHEN bkt_receipts    THEN '✅' ELSE '❌' END;
  RAISE NOTICE '  policies invoices_* : % (attendu : 4)', cnt_pol;
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
END $$;