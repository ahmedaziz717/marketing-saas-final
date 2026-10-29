# Frame public website and Meta review readiness

## Release scope

Frame's public website is rebuilt around Create, Activate, Measure and Optimize, with responsive product pages, an integrations explanation, proposed pricing, company information and a shared public trust footer. Server-rendered HTML makes all public disclosures readable without a Frame account or JavaScript. Public routes use local/system typography, no third-party tracking scripts, canonical metadata, a sitemap, security headers and accessible native forms/menu controls.

The application, original Manus deployment, existing assets, generation engine, customer workspace permissions, Meta app credentials and live-delivery flags are not reconfigured by this release. Public rendering is registered before the authenticated application and does not execute authentication or mutate a customer workspace. Customer logins continue to use `/login` and the app continues to use `/app`.

## Public addresses

Under `https://frame-staging.onrender.com`:

- `/`: home and the four-part product story.
- `/product` and `/product/create`, `/product/activate`, `/product/measure`, `/product/optimize`.
- `/integrations`: independent customer authorization, data use and capability availability.
- `/pricing`: proposed Launch/Growth/Scale/Enterprise prices, not an active purchase flow.
- `/about`: service description, legal operator and contacts when confirmed.
- `/contact`: working access, demo, support and privacy enquiry intake.
- `/privacy`: current data handling, AI processing, providers, retention and rights.
- `/terms`: preview terms, not final commercial-contract advice.
- `/data-deletion`: instructions plus public deletion-request intake.
- `/security`: concrete controls, limitations and how to report concerns.

Use `/privacy` for a privacy-policy URL only after the operator has reviewed and approved it. `/data-deletion` is a human-readable deletion **instructions** URL, not a signed-request data-deletion callback. Do not register the instructions URL as a webhook. This release implements no Meta webhook callback or automated account-erasure process. Meta's actual app-review requirements must still be checked against the selected use cases and access level; a website does not confer API permission, partner status or guaranteed approval.

## Mandatory operator confirmation before submission

The legal company operating Frame and the public support/privacy mailboxes were not confirmed by the owner. They must not be inferred from CLX's portfolio display name, a workspace's brand kit, or a personal email.

The platform administrator should open `/app/platform/website` (also linked from Settings for that global role) and supply the legal company, public support email and public privacy email, plus an optional public address and operating-company HTTPS website. Confirm their accuracy against the business being verified by Meta. Review the actual published Privacy, Terms, Security and Data deletion text with the responsible operator/legal reviewer, including vendors, international transfers, operational handling and retention. Establish a monitored mailbox and inbox owner. Then explicitly confirm the disclosure checklist and save.

Until this happens, company/legal panels explicitly identify the disclosure draft and missing identity; public routes are `noindex, follow` but remain readable by crawlers. This must not be described as a complete submission-ready business website. The confirmation records the global admin and timestamp. Editing a public identity field in the UI clears the approval checkbox. No billing or provider functionality is enabled by that checkbox.

Platform administration uses the existing **global** `users.role = admin` authorization determined by the configured platform owner identity. A customer's workspace `owner`, `admin`, `creator`, `reviewer` or `publisher` role does not grant access to the profile or public request inbox. Do not grant platform-wide administration as a shortcut for customer support.

## Request intake and daily operating responsibility

The unauthenticated form stores a bounded name, email, category, optional workspace reference and message in `app_private.website_requests`. It uses same-origin checks, a short-lived signed form token, a honeypot, per-IP rate limiting and a 16 KB body limit. Repeated submissions of the same valid form are idempotent. The form accepts no file uploads and asks for no credentials.

A successful save redirects to a high-entropy private receipt URL. Only the hash of its bearer token is stored. Receipts show state and dates, never the name, email, workspace, message or internal resolution note. A receipt does not confirm that any claimed workspace or Meta account exists. Failed submissions show a real error and are not reported as delivered. Receipts are noindex/no-store and do not send referrers.

The platform administrator's **Public requests inbox** lists received requests and supports an internal note plus Received / Under review / Awaiting verification / Closed. These writes use optimistic concurrency. No automatic outbound confirmation email, invitation, demo booking, account creation or data deletion is performed. Mail links open the administrator's email application; the operator must monitor and respond. Status changes by themselves are not fulfillment.

For deletion requests:

1. Acknowledge the request using the supplied email, without disclosing other users' records. Verify identity and relevant authority through existing account/business contact channels. Do not request passwords, tokens, or excessive identity documents.
2. Identify the exact individual data and/or authorized workspace scope. Protect other users' data. Record scope and applicable legal deadlines; do not promise an invented universal deadline.
3. Stop ongoing processing or affected queues as appropriate, revoke/disconnect eligible credentials, and prepare the exact records/media to remove or anonymize. Shared data, immutable audit records and foreign keys require reviewed execution, not an unscoped SQL delete. Fulfillment is a separate authorized operational action, not a button added here.
4. Determine actual provider/back-up retention and any justified legal/security exceptions, coordinate with providers, and record them. Do not assume backup erasure or provider deletion is instantaneous.
5. Verify the performed actions and communicate the outcome and exceptions, then record an internal note and close. Deleting data from Frame does not delete Facebook accounts/Pages/posts or stop external advertising that was already running.

Keep the inbox and verified public emails monitored. Review stale/open requests routinely. Public forms are useful for review only when the operator can actually fulfill the described process.

## Honest feature and pricing language

Creation and asset review are available in preview. Facebook and Meta delivery/reporting require platform configuration, customer authorization, provider permissions and live delivery where applicable. Public Meta onboarding is pending; no first-party customer account is hardwired. New ads are paused image ads in existing ad sets; campaign activation and budget changes are not promised.

Video generation, email/page/blog builders, other channels, attribution, incrementality, recommendations, budget optimization and the autonomous agent remain explicitly planned. Uploading an existing video is not video generation. Proposed $99/$299/$799 tiers and Enterprise custom are previews, with no checkout or quota enforcement; no unimplemented feature is portrayed as unlocked by paying.

## Migration, safety and verification

Additive migration `0003_lazy_dexter_bennett.sql` adds private `website_profile` and `website_requests` tables with RLS and no customer/public policies. Existing tables/data are not altered. The web service runs migrations before starting; the unchanged creative worker does not require a restart for this release.

`server/publicWebsite.test.ts` uses actual Express routes and migrated PGlite. It checks all public documents, authorization isolation, profile validation/revisions, stored-value escaping, form origin/timing/body limits, idempotent receipts, rate limiting, private receipt data, admin status changes and RLS. Client tests check hidden customer access, disclosure reconfirmation and non-destructive request handling. Existing migration-bootstrap expectations are updated for the two new tables and one migration.

`scripts/check-public-website.mjs` starts the actual production server, fetches all public routes and assets, then renders those HTML documents with the exact built CSS in Chrome without hydration. It checks 36 desktop/mobile cases, overflowing content, native mobile navigation, FAQ toggles and form validation. About:blank rendering avoids the container's browser localhost restriction; this is not a logged-in real-account walkthrough. HTTP headers and status responses are tested separately. The CI pipeline runs all existing tests and dialog/channel regressions as well as this new public-site check.

## External review sources and limitation

Attempted to inspect Meta's official Platform Terms, access verification and data-deletion documentation on 2026-09-21. Those pages returned rate limiting or were inaccessible to the research tool. The implementation follows the actual dashboard requirement shown by the owner for a complete service website and business identity, and accurately discloses the inspected application behavior. It is not a claim that every current Meta/legal requirement has been verified.

Recheck the current official pages in the operator's browser before submission:

- https://developers.facebook.com/terms/
- https://developers.facebook.com/docs/development/release/access-verification/
- https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback/
