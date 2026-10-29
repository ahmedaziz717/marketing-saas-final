# Studio to Asset Library handoff

## User-visible flow

Content Studio > Create / Saved work is the working area. Generations and draft uploads are stored durably but are excluded from the Asset Library API and screen. Submit for approval sends a selected version to Asset Library > Needs Review. Authorized reviewers approve, request changes, or reject there. No separate top-level approval section is introduced.

Asset Library defaults to Approved Assets. Needs Review and Review history are views within that section. Returned/rejected submissions retain their history and appear in Studio for revision. Uploading a revised version never overwrites an original or inherits its approval.

Uploads can be started from the library or Studio. The upload dialog previews files, captures category/UGC usage permission, and explicitly asks whether to keep a Studio draft, submit it for review, or (owner/admin only) approve and add it. A draft upload from the library is redirected to Studio, not added to the shared collection.

## Authorization

Owners, admins and creators can access saved working assets and submit them. Owners, admins and reviewers can review submitted assets. Only owners/admins have both capabilities in the current role model and may use Approve & add to library. Creators and publishers cannot approve by forging API requests. Direct upload approval checks permissions before decoding or storing media. Normal review still requires a submitted version.

The direct shortcut records both submission and explicit approval in one organization-serialized transaction. Stale revisions, tenant boundaries, file validation, existing generation/publishing approval checks and immutable review events remain in place. No live posts, ads or budget changes are triggered.

## Data compatibility

No database migration or file deletion is required. Existing draft records become visible in Studio instead of the library. Existing approved records remain in the library. Stored files are not copied as part of submission. The library endpoint excludes drafts server-side; the role-checked studioList endpoint supplies working records and submission tracking.

## Verification

The change expands isolated PostgreSQL integration coverage for Studio/library visibility, generated records, upload dispositions, direct approval, role denial, cross-workspace access, stale revisions and retained audit history. Existing approval-consumer regressions remain. Component tests and Chrome viewport checks cover the new handoff controls. Mocked provider/storage tests are not proof of real external publishing or authenticated storage playback.
