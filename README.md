# Next-ERP.PRO

ERP SaaS européen multi-tenant. Next.js 16 · React 19 · TypeScript · Supabase · Tailwind v4.

## Pré-requis

- Node 20+
- Un projet Supabase (URL + clé anon + clé service)
- (Optionnel) clé API DeepSeek pour la fonction OCR de factures fournisseurs

## Installation

```bash
npm install
cp .env.example .env.local
# Renseigne NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY
```

## Base de données

Applique les migrations dans Supabase Studio → SQL Editor, **dans l'ordre** :

```bash
supabase/migrations/20260919000001_tenant_isolation.sql
```

Cette migration :
1. Ajoute la colonne `user_id` (FK vers `auth.users`) à toutes les tables qui n'en avaient pas.
2. Active RLS sur les 14 tables.
3. Crée les policies `tenant_select/insert/update/delete` pour isoler les données par utilisateur.
4. Ajoute un trigger `set_user_id()` qui injecte `auth.uid()` si absent.
5. Ajoute des indexes (incluant `user_id`, dates, status).
6. Crée les policies Storage sur les buckets `invoices`, `receipts`, `attachments` (à créer depuis le dashboard si besoin).

## Variables d'environnement

| Variable                              | Description                              |
|---------------------------------------|------------------------------------------|
| `NEXT_PUBLIC_SUPABASE_URL`            | URL du projet Supabase                   |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`       | Clé anon (publique)                      |
| `SUPABASE_SERVICE_KEY`                | Clé service (privée, server-only)        |
| `DEEPSEEK_API_KEY`                    | (Optionnel) pour l'OCR factures          |

## Scripts

```bash
npm run dev        # serveur de dev
npm run build      # build prod
npm run lint       # ESLint
npm run typecheck  # TypeScript
npm run test       # Vitest
```

## Architecture

```
app/                  # App Router (pages)
  api/                # Routes API (toutes protégées par RLS + auth JWT)
  dashboard/          # Pages privées (gardées par middleware.ts)
  login/              # Auth
  register/           # Inscription
  reset-password/     # Réinitialisation

components/           # Icônes (legacy)
lib/
  supabase-server.ts  # Helpers serveur (ANON + SERVICE)
  schemas.ts          # Validation Zod pour toutes les routes
  types.ts            # Types partagés API ↔ front
  calculations.ts     # Calculs métier purs (testables)
  format.ts           # Formatters EUR, dates, %
  api-helpers.ts      # Wrappers API standardisés
  pdf.ts              # Génération PDF conforme

supabase/migrations/  # SQL versionné (à appliquer via Studio)
middleware.ts         # SSR auth guard pour /dashboard/*
```

## Sécurité (depuis l'audit initial)

- ✅ RLS activé sur toutes les tables sensibles
- ✅ Chaque requête API authentifiée → `auth.uid()` est utilisé comme scope
- ✅ `SUPABASE_SERVICE_KEY` n'est utilisé que pour les opérations admin
  (webhooks, jobs CRON) — jamais pour répondre à un user
- ✅ Toutes les routes API validées par Zod (validation de schéma centralisée)
- ✅ Pas de mass-assignment (les updates n'acceptent que les champs listés)
- ✅ `/api/storage/upload` : taille max 25 MB, MIME whitelist, dossier préfixé par `user_id`
- ✅ `/api/test` désactivé en production
- ✅ JWT stocké uniquement en cookie HttpOnly (plus de `localStorage`)

## Roadmap

- [ ] Tests E2E Playwright sur les flux critiques
- [ ] Génération PDF côté serveur (Puppeteer ou wkhtmltopdf)
- [ ] Templates de facture configurables par l'utilisateur
- [ ] Multilingue (FR/NL/EN)
- [ ] Module rapports avancés (TVA, bilan, compte de résultats)
- [ ] Multi-utilisateur par société (rôles admin/collaborateur)
- [ ] Module email transactionnel (rappels paiement)