# Issue 12: optimization intelligence

## Phase 1 audit (2026-10-10)
Baseline: `codex/render-supabase-migration` c12fdfea46d589a46c8737a8d528b3e537750226. Implementation branch: `codex/issue-12-optimization`. The original working tree and its unrelated image edit remain untouched.

| Area | Existing implementation | Gap / extension |
|---|---|---|
| Data/auth | Private PostgreSQL `app_private`, Drizzle migrations, Supabase authentication, membership checks, RLS | Add tenant-scoped history, checkpoints, classifications and trigger records. No auth replacement. |
| Meta | `channelGraph` validates paths, uses bearer auth, redacts errors, never follows provider paging URLs; `channelConnections` encrypts credentials | Current `graphCollection` caps pages and returns truncation. Add leased resumable one-page ingestion; no advertising writes. |
| Reporting | `channelReports` account/daily/campaign reports and standard date presets | Durable ad/day history, placement and hourly datasets kept separate, coverage and provenance, dimension filters and weighted totals. |
| Taxonomy | `creativeThemes`, `creativeBuilder` art styles and `workflowInputs` canonical system choices | Versioned multi-label dimensions; preserve authored values and manual overrides; unknown visual attributes stay unknown. |
| Workflows | Frozen graphs, optimistic revisions, leased worker, credit quotes, human review, waiting, delivery gates | Explicit triggers, reusable workflow calls with typed mapping, bounded safe-read retries, automation deduplication. |
| Apps | Versioned published interfaces over workflow graphs; separate navigation in every stage | Install workspace-owned optimizer templates; no parallel execution system. |
| Safety | Generation credit checks, publication fingerprints, explicit activation review, worker recovery avoids duplicate paid calls | Automated runs stop before chargeable work; all Meta mutations retain existing review gates. |
| Deployment | Render web and worker, auto-deploy off; web applies additive migrations at startup | Feature flags default off; validate migration/build first, web then worker, retain rollback commit. |

## Architecture and migration strategy
- Additive Drizzle migration in the existing journal; no destructive changes and no parallel Supabase migration history.
- Read-only Meta ingestion uses the existing credential and permission boundary. Checkpoints and page upserts commit atomically; tenant/connection/entity keys make retries idempotent. A lease fences stale workers. Bounded backoff handles throttling/transient errors; permission errors remain visible.
- Insight grains (ad/day, placement/day, hour) are separate and never summed together. Record attribution parameters, currency, account timezone, fetched time, Graph version and missing fields. Object attributes are current snapshots, not historical reconstructions.
- Classifications are versioned assertions per dimension with labels, confidence, evidence, source and actor. Human overrides take precedence. Reuse theme/art-style IDs; do not invent exact HEX values or visual/persona labels without evidence.
- Analysis aggregates base counts before computing CTR/CPC/CPA/ROAS, excludes unavailable values rather than inventing zero, preserves source ad IDs and evidence coverage. Multi-label cohorts overlap; do not add them together. Observational association is not causality.
- Optimizers share a typed service and library. Published Apps are snapshots of workspace workflows; editing a copy never mutates global templates.
- Existing review, pricing and publication code remains authoritative. Scheduling never constitutes spending authorization.

## Rollout flags
`OPTIMIZATION_INTELLIGENCE_ENABLED=true` enables backend/UI; `OPTIMIZATION_TENANT_IDS` restricts rollout to comma-separated organization IDs (empty means none). `OPTIMIZATION_WORKER_ENABLED=true` enables read-only history/trigger processing for allowed tenants. Existing generation/publishing flags are unchanged. Kill switch stops new work without deleting history or suspending Render.

## Verification gates
1. PGlite executes every migration; tenant tests reject cross-workspace access.
2. Unit/integration coverage: aggregation and missingness, taxonomy override precedence, ingestion pagination/retry/resume, scheduling/idempotency, nested calls/types/cycles, approval/paid-action gates.
3. TypeScript, frontend/backend builds and targeted regression suite.
4. Desktop/mobile UI inspection and exported historical report.
5. Authorized CLX read-only sync with explicit coverage/limitations. No paid generation, ad publication or budget updates during validation.

## Sources checked
- Existing source and migration journal (primary implementation evidence).
- Supabase RLS documentation: https://supabase.com/docs/guides/database/postgres/row-level-security
- Meta official Marketing API collection: https://www.postman.com/meta/facebook-marketing-api/overview
- Meta rate limits: https://developers.facebook.com/documentation/ads-commerce/marketing-api/overview/rate-limiting.md/
- Meta dynamic creative attribution: https://developers.facebook.com/documentation/ads-commerce/marketing-api/ad-creative/asset-feed-spec/insights.md/

## Progress
- Phase 1: audit and architecture recorded; implementation follows in separate commits.
- Phases 2–9: pending. No live sync or rollout claimed yet.
