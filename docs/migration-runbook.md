# Frame: independent staging migration

This branch targets Render and Supabase. It is not a Manus deployment update.
The original MSCC application and `Marketing-OS` repository are outside the migration.
Source: the new `marketing-saas-final` project only.

## Current deployment decision: start fresh

The user confirmed on 2026-09-15 that existing live data does not need to be carried over. The default deployment is a new, empty Supabase database with a fresh owner account. Existing products, creatives, uploads, user mappings and connected-provider credentials are not prerequisites for staging. This does not authorize deleting or resetting the existing Manus application or its data.

1. Confirm the business's Supabase organization and Render workspace, then review the actual service costs before provisioning.
2. Apply the PostgreSQL schema to the new database and create a private `frame-assets` bucket. Skip all export, import, asset-copy and legacy-user mapping commands below.
3. Create and verify the owner's Supabase Auth identity. Set `SUPABASE_OWNER_USER_ID` to that identity's UUID for the platform owner; the first successful sign-in creates its application user. Keep public signups disabled during setup.
4. Supply fresh service configuration and a newly generated integration encryption secret through the cloud services' secret settings. Existing encrypted provider connections are not being imported, so the old Manus encryption secret is unnecessary.
5. Deploy the migration branch to Render, sign in and create the company through onboarding. Upload the Brand Kit and add the products needed for a controlled creative-generation check.
6. Verify login, company permissions, private media, saving, approvals and the generation worker. Enable customer signups only when their complete flow and email delivery have been verified.

The older data-transfer instructions below are optional reference material. Data-transfer rehearsal and a final source-data freeze are not release gates for this fresh-start deployment. Hosting, authentication, private storage and generation still need actual cloud verification before release.

## Development coordination

- Keep Manus developing on `main`. Bring its changes into this migration branch and port new database fields or service calls before staging deploys.
- Keep the migration PR in draft. Merging this PostgreSQL/authentication build into the current Manus deployment prematurely would break its MySQL runtime.
- Review the branch difference again immediately before a release. GitHub code sync does not transfer databases, uploaded files, credentials or identities.

## Prepared in this branch

- PostgreSQL definitions and a reviewed initial migration for 18 application tables in `app_private`. Original MySQL SQL files remain reference material.
- Node/React app and independent creative worker, with Render staging configuration.
- Supabase customer email-link/code login, HttpOnly session cookies, server-verified users, and an explicit mapping from existing numeric user IDs to Supabase identities. Client profile metadata never grants an admin role.
- Private Supabase Storage, with company membership checks before a signed asset URL is issued. `/manus-storage/...` remains an authenticated compatibility path for historical records.
- Direct text/image provider calls. The required image engine remains fixed server-side and is not named in customer-facing generation errors.
- Read-only MySQL export, transactional PostgreSQL import, asset copy with byte verification, and explicit account mapping tools.
- Generation requests are persisted before a worker claims them. Claims use PostgreSQL row locks; interrupted attempts expire as failed and require a deliberate retry. No automatic image retry can create another charge without the user's retry decision.

## Service setup

The confirmed Supabase organization is **Cybertron International, Inc.** (`dnzqazuqjwfqylgnnhwu`) and the Render workspace is **My Workspace** (`tea-dak3afe743jc73fqgsv0`). The fresh Supabase project is **frame-staging** (`lxejhbtyfwpxlreuueyi`, Ohio). Its 18 application tables and private `frame-assets` bucket have been created and checked. See [Staging activation](staging-activation.md) for the exact dashboard links and remaining fields.

Apply `render.yaml` from `codex/render-supabase-migration`, not `main`. Render's initial Blueprint form prompts for the database URL, Supabase publishable and secret keys, owner identity UUID, and AI key. No pre-existing environment group is required. The HTTPS app origin is resolved from Render's assigned URL and the integration encryption secret is generated automatically. Worker credentials reference the web service values. Review the paid worker cost before applying the Blueprint.

For this single-instance fresh staging deployment, `pnpm db:migrate` uses `DATABASE_URL` at web startup. The connection must have migration privileges and use the session pooler with TLS. Production must separate the least-privilege application connection from `DATABASE_MIGRATION_URL`, and run migrations as a controlled deployment step on a paid service. The free staging web service sleeps when idle; the paid worker remains running even while job processing is paused.

1. For another fresh Supabase project, render `node scripts/migration/supabase-bootstrap.mjs` and apply the SQL as one Supabase migration. It creates the **private** `frame-assets` bucket, applies the reviewed PostgreSQL schema, records the same hashes as Drizzle and revokes browser-role access. It refuses an existing `app_private` schema. Do not reapply it to the current staging project. Keep `app_private` out of the Data API exposed schemas. Browser access goes through the application API.
2. Supply `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and the server-only `SUPABASE_SECRET_KEY` through service secret settings.
3. Set `DATABASE_MIGRATION_URL` to a direct/session connection with schema migration privileges. Set `DATABASE_URL` to the application connection; use a dedicated role with access only to `app_private` for the final production release. Prepared statements are disabled for Supabase pooler compatibility.
4. Deploy `frame-staging` from this branch; set `APP_ORIGIN` to its HTTPS origin with no trailing slash. Configure Supabase's Site URL and allowed redirect URLs for `/api/auth/callback` on that origin. Render's generated domain is sufficient for staging; no production DNS change is needed.
5. Create the worker service with `CREATIVE_WORKER_ENABLED=false`. Keep `AUTH_SIGNUP_ENABLED=false` and `LIVE_AD_ACTIONS_ENABLED=false` during initial setup and verification.
6. Configure authentication email delivery. Supabase's default email service has restrictions; use approved SMTP before customer launch. A code email template can include `{{ .Token }}`; the standard link flow is also supported through the callback route.
7. Transfer the existing direct AI key through service secret settings. Validate required model access before enabling the worker. Do not substitute an alternate model silently.
8. If importing encrypted Meta connections, securely preserve the old Frame `JWT_SECRET` value as `INTEGRATION_TOKEN_ENCRYPTION_SECRET`: the legacy encryption input must match. This secret is no longer used to authenticate customers. Do not use the unrelated Replit key.

No provider keys, passwords, connection strings, snapshots, or raw logs belong in GitHub or chat. Source credentials belong only in the offline migration environment, never on Render.

## Optional: preserve old data if the decision changes

The source credential should have read-only access. The export starts a read-only consistent transaction. It refuses unexpected source tables or columns and active creative/publishing jobs. If a source permission/dialect does not support that snapshot command, arrange a verified read-only export; do not silently downgrade snapshot consistency.

```sh
pnpm migrate:export migration-data/snapshot.json
pnpm migrate:import migration-data/snapshot.json
pnpm migrate:assets migration-data/snapshot.json
```

The last two commands are dry runs. The export includes checksums and counts, preserves numeric IDs, and writes private local files that are excluded from git. Do not export while generation is still running. The source may continue ordinary development after a staging snapshot; that snapshot will not automatically receive later records.

Apply the PostgreSQL migration to the empty target, then import and copy assets:

```sh
pnpm db:migrate
pnpm migrate:import migration-data/snapshot.json --apply
pnpm migrate:assets migration-data/snapshot.json --apply
```

The importer locks target tables, refuses any existing rows, preserves foreign keys, compares counts, resets identity sequences, and rolls back row changes on failure. The asset copier preserves keys, verifies source/target byte hashes, and never overwrites a conflicting target object. A rerun checks already copied assets.

Create and verify each needed Supabase auth identity using secure account administration. Map it to the existing application user only after the verified email matches:

```sh
pnpm migrate:link-user EXISTING_NUMERIC_USER_ID SUPABASE_AUTH_USER_UUID
pnpm migrate:link-user EXISTING_NUMERIC_USER_ID SUPABASE_AUTH_USER_UUID --apply
```

The mapping command preserves roles and company memberships. It never selects an existing account from an unverified email supplied by a browser. Staging signups stay disabled until the imported owner is mapped.

## Verification and release gates

- Run `pnpm check`, `pnpm test`, `pnpm build`, and `node scripts/smoke-build.mjs` against an isolated PostgreSQL database. GitHub CI provisions PostgreSQL 17 and applies only the PostgreSQL migration history. The HTTP smoke check verifies public application bundles, authenticated media, origin enforcement and database health.
- Local tests without a PostgreSQL server: `pnpm exec vitest run --exclude '**/*.integration.test.ts'`. These include PGlite PostgreSQL schema/import/security tests. They do not replace real server concurrency or cloud service checks.

The PostgreSQL 17 CI workflow passed at `993f0ca70f1020f8ac43219987d216452ffd27e5`: 104 tests passed, one live AI test skipped, with frozen dependency installation, schema migration, TypeScript, production builds and HTTP smoke checks. The fresh-cloud bootstrap also passed a local PGlite test proving that a subsequent Drizzle migration does not replay the initial schema. The migration remains draft PR #3. Supabase now has 18 empty application tables and a private bucket, browser-role access is denied, and its security advisor returned no findings. Actual Render hosting, email login and generation have not yet been verified. No source data or production traffic was changed.
- Verify actual Supabase email delivery, login, logout, rejected/expired tokens, owner onboarding and a second company that cannot read the first company's records or assets.
- Verify uploads, previews and downloads for newly created assets. Only if the data-preservation decision changes: compare source/target counts, activity hash chains and the imported asset manifest.
- Enable the worker only for a bounded staging generation test after model access is verified. Test restart/lease recovery and approvals. The legacy brief generator still runs within its request; move that older flow to the worker before supporting it at production scale. Catalog crawl steps also still need durable scheduling if unattended imports are part of launch scope.
- Keep live ad execution disabled throughout staging. Owner notifications formerly delivered by Manus require a separate notification provider; the endpoint reports this explicitly.
- PostgreSQL native enums and indexes now enforce the target schema; confirm any newly added Manus fields have been ported before the final export.

## Cutover and rollback

This fresh staging deployment is separate from live Manus. Before paying customers use it, finish production role/backup/monitoring configuration and its separate account/service checks.

No source-data move is required under the current decision. Switch the production domain only after the independent application passes its release gates. If preservation is requested later, first freeze source writes and finish active jobs, take a verified snapshot, import into a fresh empty target, map identities and validate assets/history.

Keep the source available as the rollback reference. Before destination writes begin, rollback can route traffic back to the unchanged source. After destination writes begin, rollback requires reconciliation of those new records; switching DNS back alone would lose that work. Do not delete the source or its media as part of cutover.

## References

- [Render Node services](https://render.com/docs/deploy-node-express-app), [workers](https://render.com/docs/background-workers), [Blueprints](https://render.com/docs/blueprint-spec)
- [Supabase authentication](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [email delivery](https://supabase.com/docs/guides/auth/auth-smtp), [storage](https://supabase.com/docs/guides/storage)
- [Drizzle PostgreSQL/Supabase](https://orm.drizzle.team/docs/connect-supabase)
