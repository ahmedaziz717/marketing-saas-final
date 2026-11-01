# Brand Kit and catalog media refinements

Brand Kit completion prepares cached, semantic creative/copy/visual instructions. General system instructions remain intact; manual overrides and intentional restores are preserved. Existing kits refresh explicitly. Revisions retain kit/template provenance. Reading a form does not trigger a model call.

The overlay editor reads its immutable background through the existing authorized creative query. Failed previews prevent saving. Automatic composition refuses to enlarge decoded product pixels; manual enlargement needs explicit acknowledgment. The original generated design remains available when automatic finishing cannot use the source safely.

## Catalog image contract

A source can supply stable system, base-component and optional-component groups. Each view declares explicit same-view resolution candidates. Import checks actual bytes, dimensions, aspect ratio and transparency, and stores the chosen original bytes. BigCommerce uses its documented standard/zoom candidates; Shopify and WooCommerce retain their source URLs without invented transforms. Arbitrary APIs use source-scoped field rules and optional same-origin detail requests. No CLX rule is hard-coded in the core.

Gallery counts never become guessed URLs. Shared media retains all group relationships. Existing image IDs survive upgrades. Removed/ineligible source views remain stored but cannot become automatic selections. Catalog details and Studio/video selectors show groups, incomplete galleries and measured resolution. Optional component imagery is identified as an alternate look, not proof of the exact configured SKU. Previous unclassified imports remain visibly identified as previously imported photos.

Requests are sequential within a page, with same-page detail reuse and existing import checkpoints. Transient image failures retain bounded retries. Repeated imports reuse measured candidates with no unavailable variants; incomplete candidates can be retried. This does not imply provider rate limits or pricing have been established.

## Migration and release boundary

Apply additive `0022_catalog_media_groups.sql` before application code. It adds nullable JSON columns to existing private tables, without grants, data rewrites or destructive changes. Migration 0021 belongs to the separately merged PR95 authoring release (9e6d691). This branch includes that release baseline; the media journal and snapshot were regenerated after its authoring schema. Both migrations remain in order. Run database-backed CI on this integrated head before releasing PR99.

## Verified gallery recipe and production boundary

The canonical component gallery path is now verified from the rendered CLX website. The source-scoped recipe in `docs/catalog-recipes/clx-chassis.json` uses each exact component code and its own gallery count, including printed ASM chassis. The sample system's base and 19 eligible alternatives supply 183 distinct photos. All were fetched, decoded at 700 by 700 pixels, imported into an isolated database and rendered as selectable views by the actual gallery component. These are configuration-reference photos; no larger original has been established. Generic importer logic does not infer provider paths.

Existing production catalogs are unchanged. The recipe must be applied to the intended source and an image import approved before these photos appear in the user's catalog. A supported one-product preview/confirm path now stores the reviewed recipe and snapshot with the source, without changing its automatic mapping. The existing worker imports at most 12 views per batch with resumable checkpoints; successful photos are reused. Owner/admin checks, 30-minute encrypted preview expiry and stale source/product/image rejection protect confirmation. No production resync, source configuration change, paid generation or production prompt edit was performed.

## Validation

Regression coverage includes original-byte selection, alpha/aspect compatibility, transient failures, duplicate relationships, stable IDs, tenant isolation, stale option eligibility, same-origin detail fetches, Brand Kit revision preservation, overlay fallback and responsive grouped selectors. Hosted CI must pass on the final integrated head. Local full-suite database-environment failures are recorded separately from regressions.

## Task defaults and immutable restores

The central registry retains the original generic baseline (V0) and the first brand-personalized value (V1) independently of the paginated history. Later brand refreshes and edits do not replace either anchor. Central restoration appends a new revision; no intervening history is deleted. A prompt without a first brand-personalized revision has no V1 restore point. Existing manual overrides are never silently personalized.

Image base/theme instructions, image copy, video direction and asset/social copy forms resolve the same central entries. Per-run edits and restores are saved with the setup; only an explicit Save as workspace default changes shared state. Drafts are not overwritten when central defaults refresh. Runtime overrides replace only the editable task instructions, retain protected task contracts and record an override hash for provenance. Technical templates remain outside these task editors.

A completed pilot restores the source lifecycle and job owner. Paused/error sources are never reactivated. If automatic work is overdue when a previously connected source finishes, the source is held paused and the UI requires an explicit source resume; automatic-sync flags and schedule timestamps are retained. This prevents completion from launching an incidental full-source import.
