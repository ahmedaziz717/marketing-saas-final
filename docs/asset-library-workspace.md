# Asset Library implementation status

The implementation branch targets the existing Frame staging migration branch. The Manus application and main branch are not modified. This change performs no live social posts or advertising actions.

## Implemented

- Shared Asset Library route at `/app/library`, with independent asset type and review status filters.
- Images, videos, UGC, and brand/product source views. UGC is a classification, not a duplicate file.
- Image uploads (12 MB per file) and MP4/WebM uploads (20 MB per file), saved as drafts.
- Studio-generated records appear directly in the library without copying media.
- Explicit submission, approval, change-request and rejection actions; stale review decisions are rejected.
- Linked upload versions preserve original media and approvals.
- Role-checked and tenant-scoped operations, file signature validation, UGC permission confirmation and transactional audit history.
- Content Studio handoff to the same library and review queue.
- Brand source view now links to the shared library instead of maintaining separate upload/review controls.
- Retired direct-review API routes reject requests and explain the new review path.
- Existing generation and publishing API consumers check the current library approval/fingerprint rather than only an old status column.
- Queued creative jobs recheck source approvals before generation.
- Legacy Meta requests must still match their frozen creative copy and review timestamp before approval/execution.

## Verification

CI runs TypeScript checks, unit/integration tests, build and startup smoke checks against isolated PostgreSQL. New integration tests cover retired endpoint bypasses, source/finished purpose restrictions, stale source approvals, queued source validation, cross-workspace access, frozen publishing copy and revoked approvals.

CI mocks storage where relevant. It does not prove real Supabase upload or video playback. Browser checks and real storage verification must be recorded separately before declaring production readiness. No new database migration is required for the library.

## Still separate unfinished work

Full Facebook OAuth/account selection and live workflow validation; Social Media and Advertising channel workspaces; centralized weekly/future scheduling; cross-channel Analytics; larger resumable video uploads. Channel backend drafts from the previous work are not part of this library-only checkpoint.
