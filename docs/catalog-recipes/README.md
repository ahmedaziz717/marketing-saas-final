# Source-scoped indexed galleries

`clx-chassis.json` is a mapping fragment, not a replacement for source credentials,
pagination, product mappings, or existing user settings. Merge it only into the
intended source after reviewing the source identity and current mapping revision.
The generic importer contains no provider-specific URL inference.

The recipe was verified on October 24, 2026 against the rendered gallery at
https://www.clxgaming.com/gaming-pc/gmhorus00011mk/configure and the documented
`GET /v1/products/kits/{code}?configure=true` detail response.

- Each component's own `metadata.gallery.size` supplies the count.
- Exact component codes, including `asm-` codes, supply the path segment.
- Indices start at one. Thumbnail URLs are never used for imported media.
- The sample has one base chassis and 19 eligible upgrade chassis: 183 distinct
  photos, all downloaded and decoded at 700 by 700 pixels. This is the largest
  verified website variant, not a claim that no larger original exists.
- The system-reference and base-component groups share the base photos without
  duplicating stored bytes. Optional chassis keep their individual identities.
- These are reference photographs. Actual system configuration may vary; an
  optional chassis photo is not evidence of the purchased system configuration.

Example verified URLs:

* https://static.cybertron.com/clx/components/cas-crs-3500cb/gallery/1.png
* https://static.cybertron.com/clx/components/cas-crs-3500mb/gallery/8.png
* https://static.cybertron.com/clx/components/asm-cas-nv5wsea/gallery/11.png

The committed fixture records only the observed component identities, eligibility,
and gallery metadata. CI uses generated pixels; local verification additionally
ran all 183 actual downloaded files through the same importer and rendered its
output in the actual gallery component with selection enabled.

## Production application

Code deployment alone does not update existing catalog images. No production
source settings or catalog records were changed during this verification.
Applying this fragment and importing its media requires an explicitly approved
source update and import. Check that no sync is already running first. Preserve
the existing authentication, pagination and product-field mappings.

Use **Catalog > Sources > Repair one product gallery** for the initial pilot.
Select the existing source product, paste the reviewed JSON recipe, and set the
detail response identity field (for this recipe, `code`). Preview performs one
same-origin detail request, validates the returned identity, and seals the exact
snapshot for 30 minutes. It writes no catalog records and fetches no images.
Confirmation queues that snapshot for the existing worker; no detail refetch or
full-source listing occurs. The recipe is retained with this source-owned pilot,
without changing the source-wide mapping or automatic sync settings.

The pilot accepts at most 250 distinct views / 500 candidate URLs. Batches contain
at most 12 views. Successful files are reused after interruption. Failed batches
stop for explicit Resume; unavailable photos are not silently marked complete.
The UI exposes checkpoint progress, planned groups, cached photos, existing image
references, and a retry-inclusive fetch bound. HTTP redirects can add requests
within the existing four-redirect limit. No approval states, product facts,
existing primary photos, or unrelated galleries are reset.

For the verified initial target: workspace CLXGaming (3), source1, product724,
external ID `gmhorus00011mk`: 183 distinct photos, 21 logical groups, 16 batches.
Expected successful execution is one preview detail request and 183 image fetches
(no list request); at most 549 image fetch attempts per pass including retries.
The original existing photo is retained. Actual source contents must be rechecked
at preview. This production action still requires explicit approval.

Do not substitute the older source-wide repair queue for this pilot. Further
products can be reviewed separately after the first result; full-catalog request
and storage bounds are not inferred from one sample.

A completed pilot restores the source lifecycle and job owner. Paused/error sources are never reactivated. If automatic work is overdue when a previously connected source finishes, the source is held paused and the UI requires an explicit source resume; automatic-sync flags and schedule timestamps are retained. This prevents completion from launching an incidental full-source import.
