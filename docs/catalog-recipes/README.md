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

The existing image-repair queue is source-wide, not a single-product pilot. Do
not describe it as a one-product operation. Before using it, report the exact
source, product count, expected detail requests and media/storage scope for
approval. A smaller pilot requires a separately bounded execution path. Use the
image-repair mode to preserve product facts and approval state; never change
approval status merely to make imported photos visible.
