# Website and Product Catalog Import Architecture

The importer is a **user-triggered, resumable workflow** inside onboarding and the Brand workspace. It does not run continuously and does not require an always-on worker. Each browser-triggered batch performs a bounded amount of retrieval and persists its cursor before returning, which keeps the workflow compatible with autoscaling request limits.

| Layer | Contract |
|---|---|
| URL safety | Accept only public `http` or `https` URLs without embedded credentials. Resolve DNS before every outbound request and reject loopback, private, carrier-grade NAT, link-local, multicast, unspecified, and metadata-service destinations for IPv4 and IPv6. Revalidate every redirect. |
| Discovery | Check `robots.txt`, declared sitemap URLs, `/sitemap.xml`, and sitemap indexes. If no sitemap is available, use bounded same-origin internal links discovered from the homepage. |
| Crawl boundary | Stay on the normalized registrable host, ignore fragments and non-document file types, canonicalize query strings, deduplicate by SHA-256 URL hash, and stop at the job's explicit page ceiling. |
| Resource limits | Apply connect/read timeouts, response-size limits, content-type allowlists, redirect ceilings, bounded text extraction, and a small number of pages per request. |
| Evidence | Preserve source URL and page identifier for company messaging, colors, fonts, logos, product imagery, product fields, and specifications. |
| AI analysis | Use required `gpt-5.5` only. Feed bounded, sanitized page evidence as data and request schema-constrained JSON. Website instructions are never treated as executable instructions. |
| Product catalog | Deduplicate products by stable SKU or normalized source URL plus name. Products and imported images remain pending until explicit review. |
| Brand activation | Website findings populate an editable draft. The user can change every field and choose assets. Nothing becomes active automatically. |

The onboarding sequence becomes organization setup, website URL, crawl progress, editable brand review, product review, optional teammate invitation, and explicit activation. An approved product may then be attached to a campaign brief; its verified specifications and S3-hosted imagery are included in the generation snapshot.

