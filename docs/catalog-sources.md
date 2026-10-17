# Catalog sources and services

Catalog has Products, Services, and Sources tabs. Integrations uses the same source records; connections are not duplicated. Owner/admin can connect, sync, pause, disconnect, and scan. Creators can add/edit entries; existing reviewer rules govern approval.

## Website scan

New scans discover sitemap indexes in durable steps, then fetch and analyze small batches in the existing background worker. Closing the browser does not stop the scan. The UI polls saved state and shows discovery, pages read, analysis progress, errors, pause/resume, and failed-page retry. Existing legacy scans upgrade to background discovery when resumed.

No 250-page pass boundary remains. A 100,000-page / 5,000-sitemap operational safety limit fails explicitly rather than claiming completion. Public network restrictions, same-site redirects, size limits, and request deadlines remain enforced. Missing/oversized sitemaps are visible as coverage warnings. Hidden, authenticated, blocked, or dynamically undiscoverable items cannot be guaranteed by website scanning. Website extraction remains product-focused; services can be added manually or with CSV.

## Store connections

Shopify uses the versioned GraphQL Admin API; BigCommerce and WooCommerce use their catalog REST APIs. Product and variant pagination is supported. Connections verify read access before storing credentials. Imports are paged, checkpointed, retryable, and idempotent by external identity, with URL matching for previously scanned items. Changed facts return to pending review. Source credentials are never returned by list APIs or audit payloads. HTTPS, DNS/IP validation and pinned requests prevent private-network access and credentialed redirects are not followed.

Set the SAME random `CATALOG_TOKEN_ENCRYPTION_SECRET` on web and worker before connecting stores. This is separate from existing auth/Meta secrets. Do not rotate it without re-encrypting or reconnecting sources. Store credentials are entered only in the authenticated connection form. Shopify needs a valid Admin API token with read_products; BigCommerce needs catalog/store-information read access; WooCommerce needs read access for products, variations and currency settings. App installation/OAuth distribution is not yet implemented; this release uses merchant-provided read-only API credentials.

Automatic synchronization runs every six hours, with manual sync and pause/resume. This is scheduled polling, not webhooks. It refreshes catalog items but does not delete products missing from later provider responses. Inventory writeback, orders, checkout, sending emails, ad publishing, and appointment scheduling are outside this change. Provider account access has to be verified with each merchant's real credentials; fixture tests alone do not certify a merchant connection.

## Custom JSON API sources

Choose **API endpoint** in Catalog Sources or Integrations. Public feeds need no password. Basic username/password, bearer tokens and custom `X-*`/Authorization headers are supported. Credential values and the validated mapping are encrypted with the existing shared integration encryption secret; no additional catalog secret setup is required for this new provider. Existing store connectors retain their catalog-specific encryption key.

Only public HTTPS GET JSON endpoints are fetched. DNS is checked and pinned; redirects are rejected. URL credentials, common secret query parameters and routing/forwarding headers are rejected. Common product fields are inferred deterministically, with optional dot-path mappings. Every product must have a name and a landing-page URL; missing landing pages are not invented. Preview shows the first five entries and page count before connection. Next-page URLs must remain on the exact configured origin. Repeated pages fail explicitly; limits are 2,000 items per page, 200 pages per run and 6 MB per response. POST/GraphQL APIs and pagination that exposes only opaque cursor tokens need dedicated connectors.

Optional explanatory notes, pasted/uploaded screenshots and PDF/TXT/Markdown/JSON documents can suggest field mappings through the existing metered AI reader. The UI shows the AI credit estimate. Authentication fields are never included in that request. Response structure rather than product values is sent. Files are size/type checked, images re-encoded, PDFs sent as data without local execution, and no document content can change request URLs, authentication or run code. Instructions are untrusted evidence; only schema-validated paths are accepted and then checked against the actual feed. Raw instruction files are not persisted by EvokeLoop; mapping and notes are encrypted with the connection. Word files should be exported as PDF.

## Services and CSV

Service entries support fixed/starting-at/hourly/recurring/quote pricing, duration, service area, delivery, packages, and preferred CTA. The existing Creative Builder accepts approved services without a product image and includes their service facts in the generation prompt. No model identity is added to customer-facing labels.

CSV accepts quoted cells, embedded newlines, and BOM/CRLF. Required headers: `name,productUrl`. Optional: `recordType,description,sku,category,price,currency,imageUrl,pricing,duration,area,delivery,packages,cta`. Use service or standalone for recordType. Imports show per-row errors and progress; keep the tab open during CSV submission. Images are copied into private storage.

Wix, Squarespace, Square, Adobe Commerce, PrestaShop, and booking providers remain explicitly planned, not falsely connected.

## Deployment

Apply the additive Drizzle migration through the normal web deployment before deploying the updated worker. Existing creative-worker enablement remains unchanged; catalog and creative processing use independent loops in the same paid worker. Run CI with an isolated PostgreSQL database. Never run the integration suite against staging tenant data.

## Page URL in Creative Studio

Subject & sources has one **Page URL** entry with three choices: Product, Service and General promotion. Product previews use the existing catalog review and approval path. Service and General promotion read a public page without AI credits, let the user edit its title and description, and copy reviewed facts plus the final source URL into the creative brief. These promotions do not create catalog products. General promotion supports content such as quizzes, articles, resources and events. Image and video drafts retain this context and include it as facts, not instructions, in generation prompts. **Describe manually** remains the fallback for pages requiring sign-in, browser-only rendering or blocking automated access.

Website requests preserve path slashes and query order. Canonical URL identities are used only for deduplication; rewriting outgoing requests can create infinite redirects on sites that require trailing slashes. Every redirect is still public-IP checked and pinned, restricted to the source site, and bounded by the existing hop and response limits.
