# Guide de déploiement — Next-ERP.PRO

## TL;DR

```bash
# 1. Sur Supabase Studio → SQL Editor : exécuter supabase/migrations/20260919000001_tenant_isolation.sql
# 2. Sur Supabase Studio → Storage : créer 3 buckets (invoices, receipts, attachments) en privé
# 3. cp .env.example .env.local ; remplir les 3 clés Supabase
# 4. npm install ; npm run dev  → tester sur http://localhost:3000
# 5. Push sur GitHub ; connecter à Vercel ; set les env vars ; déployer
```

---

## Étape 1 — Préparer Supabase (obligatoire avant tout)

### 1.1 Créer un projet Supabase
- Aller sur https://supabase.com/dashboard
- New project → choisir région **Europe (Frankfurt ou Ireland)** pour latence BE/UE
- Définir un mot de passe DB costaud

### 1.2 Récupérer les 3 clés API
Une fois le projet créé (≈ 2 min) :
- **Settings → API**
- Copier :
  - `Project URL` → c'est `NEXT_PUBLIC_SUPABASE_URL`
  - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `service_role` key (⚠️ cliquer "reveal") → `SUPABASE_SERVICE_KEY`

### 1.3 Appliquer la migration (RLS + multi-tenant)
- **SQL Editor → New query**
- Coller le contenu du fichier `supabase/migrations/20260919000001_tenant_isolation.sql`
- **Run**
- Vérifier dans **Database → Replication** ou **Table Editor** que RLS est activé sur les 14 tables (icône 🔒 visible)

⚠️ **Ne pas sauter cette étape.** Sans RLS, le code suppose l'isolation multi-tenant mais elle n'est pas appliquée en DB.

### 1.4 Créer les buckets Storage
- **Storage → New bucket**
- Créer **3 buckets en privé** :
  - `invoices` (PDFs de factures)
  - `receipts` (justificatifs)
  - `attachments` (pièces jointes)
- Cocher "Private bucket" pour chacun
- La migration a déjà préparé les policies Storage. Si un bucket n'existait pas lors de l'application de la migration, recréer le bucket puis **réexécuter uniquement le bloc `DO $$ ... $$` final de la migration**.

### 1.5 Activer Realtime (pour synchro instantanée, Phase 9 future)
- **Database → Replication**
- Pour `invoices`, `external_invoices`, `stock_items`, `stock_movements` : toggle "Source" → active les events INSERT/UPDATE/DELETE
- Nécessaire uniquement si tu veux la synchro temps réel entre onglets

### 1.6 Tester en local (5 min)
```bash
cp .env.example .env.local
# Remplir les 3 clés Supabase

npm install
npm run dev
```

Ouvre http://localhost:3000 :
- Crée un compte sur /register
- Vérifie que tu peux ajouter un client, créer une facture, générer le PDF
- Ouvre un 2e navigateur en navigation privée, crée un 2e compte, vérifie que tu **ne vois pas** les données du 1er compte → preuve que RLS fonctionne

---

## Étape 2 — Mettre sur GitHub

```bash
git init                  # si pas déjà fait
git add .
git commit -m "feat: secure multi-tenant ERP SaaS"
git branch -M main
git remote add origin https://github.com/TONUSER/next-erp.git
git push -u origin main
```

⚠ **Vérifie que `.env.local` n'est PAS commité** (déjà dans `.gitignore`).

---

## Étape 3 — Déployer

### ⭐ Option A : Vercel (recommandé pour Next.js)

1. Aller sur https://vercel.com/new
2. "Import Git Repository" → sélectionne ton repo
3. **Environment Variables** : ajouter les 4 variables
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_KEY`
   - `DEEPSEEK_API_KEY` (optionnel)
   - `POWER_AUTOMATE_WEBHOOK_SECRET` (si tu utilises le webhook)
4. Build command : `npm run build` (par défaut)
5. Deploy

Vercel détecte automatiquement Next.js, configure le SSR, le middleware (notre `middleware.ts`), et les variables d'env publiques. **Le `next.config.ts` actuel fonctionne tel quel avec Vercel.**

⚠ Le `next.config.ts` actuel a `ignoreBuildErrors: true` — c'est un cache d'erreur volontaire de l'ancien dev. Idéalement retire ça pour bloquer les builds sur erreurs TS :
```ts
typescript: { ignoreBuildErrors: false }
```

### Option B : Netlify (déjà configuré)

Le `netlify.toml` et `@netlify/plugin-nextjs` sont déjà en place. Sur Netlify :
1. Add new site → Import from Git
2. Ajouter les variables d'env
3. Deploy

⚠ Netlify + Next.js App Router fonctionne mais est moins optimisé que Vercel. Tu peux avoir des surprises avec le middleware SSR ou les routes API selon la version de `@netlify/plugin-nextjs`.

### Option C : Cloudflare Workers

Plus complexe, nécessite :
- `npm install --save-dev @opennextjs/cloudflare`
- Build avec `npx opennextjs-cloudflare build` (pas dans les scripts actuels)
- Deploy via `wrangler deploy`

Le `wrangler.toml` et `open-next.config.ts` existent déjà mais le build script n'est pas câblé dans `package.json`. C'est l'option la plus performante (edge global) mais aussi la plus pénible à mettre en place.

**→ Pour ce projet, je recommande Vercel.**

---

## Étape 4 — Configurer Supabase Auth pour la prod

### 4.1 Domaine autorisé
- **Authentication → URL Configuration**
- **Site URL** : `https://ton-app.vercel.app`
- **Redirect URLs** : ajouter `https://ton-app.vercel.app/reset-password`

### 4.2 Email templates (optionnel mais recommandé)
- Authentication → Email Templates
- Personnaliser "Confirm signup", "Reset password" avec ton branding

---

## Étape 5 — Vérifier après déploiement

Checklist :
- [ ] `https://ton-app.vercel.app/` redirige vers `/login`
- [ ] Inscription → email de confirmation reçu → redirection dashboard
- [ ] Création client OK, visible après refresh
- [ ] Création facture OK, PDF généré et téléchargeable
- [ ] Multi-tenant : créer un 2e compte, vérifier qu'il ne voit RIEN du premier
- [ ] DeepSeek OCR (si activé) : uploader une facture fournisseur, vérifier insertion en DB
- [ ] Middleware : `/dashboard` sans session → redirect `/login?next=/dashboard`

---

## Étape 6 — Monitoring et backups

Une fois en prod :
- Activer les **Supabase Backups** (Settings → Database → Backups : daily)
- Ajouter **Sentry** (recommandé) : `npm install @sentry/nextjs` + `withSentryConfig()` dans `next.config.ts`
- Mettre en place **Uptime monitoring** : UptimeRobot ou Better Stack sur `/`

---

## Variables d'environnement finales

| Variable                              | Où la trouver                                    |
|---------------------------------------|--------------------------------------------------|
| `NEXT_PUBLIC_SUPABASE_URL`            | Supabase → Settings → API → Project URL          |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`       | Supabase → Settings → API → anon public          |
| `SUPABASE_SERVICE_KEY`                | Supabase → Settings → API → service_role (reveal) |
| `DEEPSEEK_API_KEY`                    | https://platform.deepseek.com/                    |
| `POWER_AUTOMATE_WEBHOOK_SECRET`       | `openssl rand -hex 32`                            |

---

## Points d'attention

1. **Clé service_role** : ne JAMAIS l'exposer côté client. Le code l'utilise uniquement dans des routes API (server-only). C'est OK.
2. **Webhook Power Automate** : le `POWER_AUTOMATE_WEBHOOK_SECRET` doit être différent du service_role. Si tu n'utilises pas Power Automate, laisse vide.
3. **Coûts DeepSeek** : le rate limit (5s par user) protège des abus. Surveille la facture DeepSeek le 1er mois.
4. **CORS** : si tu ajoutes un front séparé (ex: app mobile), il faudra configurer les origines autorisées dans Supabase Auth.
5. **RGPD** : ajoute une page `/privacy` et `/terms`. Purge les données après X mois sur demande utilisateur (à coder, pas encore fait).

---

## Questions fréquentes

**Q : Le build Next.js affiche des erreurs TS mais Vercel déploie quand même ?**
R : Oui, à cause de `ignoreBuildErrors: true` dans `next.config.ts`. Recommandé de passer à `false` en prod.

**Q : Comment migrer la DB plus tard ?**
R : Ajoute un nouveau fichier dans `supabase/migrations/` avec un timestamp > celui actuel. Ne modifie JAMAIS une migration déjà appliquée.

**Q : Comment tester la synchro multi-tenant avant de déployer ?**
R : Ouvre 2 navigateurs en navigation privée, crée 2 comptes différents sur le même Supabase. Les données doivent être strictement isolées.