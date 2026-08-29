# Product Extraction Audit — Bambu Lab

## Source evidence

- Official company site: https://bambulab.com/en-us
- Official US store: https://us.store.bambulab.com/all-products
- Official printer comparison and specification source: https://bambulab.com/en-us/compare
- Official store sitemap index: https://us.store.bambulab.com/sitemap.xml
- Official Shopify product sitemap: https://us.store.bambulab.com/sitemap_products_1.xml
- Representative product pages:
  - https://us.store.bambulab.com/products/a1
  - https://us.store.bambulab.com/products/h2d

## Verified findings

The user’s latest product-only crawl (`job 180001`) processed 100 pages but stored no products. Database evidence showed 89 collection paths, zero `/products/...` detail paths, and zero deterministic product candidates. The failure therefore occurred before GPT extraction: the saved job had been discovered under the previous URL ordering and exhausted its page ceiling on collections.

The current discovery implementation was re-run against `https://bambulab.com/en-us` and returned 99 product-detail URLs plus the company homepage in its first 100 URLs, with zero collection URLs. The live Shopify product sitemap contains a broad catalog spanning printers, AMS systems, filaments, accessories, spare parts, materials, and other purchasable items. Representative product pages expose names, prices, variants, images, product features, add-to-cart controls, and specification tables.

## Remaining product-model issue

A complete catalog must not rely on generic GPT summarization alone. Deterministic Shopify/product-page evidence should be parsed first, including product names, variants, SKU values, prices, availability, images, feature lists, and specification tables. Product family and variant relationships should be represented explicitly rather than flattened into unrelated generic records. A fresh crawl must use the corrected discovery ordering; old persisted collection-only crawl jobs cannot be reinterpreted into product detail pages.

## Corrected extraction result

The importer now recognizes both Schema.org `Product` and `ProductGroup` JSON-LD, reads variant offers, SKU values, availability, images, feature lists, and specification tables before GPT enrichment, and falls back to Open Graph commerce metadata only when structured product data is absent. Product sitemap entries are ranked so brand-named flagship families and concise model URLs enter bounded scans before low-level spare-part overflow. GPT-5.5 is used only for missing enrichment; it no longer replaces authoritative structured commerce facts.

Two repaired product-only scans were merged into the affected organization with canonical URL and SKU deduplication. The resulting catalog contains **125 unique pending products**, each with a stored image, positive prices for every priced item, and non-empty specifications. It includes **20 3D printers**, **21 material systems**, **47 filaments and materials**, **31 accessories and parts**, and **6 other products**. Representative families now include Bambu Lab A1, A1 mini, P1S, P2S, H2D, H2D Pro, H2S, H2C, X2D, and A2L. Sixty-seven records include multiple source variants captured within the product family. No duplicate canonical product URLs or non-positive prices remained after normalization.

The catalog model now stores explicit `family`, `standalone`, `accessory`, `material`, `software`, `service`, and `bundle` record types. First-class variant rows preserve source variant names, SKUs, positive prices, currencies, availability, images, source URLs, and high-confidence metadata. The repaired Bambu workspace contains **517 variant rows** across 125 products; 25 records are modeled as product families. Product deletion removes variant dependencies transactionally with images and campaign-brief references.

The repository retains `scripts/validate-live-product-extraction.mts` as a repeatable, opt-in real-site regression harness. Running `pnpm exec tsx scripts/validate-live-product-extraction.mts` checks flagship product discovery, canonical URL identity, deterministic ProductGroup parsing, first-class variants, specifications, imagery, and family classification against the source storefront without making it part of the default network-independent test suite.
