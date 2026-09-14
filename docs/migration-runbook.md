# Frame: independent staging migration

This branch targets Render and Supabase. It is not a Manus deployment update.
The original MSCC application and `Marketing-OS` repository are outside the migration.
Source: the new `marketing-saas-final` project only.

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

Use a new Supabase **staging** project and a Render workspace owned by the business. Record their IDs and region before provisioning. Review current paid service costs before creating the two services in `render.yaml`; this file does not provision anything by itself.

Before applying the Blueprint, create a Render environment group named `frame-staging-secrets` in the same workspace. Add the settings from `.env.example` there: `APP_ORIGIN`, both database URLs, Supabase URL and keys, the AI key, and the integration encryption secret. `SUPABASE_OWNER_USER_ID` is needed only to bootstrap a new owner, not to elevate imported users. Both services reference this existing group. The Blueprint defines only nonsecret defaults; Render ignores `sync: false` inside environment groups, so secret values must be supplied through the group's settings. Confirm the service names do not already belong to another app before applying the Blueprint.

1. Create the Supabase project and a **private** `frame-assets` bucket. Keep `app_private` out of the Data API exposed schemas. Browser access goes through the application API.
2. Supply `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and the server-only `SUPABASE_SECRET_KEY` through service secret settings.
3. Set `DATABASE_MIGRATION_URL` to a direct/session connection with schema migration privileges. Set `DATABASE_URL` to the application connection; use a dedicated role with access only to `app_private` for the final production release. Prepared statements are disabled for Supabase pooler compatibility.
4. Deploy `frame-staging` from this branch; set `APP_ORIGIN` to its HTTPS origin with no trailing slash. Configure Supabase's Site URL and allowed redirect URLs for `/api/auth/callback` on that origin. Render's generated domain is sufficient for staging; no production DNS change is needed.
5. Create the worker service with `CREATIVE_WORKER_ENABLED=false`. Keep `AUTH_SIGNUP_ENABLED=false` and `LIVE_AD_ACTIONS_ENABLED=false` during the import.
6. Configure authentication email delivery. Supabase's default email service has restrictions; use approved SMTP before customer launch. A code email template can include `{{ .Token }}`; the standard link flow is also supported through the callback route.
7. Transfer the existing direct AI key through service secret settings. Validate required model access before enabling the worker. Do not substitute an alternate model silently.
8. If importing encrypted Meta connections, securely preserve the old Frame `JWT_SECRET` value as `INTEGRATION_TOKEN_ENCRYPTION_SECRET`: the legacy encryption input must match. This secret is no longer used to authenticate customers. Do not use the unrelated Replit key.

No provider keys, passwords, connection strings, snapshots, or raw logs belong in GitHub or chat. Source credentials belong only in the offline migration environment, never on Render.

## Rehearse the data migration

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

Local preparation on 2026-09-14 passed TypeScript checks, 89 tests (one live AI test intentionally skipped), the production build, the frozen lockfile consistency check, and the production HTTP smoke with `--allow-unconfigured-db`. That smoke explicitly expects health status 503 when no database is configured. The migration is now published as draft PR #3. The full PostgreSQL 17 CI workflow and actual cloud checks remain release gates. No Render/Supabase resource, source snapshot, or production traffic was changed.
- Verify actual Supabase email delivery, login, logout, rejected/expired tokens, mapped company history and a second company that cannot read the first company's records or assets.
- Compare source/target table counts, all activity hash chains and the complete asset manifest. Preview and download images from each represented asset type.
- Enable the worker only for a bounded staging generation test after model access is verified. Test restart/lease recovery and approvals. The legacy brief generator still runs within its request; move that older flow to the worker before supporting it at production scale. Catalog crawl steps also still need durable scheduling if unattended imports are part of launch scope.
- Keep live ad execution disabled throughout staging. Owner notifications formerly delivered by Manus require a separate notification provider; the endpoint reports this explicitly.
- PostgreSQL native enums and indexes now enforce the target schema; confirm any newly added Manus fields have been ported before the final export.

## Cutover and rollback

The first staging snapshot is a rehearsal, not a live cutover. Before paying customers use the new deployment, finish production role/backup/monitoring configuration and its separate account/service checks.

For the final data move, freeze writes and finish active jobs on the source, take a fresh verified snapshot, import into a fresh empty production target, map identities and validate assets/history. Then switch the production domain only when those gates pass.

Keep the source available as the rollback reference. Before destination writes begin, rollback can route traffic back to the unchanged source. After destination writes begin, rollback requires reconciliation of those new records; switching DNS back alone would lose that work. Do not delete the source or its media as part of cutover.

## References

- [Render Node services](https://render.com/docs/deploy-node-express-app), [workers](https://render.com/docs/background-workers), [Blueprints](https://render.com/docs/blueprint-spec)
- [Supabase authentication](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [email delivery](https://supabase.com/docs/guides/auth/auth-smtp), [storage](https://supabase.com/docs/guides/storage)
- [Drizzle PostgreSQL/Supabase](https://orm.drizzle.team/docs/connect-supabase)
