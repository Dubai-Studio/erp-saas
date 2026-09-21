-- Diagnostic : voir les valeurs distinctes de `type` dans invoices
SELECT type, COUNT(*) AS n FROM public.invoices GROUP BY type ORDER BY n DESC;
-- Idem pour external_invoices
SELECT type, COUNT(*) AS n FROM public.external_invoices GROUP BY type ORDER BY n DESC;
