# Frame product organization and commercial foundation

## Applied structure

The existing app is grouped as Create, Activate, Measure and Optimize. Home and Settings remain separate. Existing routes, asset records, approvals, connections and publishing permissions are retained.

- Create: Content Studio (overview, image assets, ad creative, social content, saved work and UGC uploads), Asset Library, Catalog and Briefs. Video creation, email builder, landing pages and blog content are explicitly planned.
- Activate: Advertising and Social Media have overview pages and the existing collapsible channel submenus; Email is planned; Publishing stays centralized.
- Measure: Analytics retains Overview, Advertising and Social Media, including existing URL-backed filters. Attribution and Incrementality show their planned scope, not fabricated reports.
- Optimize: Recommendations, Budget Optimizer, Experiments and AI Agent are explicitly planned. Roadmap pages cannot run those actions or change budgets.
- Settings: workspace, brand kit, team/access, Billing & Usage, Integrations and audit history. Connections are not duplicated in channel workspaces.

Image, ad-creative and social-content creation use the SAME existing image builder and saved work, not three independent editors. UGC is a filter/classification of uploaded images/videos. Unsubmitted drafts remain in Studio; submission sends the same version to the library review queue. No change to asset or publication approvals.

## Pricing remains a proposal

Launch $99/month with 1,000 monthly credits and a $10,000 monthly ad-spend band; Growth $299 / 4,000 / $50,000; Scale $799 / 15,000 / $250,000; Enterprise custom ($2,000+ was discussed, not committed). All amounts are USD.

There is no active Frame billing integration in this release. Checkout, payment methods, invoicing, credit charges, quotas, overages, ad-spend enforcement and automatic upgrades are NOT enabled. Video allowances and the commercial feature matrix are unspecified; no new limits are invented. Optional attribution/incrementality bundles and the measurement-only offering remain future commercial decisions.

Owners/admins can explicitly save a **plan preview**. That preference is stored as a tenant-scoped `billing.preview_plan_selected` audit event under the workspace lock, with revision conflict handling and role revalidation. It does not assign a subscription or change features/roles. Existing audit history is neither rewritten nor deleted.

## Entitlements

`shared/frameProduct.ts` is the typed product/plan catalogue. Its resolver distinguishes product availability (`available`, `connection_required`, `planned`) from workspace access (`preview`, `included`, `not_in_plan`, `planned`). Subscription-mode access accepts an explicitly provisioned feature list; there is deliberately no guessed tier-to-feature matrix. The live membership-protected `billing.entitlements` endpoint remains in preview mode with enforcement false. Planned tools remain planned even when listed in an entitlement policy. Provider access and each user's existing authorization checks still apply independently.

This is the foundation for future subscription enforcement, NOT an active paywall. Before billing activation, define and approve credit rates, a versioned commercial feature matrix, quota/overage policy, billing periods and currency policy; add verified provider subscription/webhook provisioning and billing-grade metering/reconciliation.

## Usage metering scope

Billing & Usage reads the EXISTING append-only audit ledger. Successful completion events already persist in the production workflow. No schema migration or retroactive write is required.

Meters: `creative_generation.completed` (saved image outputs from variantCount, not image API requests); `publication.ai_drafted` (saved caption drafts); `asset_library.uploaded` (manual library file uploads); `website_crawl.review_ready` (completed website scan jobs).

SQL aggregates by workspace, action, entity type and entity ID BEFORE applying inclusive-start/exclusive-end UTC calendar-month boundaries. Replayed completion events count once, in their first recorded month. Failed outcomes are excluded. Image quantities are validated before casting; malformed events do not break reporting. Historical retained events are included. Current active seats, catalog items and connected account counts are separate inventory gauges, NOT monthly usage.

These are successful-output counters, NOT provider token/cost accounting or billable credits. They exclude AI copy refresh and other AI operations without the listed completion events. Failed jobs may still have provider costs. Missing credit rates are shown as not calculated, never a zero charge or remaining-credit balance. Storage bytes are not measured. Advertising spend remains provider-reported and currency-scoped in Analytics, not fabricated in Billing.

Before using counters for invoices, add versioned rates, complete operation coverage, reservations/reconciliation, durable meter snapshots, retention guarantees and adjustment policies. No end-user API can write arbitrary usage.

## Test and deployment boundaries

Database/API tests run against migrated PGlite and the existing full CI/PostgreSQL suite. They cover cross-workspace and role denials, explicit preview-only writes, revision conflicts, idempotency, audit integrity, malformed inputs, historical metering, month boundaries and replay deduplication. Client tests cover menu groups, retained routes, preview confirmation, role restrictions, error handling and planned-feature messaging. Chrome exercises actual page components with synthetic data on desktop/mobile, including the existing publishing/approval regression suite.

Browser fixtures do not equal a logged-in real-account walkthrough. This change does not configure Meta OAuth, enable live delivery, publish a post, activate an ad, change spend or modify the original Manus app/main branch. Deploy only to the existing staging migration branch after checks pass.
