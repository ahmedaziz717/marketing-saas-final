# Catalog sources and services

Catalog has Products, Services, and Sources tabs. Integrations uses the same source records; connections are not duplicated. Owner/admin can connect, sync, pause, disconnect, and scan. Creators can add/edit entries; existing reviewer rules govern approval.

## Website scan

New scans discover sitemap indexes in durable steps, then fetch and analyze small batches in the existing background worker. Closing the browser does not stop the scan. The UI polls saved state and shows discovery, pages read, analysis progress, errors, pause/resume, and failed-page retry. Existing legacy scans upgrade to background discovery when resumed.

No 250-page pass boundary remains. A 100,000-page / 5,000-sitemap operational safety limit fails explicitly rather than claiming completion. Public network restrictions, same-site redirects, size limits, and request deadlines remain enforced. Missing/oversized sitemaps are visible as coverage warnings. Hidden, authenticated, blocked, or dynamically undiscoverable items cannot be guaranteed by website scanning. Website extraction remains product-focused; services can be added manually or with CSV.

## Store connections

Shopify uses the versioned GraphQL Admin API; BigCommerce and WooCommerce use their catalog REST APIs. Product and variant pagination is supported. Connections verify read access before storing credentials. Imports are paged, checkpointed, retryable, and idempotent by external identity, with URL matching for previously scanned items. Changed facts return to pending review. Source credentials are never returned by list APIs or audit payloads. HTTPS, DNS/IP validation and pinned requests prevent private-network access and credentialed redirects are not followed.

Set the SAME random `CATALOG_TOKEN_ENCRYPTION_SECRET` on web and worker before connecting stores. This is separate from existing auth/Meta secrets. Do not rotate it without re-encrypting or reconnecting sources. Store credentials are entered only in the authenticated connection form. Shopify needs a valid Admin API token with read_products; BigCommerce needs catalog/store-information read access; WooCommerce needs read access for products, variations and currency settings. App installation/OAuth distribution is not yet implemented; this release uses merchant-provided read-only API credentials.

Automatic synchronization runs every six hours, with manual sync and pause/resume. This is scheduled polling, not webhooks. It refreshes catalog items but does not delete products missing from later provider responses. Inventory writeback, orders, checkout, sending emails, ad publishing, and appointment scheduling are outside this change. Provider account access has to be verified with each merchant's real credentials; fixture tests alone do not certify a merchant connection.

## Services and CSV

Service entries support fixed/starting-at/hourly/recurring/quote pricing, duration, service area, delivery, packages, and preferred CTA. The existing Creative Builder accepts approved services without a product image and includes their service facts in the generation prompt. No model identity is added to customer-facing labels.

CSV accepts quoted cells, embedded newlines, and BOM/CRLF. Required headers: `name,productUrl`. Optional: `recordType,description,sku,category,price,currency,imageUrl,pricing,duration,area,delivery,packages,cta`. Use service or standalone for recordType. Imports show per-row errors and progress; keep the tab open during CSV submission. Images are copied into private storage.

Wix, Squarespace, Square, Adobe Commerce, PrestaShop, and booking providers remain explicitly planned, not falsely connected.

## Deployment

Apply the additive Drizzle migration through the normal web deployment before deploying the updated worker. Existing creative-worker enablement remains unchanged; catalog and creative processing use independent loops in the same paid worker. Run CI with an isolated PostgreSQL database. Never run the integration suite against staging tenant data.
