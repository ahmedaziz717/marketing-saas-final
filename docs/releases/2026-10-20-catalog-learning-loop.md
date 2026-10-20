# Catalog and creative learning release

Customers can connect a product API using an endpoint and instructions, review actual normalized products, and answer focused questions when information is missing. Website product extraction now handles semantic label/value cards, definition lists, tables, labelled lists and structured data. The CLX page's hardware is separated from game benchmarks and related products; bounded HTML handling permits its larger document.

API mapping supports nested installed components and quantities, conditional product URLs, documented image bases, inventory and currency. One example link applies only to its product family when a feed contains multiple families. Instructions can be text, PDF or images. Advanced paths remain available. Credentials are excluded from returned mappings. Relative URLs never silently borrow an API host as a storefront.

Changed catalog facts return to review with before/after values. Manual corrections survive refreshes. Website details fill gaps in API records. Incomplete pages receive field-level extraction checks; missing evidence remains visible rather than being treated as complete. Pages whose facts exist only behind JavaScript or login still need a supplied API/feed or reviewed input; this release does not install a browser-rendering service.

Activation's Channel choice uses the shared Studio journey and summary. Existing channel drafts stay mounted and switching back retains their work.

## Four stages

- **Create:** A shared taxonomy covers 50 dimensions for images, video, copy, brand, product and delivery context. Requested settings and observed facts are distinct. Unknown and not-applicable values are explicit. Reviewers can add evidence to a specific asset fingerprint. Generated image and video directions and learning briefs persist with their jobs/assets.
- **Activate:** Approval captures immutable creative snapshots alongside the publication. Delivery receipts bind the publication to the external ad and creative IDs. Multi-asset ads are not treated as a single proven visual treatment.
- **Measure:** Historical date selection supports pre-2026 periods, subject to provider retention. Classification is versioned and preserves reviewed overrides. Raw spend, conversions and ratios remain unchanged.
- **Optimize:** Learning weights multiply context relevance, label confidence, metric completeness, version reliability and recency. Half-life is selectable and anchored to the report end date. Legacy campaigns use the same rules as new campaigns. Insufficient or incomparable evidence does not produce a winning-treatment claim. Supported cohorts lead to a keep/reference and test hypothesis that opens a prefilled Create draft with source references.

Meta Ads is the supported performance adapter. Other providers remain explicitly unsupported. Recommendations do not execute campaigns or change spending. A new test requires the normal creative and publishing review.

## Release checks

Type checking, focused unit/UI tests, integration tests and the existing production build/browser regression gates must pass for the exact release commit. Deploy the existing Render web service first, wait for health and connection draining, then deploy the worker and verify both commit IDs. Automatic deployment requires the existing GitHub `RENDER_API_KEY` secret; when absent use the authorized Render connector and record that automation remains unconfigured.
