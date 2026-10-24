# Original-product overlay investigation (2026-10-24)

This patch corrects status reporting and records future resolution failures. It is **not a complete high-resolution source repair** and must not be announced as one.

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

Full repair still requires identifying the screenshot's saved layer, verifying an adequate-resolution **same-product, same-view** original, then providing a revision-checked explicit replacement/new-version flow. Gallery photos can depict another chassis/configuration or angle; do not silently substitute one, upscale to claim recovered detail, or run paid generation to fill this evidence gap. A 700-pixel gallery canvas alone does not guarantee its cropped product is wide enough for a 525-pixel placement.
