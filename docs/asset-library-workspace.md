# Asset Library implementation checkpoint

This feature branch is based on `codex/render-supabase-migration`. It does not modify the Manus deployment or the main branch. Nothing in this checkpoint launches ads or social posts.

## Scope implemented in this checkpoint

- Shared Asset Library route at `/app/library` with separate type/category and review-status controls.
- Image, video, UGC and brand/product source views. UGC is a classification, not a second physical asset.
- Uploads of JPEG, PNG, WebP, GIF (12 MB per file), MP4 and WebM (20 MB per file); all uploads are drafts.
- Generated creative records are directly visible in the library without copying the underlying media. Pending generated records are drafts, not automatically submitted.
- Explicit submit, approve, request-changes and reject transitions. Version/review revision checks reject stale requests.
- New upload versions link to the original record and never overwrite its media or approval.
- Role checks, tenant-scoped reads and mutations, file signature checks, UGC permission confirmation, and transactional audit events.
- Content Studio links to the shared library and submits results for review there; download and copy-text actions remain.
- Existing pre-library asset approvals and legacy creative comments are retained.

## Validation before deployment

Run `pnpm check`, `pnpm test`, `pnpm build`, and `node scripts/smoke-build.mjs` with the existing isolated PostgreSQL CI service.

The new unit and database integration tests cover review transitions, stale decisions, upload classification, generated-record normalization, version preservation, audit-chain integrity, malformed file signatures, and cross-workspace access.

A browser walkthrough and real Supabase upload/playback verification are still required before calling the feature production-ready. CI storage is mocked and is not proof of a real Supabase upload. Larger/resumable video uploads are not included in this checkpoint.

## Follow-up integration work (not represented as complete)

- Reconcile legacy Brand review controls and legacy review endpoints with the new explicit submission workflow.
- Enforce library fingerprint validation in every generation/publishing consumer, beyond the existing stored approval status checks.
- Verify the final layout, keyboard interactions and video playback in the deployed application.
- Social Media and Advertising channel workspaces, full Facebook connection and capability checks, weekly/future scheduling, and cross-channel Analytics remain separate unfinished workstreams.

No migration is needed for this checkpoint: uploads use existing `brand_assets.metadata`, generated images remain existing `creative_variants`, and review transitions use the existing organization-scoped audit ledger.
