# Migration Supabase SaaS → auto-hébergé (Coolify)

Date : 2026-07-21
Statut : design validé (en attente de relecture)

## Objectif

Migrer l'intégralité du projet Supabase depuis l'instance SaaS
(`project_id = kgjvfuzdnbvgxkbndwfr`, `*.supabase.co`) vers une instance
auto-hébergée sur **Coolify**, exposée sur **`supabase.ephemeride.app`**.

Tout doit être migré :

- **Base de données** — schéma `public` (structure via migrations versionnées + données).
- **Auth** — schéma `auth` (utilisateurs, identités), **hash de mots de passe bcrypt inclus** → pas de reset côté utilisateurs.
- **Storage** — buckets publics `avatars` et `event-assets` (métadonnées `storage.objects` + fichiers).
- **Edge Functions** — `delete-account`, `forward-inbound-email`, `notify-new-event`, `send-event-notification` (+ `send-auth-email`, voir §E-mails auth).
- **Secrets** — VAPID (push), Resend (e-mails), etc.

Le front **Next.js reste hébergé sur Vercel** ; seule sa configuration Supabase change.

## Contexte technique (état des lieux)

- Stack : Next.js 16 (App Router, ISR) sur Vercel + Supabase (DB, Auth, Storage, Edge Functions).
- Migrations SQL versionnées dans `supabase/migrations/` (10 fichiers). **Aucune extension exotique** :
  pas de `pg_cron`, `pg_net`, `pgjwt`, `vault`, ni `realtime`. Uniquement des FK vers
  `auth.users` et des politiques RLS `auth.uid()` / `auth.role()`.
- Buckets déclarés par migration (`avatars`, `event-assets`, tous deux `public = true`).
- Edge Functions Deno déployées via `supabase functions deploy --use-api`.
- `delete-account` : authentifie l'appelant via son JWT puis supprime le compte avec la
  **`service_role`** (API admin GoTrue) + nettoie l'avatar dans le bucket.
- `send-auth-email` : **Send Email Hook** GoTrue produisant des e-mails FR brandés (logo,
  copies sur mesure) via Resend.
- `forward-inbound-email` : webhook Resend `email.received` (signature Svix) → redirection.

## Décisions d'architecture

### Hébergement
Instance déployée sur **Coolify** (le template Supabase de Coolify), s'appuyant sur la
skill `coolify-manager` pour les opérations. Domaine `supabase.ephemeride.app`, TLS géré
par le reverse proxy Coolify (Traefik/Caddy). Downtime court accepté (fenêtre de maintenance).

### Schéma `public` : rejouer les migrations (option A)
On **rejoue `supabase/migrations`** sur la nouvelle base pour recréer la structure, puis on
importe **uniquement les données** (`--data-only`). On n'importe pas le DDL du SaaS.
Justification : état propre, reproductible, identique au repo ; évite les artefacts du DDL SaaS.

### Auth & Storage : données seules dans le schéma des images self-hosted
Les images **GoTrue** et **storage-api** créent elles-mêmes leur schéma (`auth`, `storage`)
au démarrage. On **n'importe que les données** (`auth.users`, `auth.identities`, `storage.objects`),
dans le schéma tel que créé par les images self-hosted. Justification : éviter le « schema drift »
entre la version GoTrue/storage du SaaS et celle self-hosted (colonnes divergentes).

### Fichiers des buckets : script via API Storage (option A)
Script qui **télécharge** chaque objet depuis le SaaS (clé `service_role`) et le **ré-uploade**
vers l'instance self-hosted. Portable, indépendant du backend de stockage, adapté au faible
volume (avatars + covers d'événements). Alternative écartée : copie S3 directe (rclone),
réservée aux gros volumes.

### E-mails d'authentification : on garde le hook `send-auth-email` (e-mails brandés)
On conserve les **e-mails FR personnalisés** produits par l'Edge Function `send-auth-email`.
GoTrue self-hosted supporte le **Send Email hook**, configuré via :
- `GOTRUE_HOOK_SEND_EMAIL_ENABLED=true`
- `GOTRUE_HOOK_SEND_EMAIL_URI` → URL de l'Edge Function `send-auth-email` sur l'edge-runtime
  self-hosted (ou URI `pg-functions://` selon le mode).
- `GOTRUE_HOOK_SEND_EMAIL_SECRETS` → le secret de signature (`SEND_EMAIL_HOOK_SECRET`,
  format `v1,whsec_...`), à regénérer et à copier aussi dans les secrets de la fonction.

La fonction garde ses secrets : `RESEND_API_KEY`, `SITE_URL`, `SEND_EMAIL_HOOK_SECRET`.
Conséquence : **pas de SMTP GoTrue à configurer** — tout l'envoi passe par Resend via le hook,
comme aujourd'hui. Le rendu riche (logo, copies FR sur mesure) est préservé à l'identique.

## Clés & secrets qui changent

⚠️ Le self-hosted signe les JWT en HS256 avec **ton propre `JWT_SECRET`**. Par conséquent :

- **`anon key`** et **`service_role key`** sont **regénérées** (dérivées du nouveau `JWT_SECRET`).
- À répercuter partout : variables Vercel, secrets des Edge Functions, tout client.

Inventaire des variables à mettre à jour :

| Emplacement | Variable | Nouvelle valeur |
|---|---|---|
| Vercel | `NEXT_PUBLIC_SUPABASE_URL` | `https://supabase.ephemeride.app` |
| Vercel | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | nouvelle anon key |
| Vercel | `SUPABASE_DB_URL` | conn. Postgres self-hosted |
| Vercel | `SUPABASE_PROJECT_ID` | (génération des types — voir §Types) |
| Edge Functions | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | nouvelles valeurs |
| Edge Functions | `RESEND_API_KEY`, `RESEND_FROM`, `SITE_URL`, `RESEND_EMAIL_RECEIVED_FORWARD`, `RESEND_WEBHOOK_SECRET` | inchangées (re-set sur la nouvelle instance) |
| Edge Functions | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | inchangées (re-set) |
| Edge Functions | `SEND_EMAIL_HOOK_SECRET` (pour `send-auth-email`) | secret regénéré (`v1,whsec_...`) |
| GoTrue (Coolify) | `GOTRUE_HOOK_SEND_EMAIL_ENABLED`, `GOTRUE_HOOK_SEND_EMAIL_URI`, `GOTRUE_HOOK_SEND_EMAIL_SECRETS` | activation du hook + URL de `send-auth-email` + secret |

## Plan de migration ordonné

### Phase 0 — Préparation (à l'avance, sans downtime)
1. Déployer la stack Supabase sur Coolify (postgres, gotrue, postgrest, storage-api, kong,
   edge-runtime, studio, meta, imgproxy). Configurer DNS + TLS pour `supabase.ephemeride.app`.
2. Générer `JWT_SECRET` et en dériver `ANON_KEY` / `SERVICE_ROLE_KEY`. Les consigner.
3. Vérifier la **parité de version Postgres** entre le SaaS (≈ PG 15) et l'image Coolify.
4. Rejouer `supabase/migrations` sur la nouvelle base (schéma `public` + buckets recréés).
5. Configurer GoTrue : `SITE_URL`, redirect URLs, et le **Send Email hook**
   (`GOTRUE_HOOK_SEND_EMAIL_*`) pointant vers `send-auth-email`.

### Phase 1 — Bascule (fenêtre de maintenance)
6. **Geler les écritures** (bandeau maintenance / app en lecture seule sur Vercel).
7. **Dump données** depuis le SaaS :
   - `public` en `--data-only` ;
   - `auth.users` + `auth.identities` (data-only, avec `encrypted_password`) ;
   - `storage.objects` (métadonnées, data-only).
8. **Restore** de ces données dans la nouvelle base.
9. **Copier les fichiers** des buckets `avatars` et `event-assets` (script API, option A).
10. **Déployer les Edge Functions** sur l'edge-runtime self-hosted + re-set des secrets.
11. **Mettre à jour Vercel** (cf. tableau §Clés & secrets) et redéployer.
12. **Repointer le webhook Resend** `email.received` vers la nouvelle URL de `forward-inbound-email`.

### Phase 2 — Vérification & rollback
13. Tests de recette :
    - **login avec mot de passe existant** (valide le transfert des hash bcrypt) ;
    - **signup + reset password** (valide le hook `send-auth-email` + Resend, e-mails brandés) ;
    - **upload avatar + cover d'événement** (valide storage + fichiers) ;
    - **notification push** (valide VAPID + `send-event-notification`) ;
    - **webhook Resend entrant** (`forward-inbound-email`) ;
    - **suppression de compte** (`delete-account`, service_role + nettoyage avatar).
14. Garder le projet SaaS **intact quelques jours** ; rollback = repointer l'URL Vercel vers l'ancien.

## Types Supabase (post-migration)

`make supabase-types` s'appuie sur `SUPABASE_PROJECT_ID` et la CLI SaaS. En self-hosted, la
génération de types se fait via l'URL de connexion (`--db-url $SUPABASE_DB_URL`) plutôt que
`--project-id`. La cible `supabase-types` du `Makefile` sera adaptée en conséquence
(les deux fichiers de types restent à garder en phase : `src/lib/database.types.ts` et
`src/integrations/supabase/types.ts`).

## Points de vigilance (récapitulatif)

- **Clés JWT** regénérées → mise à jour exhaustive (Vercel + secrets functions).
- **Hash bcrypt** migrés tels quels → aucun reset utilisateur.
- **Données auth/storage** importées dans le schéma des images self-hosted (pas le DDL SaaS).
- **Parité Postgres** à vérifier avant dump/restore.
- **`storage.objects`** : les métadonnées doivent correspondre aux fichiers effectivement copiés
  (copier les fichiers AVANT ou en cohérence avec l'import des métadonnées).
- **Séquences / ownership** : après restore data-only, vérifier les séquences et le
  propriétaire des objets (rôles `authenticated`, `anon`, `service_role`, `supabase_storage_admin`).
- **`SUPABASE_PROJECT_ID`** perd son sens en self-hosted → adapter la génération de types.

## Hors périmètre (YAGNI)

- Zéro downtime (réplication logique) — non retenu.
- Migration des logs / analytics (Logflare) — non nécessaire.
- Realtime — non utilisé par l'app.
