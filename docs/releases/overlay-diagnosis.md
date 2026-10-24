# Original-product overlay investigation (2026-10-24)

This patch adds explicit source recovery, preserves confident automatic alignment after a resolution failure, corrects status reporting, and supplies a verified kit-gallery import recipe. Production catalog import and saved-creative recovery have not been performed.

## Read-only live evidence

Inspected the user's Chrome Studio tab in CLXGaming without generation, paid alignment, saving, approval, publication, or catalog changes. Returned to Current setup / Preview. Theme and instructions were unchanged.

- Current selected source: `https://app.evokeloop.com/media/organizations/3/products/712/import_aa6ce4e7-a61f-46b0-bb32-f7bd191d30ab`, browser natural dimensions 260 × 260.
- Saved creative 84 (2026-10-24 15:58:53): complete design 1080 × 1080; saved transparent cutout preview 164 × 227. Default placement width 442, left 583, top 392. No applied overlay. Toggling comparison showed a visibly enlarged, misplaced second product. No alignment request was made.
- Saved creative 82 (2026-10-24 08:32:19): complete design 1080 × 1080; cutout 159 × 221, placed at width 470, left 516, top 228. Metadata says already applied, but the original is visibly enlarged. This predates PR99's enlargement guard.
- Preview generation uses `withoutEnlargement: true` with an 800-pixel cap, so these sub-800 natural dimensions are the saved cutout dimensions, not a preview downscale.

These observations do not establish the exact saved source of the supplied screenshot. Its Library OCR shows different placement (525/443/211); no hidden browser state or direct database reads were used to guess its identity.

## Screenshot transfer blocker

The supported Library materialization of `libfile_9ff5970d2a5881918617199a65612bf3` (1596 × 937 PNG, 996477 bytes) downloaded bytes but failed in the unchanged helper at `os.setxattr`: Windows Python has no such function. The destination `overlay-evidence/original-overlay.png` does not exist. Library read exposed OCR and an asset pointer, not locally readable pixels. Live browser pixels were inspected instead; the exact supplied screenshot remains unverified. No storage URL was invented and no helper metadata checks were bypassed.

## Root cause and PR99 boundary

`productOverlay` loads each saved layer's immutable sourceKey and checks its saved SHA256. Catalog imports do not substitute new images into old creatives. Cropping transparency reduces the usable product resolution below the original 260-pixel canvas.

PR99 repaired background preview delivery, preserved imported image resolutions/candidate relationships, and added an enlargement guard and explicit manual acceptance. It did not upgrade persisted overlay sources or backfill placements. Automatic finishing was already attempted during generation. Its catch discarded all failures, including newly rejected upscales, then stored only `needs_adjustment`. Therefore old metadata cannot establish whether a particular automatic attempt failed on resolution, angle, geometry, provider response, or storage.

The contradictory UI used saved `applied` for its banner and a separate unsaved paid-alignment response for “Suggested placement is ready.” Reset cleared coordinates but left stale success text, comparison state and enlargement acceptance.

## Patch and remaining work

The editor now distinguishes unsaved placement from saved status, shows measured saved cutout dimensions, explains that catalog updates do not replace this source, and resets preview/acceptance/status together. A new suggestion invalidates prior enlargement acceptance. Future generation records a bounded failure category, distinguishing measured resolution rejection from other unavailable alignment. No raw provider errors are persisted, no read path runs alignment, and no legacy source or placement is mutated.

## Verified larger source and recovery implementation

Read-only database lookup confirms product 712 is SKU TGMHORRTU4B03BM, external ID gmhorrtu4b03bm. It has one catalog image (732), the exact sourceKey used by creative 84. The published thumbnail SHA256 matches the saved layer: `2b59ce9a7d786290ef20280167585f5be61f4fda18b671117c9213938ff0bf70`. Therefore the 164 × 227 result is alpha-bounds cropping of the original 260 × 260 source, not an application downsample.

The correct public page is https://www.clxgaming.com/pre-built-gaming-pc/gmhorrtu4b03bm (the custom-configurator route was the wrong page type). Its actual gallery and enlarged viewer link six 700 × 700 PNGs under `https://static.cybertron.com/clx/kits/gmhorrtu4b03bm/gallery/1.png` through `6.png`, with separate `/thumbnail/` paths. Image 1 visually matches the thumbnail's view and details. Measured alpha bounds are **480 × 666**, SHA256 `d3fef5ccbba5099d88b6bd6c50c1f72c9fa058da8023400baad3ed88906cb9e3`. It is adequate at 442px width, but not 525px without enlargement. No larger source is exposed by the inspected enlarged viewer. This is not proof that no larger master exists elsewhere.

The API's `components/cas-pha-nv5bkac/large.png` is 600 × 600 but depicts different internal components (including a Radeon GPU), so it must not replace this kit photo. Product 724's component-gallery pilot is unrelated.

`clx-kit-gallery.json` is a reviewed mapping recipe, not an applied production change. It uses the root kit code/count, preserving six separate view identities. The explicit `firstImageResolutionPaths` alias links `metadata.images.main` only to frame 1, whose same-view identity was inspected for product 712; other angles are never resolution candidates. This lets the existing importer select the larger bytes while retaining the primary catalog image ID used by draft setups. The alias is optional and changes no existing source configurations. Do not apply it broadly to other kits without checking their first-frame relationship. Authorized bounded import/review for product 712 remains a deployment/setup step.

The editor can now preview an explicitly confirmed same-view replacement from the saved layer's product catalog or an approved uploaded product source. Reads perform no model call or upload. Both preview and save recheck tenant scope, source revision, approval/eligibility, source SHA, transparent cutout, higher resolution and matching proportions. Catalog lookup is bound to that layer's product ID, not any product in the workspace. Save forbids upscaling replacements, checks revisions/bytes again inside the organization transaction, creates a new pending creative with parent linkage and an audit event, and leaves the old creative/background/source unchanged. Aspect checks do not prove identity; the user must visually confirm the exact configuration/view.

Future automatic finishing still runs inside the authorized generation action. Successful eligible matches composite automatically. A confident placement rejected only for source resolution now retains its matched coordinates in metadata, allowing a sharper source to reuse them without another model call. Legacy `needs_adjustment` variants have no trustworthy saved match: their arbitrary fallback coordinates cannot be silently promoted into automatic placement. They require reviewed manual positioning or an explicitly requested metered alignment. Existing unapplied suggestions from an old browser session are not recoverable from the database.
