# Google studios, account-aware reporting and catalog repair

Status: implemented and verified locally; full PostgreSQL-backed CI and deployment are pending publication approval.

Requested next-release work: #80, #82 and #83. This release implements product controls; verification does not launch real advertising or run paid generation.

## Google campaign controls

Activate → Google Ads opens `/app/activate/google`, preserving a carried creative asset. Integrations links directly to campaign management and reports. The shared journey covers Campaign, Delivery, Creative and Review, with new/existing/saved-draft paths and explicit account currency/timezone. Existing campaigns default to active, with an inactive opt-in. Measure and Optimize handoffs retain the Google account.

| Family                                         | New campaigns                                                                                                             | Existing campaigns and creative                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Search                                         | Budget/bidding, dates, locations/languages, networks, positive/negative keywords, responsive search ad                    | Name/status/budget; add a responsive search ad to an existing group                                  |
| Performance Max                                | Budget/bidding, dates, targeting, URL expansion, brand assets, creative asset group; optional linked Merchant Center/feed | Name/status/budget; create groups, edit group name/status/URL, add/reuse/unlink/replace group assets |
| Display                                        | Responsive display creative, budget/bidding, dates and targeting                                                          | Name/status/budget; add responsive display ads                                                       |
| Standard Shopping                              | Linked Merchant Center/feed, priority, budget/bidding, all-products group and product ad                                  | Name/status/budget; existing hierarchy and reporting                                                 |
| Demand Gen                                     | Image creative, audience, channel selection, budget/bidding, dates, group targeting                                       | Name/status/budget; add image ads to existing groups                                                 |
| App installs                                   | Android/iOS app ID, install bidding, creative text/images/video, dates and targeting                                      | Name/status/budget; existing hierarchy and reporting                                                 |
| Other existing types, including video variants | Create in Google Ads                                                                                                      | Inventory/reporting and supported name/status/budget changes are validated by Google                 |

Existing shared or total budgets require Google Ads for budget edits. Advanced product subdivision, account conversion-goal configuration, remarketing/audience creation, video-specific creation and specialized campaign settings remain in Google Ads. These are not silently approximated. Google validation determines account eligibility and applicable requirements. Product listing trees include all products; the UI states that scope.

Approved workspace images are dimension-checked and uploaded only as part of an explicitly reviewed change. Existing customer assets and YouTube videos can be reused. PMax brand assets are associated at campaign level for new campaigns with brand guidelines; group edits preserve those brand assets. Replacements remove associations, never the shared asset itself. Existing policy approval and group ad strength are visible.

Drafts are tenant-scoped, revisioned and audited. Validation uses `validateOnly`, then publication rechecks the exact review hash, account version, membership, current campaign/group/budget and asset evidence. The shared `LIVE_AD_ACTIONS_ENABLED` switch and publisher/admin/owner role are required. Publication is atomic, is claimed once, and never automatically retries an uncertain provider outcome. Uncertain or published drafts cannot be edited into duplicate launches. No raw mutation endpoint is exposed to the browser. Read-only Google transport guards remain intact.

## Measure and Optimize

Include inactive campaigns defaults off for Google and Meta. Totals, daily points, campaign rows, purchase-only conversion queries and both comparison periods share the same scope. Old saved results remain historical snapshots and are marked for refresh. Account-aware setup removes irrelevant provider settings.

The shared dashboard adds quick/custom dates, previous-period comparison, Follow dashboard/Custom range, day/week/month aggregation, chart duplication and Google/Meta starter layouts. Area, line, column, combination, ranking, share, table and account comparison charts use real report data. Weighted ratios, nulls, currencies and fractional conversions retain their meanings. Google detail options include campaign, ad group, asset group, ad, device, country and hour. Unsupported details are labelled unavailable; individual-asset ROAS is never invented.

Google history now uses the existing durable optimization queue, workspace access checks, snapshots, classifications, evidence, analysis and workflow templates. Search/display ads and PMax asset groups remain distinct evidence units. PURCHASE metrics are separate from other conversions. Google device breakdowns are labelled as devices, with campaign/group IDs, dates, currency and attribution provenance. Meta publishing adapters retain their provider restrictions. Optimization does not automatically publish campaigns or change budgets.

## Catalog foundation and repair

Image URL semantics remain standard unless the source explicitly chooses directory-relative paths. Preview and worker use the same saved mapping revision and image decoding checks. Product galleries come from product/variant images, without substituting installed-component thumbnails. Imports preserve source/external identity, manual facts and review decisions. Batches checkpoint within pages, fence stale workers and recover idempotently. Failed images remain visible while independent products continue; stored-file/product counts report actual storage records.

The source repair action changes only the selected source's image mapping and queues an image-only pass. Existing media, product IDs, manual facts, review status and variants remain. Specification ordering prefers a manual override, then explicit source order, then category priorities and stable fallback.

## Verification and rollout

Focused tests cover scoped active/all-status totals for both providers; publication validation/approval, tenant isolation, shared budgets, parent mismatches and uncertain delivery; Google history, fractional PURCHASE attribution and idempotent replay; and a 159-product image repair with preserved manual review and no duplicate media. Actual studio fixtures exercise desktop, laptop and phone interactions. Full PostgreSQL-backed CI, migration, build and browser checks are required before merge.

Migration `0019_google_campaign_review.sql` adds one private RLS-enabled table. Deploy the existing web service first, verify health and allow the previous web process to drain, then deploy the existing creative worker. Existing Google connections and OAuth settings are reused. Live account reconciliation and the authorized CLX image repair must be verified separately from fixtures.

Official API references checked during implementation:

- https://developers.google.com/google-ads/api/campaigns/overview
- https://developers.google.com/google-ads/api/performance-max/asset-groups
- https://developers.google.com/google-ads/api/performance-max/listing-groups
- https://developers.google.com/google-ads/api/demand-gen/channel-controls
- https://developers.google.com/google-ads/api/docs/conversions/reporting

## Observed local verification

- TypeScript, frontend/server/worker production builds and HTTP smoke checks passed.
- All 117 focused tests passed, covering the new Google, reporting, optimization and catalog paths.
- The broader local run passed 1,360 tests and skipped the existing live-access test. Its two failures were obsolete Meta-only account-label assertions in Optimization Intelligence; both passed after updating the assertion to the shared advertising-account label and verifying Google selection. Seven suites requiring isolated PostgreSQL were excluded locally and remain mandatory in CI.
- All 20 selected actual-page Chrome cases passed at desktop, laptop, mobile and short-mobile sizes. New Google campaign and asset-group screenshots were visually inspected.
- The signed-in application was accessible for subsequent live verification. No production campaign was launched, budget changed, paid creative generated, or live catalog repair executed during these checks.
