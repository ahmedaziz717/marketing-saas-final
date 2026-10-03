# Facebook-first channels, publishing and analytics

## Delivered scope

- Social Media > Meta / Facebook: separate organic workspace, authorized Page connections, recent published posts, and the same Facebook-filtered calendar used by Publishing.
- Advertising > Meta Ads: existing campaigns, ad sets and ads; account selection; paused image-ad creation into an existing ad set. Previous Meta publishing requests and connections remain available under `/app/advertising/meta/legacy`.
- Publishing: one durable publication record across channel and global views; weekly default plus month/list and arbitrary future dates; explicit draft, publication review, scheduling, cancellation, safe failure retry, and uncertain-delivery reconciliation.
- Facebook plan defaults to two posts weekly with editable target, time zone and preferred slots. Empty slots are placeholders, not scheduled posts. A user-invoked AI action prepares caption drafts from the active brand and approved catalog; generated captions are never auto-approved or auto-published.
- Analytics: connected-account overview, Social Media and Advertising views, 1-93 day ranges, equal-period comparisons, account-currency grouping, paid daily series, campaign results and platform delivery breakdowns. Unavailable metrics remain unavailable, not zero. Current followers and lifetime post reactions are labeled explicitly.
- Integrations: separate Social Media and Advertising categories; encrypted user/Page tokens; Meta OAuth, explicit Page/ad-account selection, verification and disconnection. Future channels stay clearly marked as planned.
- Approved finished assets can be handed to Publishing from the shared library. The Studio/Saved work -> Submit -> Library/Needs Review workflow remains unchanged.

## What is deliberately not in this release

Instagram/TikTok organic delivery, Google/Microsoft ads, comment automation, new campaign/ad-set creation, audience editing, budget changes, ad activation and budget optimization are not implemented here. New Meta ads are always created PAUSED. Asset approval is never authorization to spend. Real Meta OAuth consent, app review, live posting and real-account analytics must be validated against an authorized account; fixture tests are not evidence of those external prerequisites being complete.

## Server setup

Use the same server-only values for web and worker:

- Existing Supabase/PostgreSQL configuration and `INTEGRATION_TOKEN_ENCRYPTION_SECRET` remain required.
- `META_APP_ID` and `META_APP_SECRET`: the application's own Meta app, never frontend variables.
- `APP_ORIGIN`: deployed HTTPS origin, already used by auth.
- Register `<APP_ORIGIN>/api/channels/meta/callback` as the exact OAuth redirect URI in Meta.
- Optional `META_LOGIN_CONFIG_ID` for a configured business-login flow.
- `META_ADVANCED_TOKEN_ENABLED=false` by default. Advanced user-token setup is owner/admin only when explicitly enabled. Existing encrypted Meta credentials can be revalidated without exposing the token to the browser.

Facebook scopes requested: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `read_insights`. Advertising scopes additionally request `pages_manage_ads`, `ads_read`, `ads_management`. Access and Page tasks must actually be granted by Meta. A connected account can be read-only; the UI shows separate capabilities. Meta may require app review/advanced access and business/account configuration before non-app-role users can connect.

## Delivery safety

`LIVE_SOCIAL_ACTIONS_ENABLED=false` and `LIVE_AD_ACTIONS_ENABLED=false` are the safe staging defaults. The UI can save a test schedule after a real destination is selected and approved. Each queued record stores `deliveryMode=test|live`; merely enabling live mode later does **not** send existing test schedules. A publisher must explicitly queue them again.

Web and worker live flags must agree. Approval belongs to caption, asset revision, connection version and schedule. Editing clears approval and queue status. Reconnection/disconnection invalidates queued authorization. Before delivery the worker rechecks approved assets and an active authorized approver. It claims each job transactionally, uses a unique lease, checkpoints intermediate ad uploads, and blocks automatic retries after uncertain final writes. Missed schedules older than one hour are returned for review instead of being sent late. Video acceptance is shown as Processing until Meta confirms readiness.

Definitive failures can be retried or returned to draft for correction. Uncertain deliveries require checking Meta and verifying an existing object ID. There is no blind retry or automatic deletion of external content. Source approvals and final publication approvals are separate.

## Data, migrations and reporting

The Drizzle-generated additive migration creates `app_private.channel_connections`, `channel_oauth_sessions`, `channel_plans`, and `publications`. All four have RLS enabled, no public/customer policies, and server-side membership checks. Credentials stay encrypted and are omitted from API responses. No existing asset, draft, user, or legacy request is deleted or migrated.

Meta Graph API is pinned to v26.0, checked against Meta's official business SDK (`facebook/facebook-python-business-sdk`, apiconfig.py and Page/AdAccount/AdsInsights objects) and Meta's official Facebook and Marketing API Postman collections on 2026-09-20. Page metric names are requested separately so one unavailable metric does not hide all other data. Provider/API scope and format compatibility still require live-account testing. Do not sum unique reach across channels, mix currencies, or describe attributed purchases as deduplicated sales.

Current bounds are explicit: up to 500 recent publications in the calendar; up to 500 objects per provider collection; up to eight reporting accounts at once; uploads use the existing 12 MB image / 20 MB video limits. Future channel integrations and larger-volume pagination are separate work.

## Verification

Run `pnpm check`, `pnpm test`, `pnpm build`, `node scripts/smoke-build.mjs`, and both Chrome fixture scripts. Isolated PostgreSQL/PGlite coverage checks RLS, role and tenant isolation, OAuth state/replay/selection, scheduling time zones and DST, draft/approval identity, test/live mode boundaries, connection/asset/approver revocation, uncertain delivery, paused ad creation and audit integrity. Chrome fixtures use the actual new page and dialog components with synthetic tRPC data, not a logged-in customer session. They exercise publisher/creator controls and desktop/mobile layout without real provider writes.
