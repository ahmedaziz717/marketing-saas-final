# Brand Kit and catalog media refinements

Brand Kit completion prepares cached, semantic creative/copy/visual instructions. General system instructions remain intact; manual overrides and intentional restores are preserved. Existing kits refresh explicitly. Revisions retain kit/template provenance. Reading a form does not trigger a model call.

The overlay editor reads its immutable background through the existing authorized creative query. Failed previews prevent saving. Automatic composition refuses to enlarge decoded product pixels; manual enlargement needs explicit acknowledgment. The original generated design remains available when automatic finishing cannot use the source safely.

## Catalog image contract

A source can supply stable system, base-component and optional-component groups. Each view declares explicit same-view resolution candidates. Import checks actual bytes, dimensions, aspect ratio and transparency, and stores the chosen original bytes. BigCommerce uses its documented standard/zoom candidates; Shopify and WooCommerce retain their source URLs without invented transforms. Arbitrary APIs use source-scoped field rules and optional same-origin detail requests. No CLX rule is hard-coded in the core.

Gallery counts never become guessed URLs. Shared media retains all group relationships. Existing image IDs survive upgrades. Removed/ineligible source views remain stored but cannot become automatic selections. Catalog details and Studio/video selectors show groups, incomplete galleries and measured resolution. Optional component imagery is identified as an alternate look, not proof of the exact configured SKU. Previous unclassified imports remain visibly identified as previously imported photos.

Requests are sequential within a page, with same-page detail reuse and existing import checkpoints. Transient image failures retain bounded retries. Repeated imports reuse measured candidates with no unavailable variants; incomplete candidates can be retried. This does not imply provider rate limits or pricing have been established.

## Migration and release boundary

Apply additive `0022_catalog_media_groups.sql` before application code. It adds nullable JSON columns to existing private tables, without grants, data rewrites or destructive changes. Migration 0021 belongs to the separately merged PR95 authoring release (9e6d691). This branch includes that release baseline; the media journal and snapshot were regenerated after its authoring schema. Both migrations remain in order. Run database-backed CI on this integrated head before releasing PR99.

## External input still required

The Cybertron configure endpoint supplies system/chassis identities, eligible upgrades and gallery counts, but the canonical full-gallery URL resolver and highest-resolution variants are not documented in the available evidence. The generic implementation is ready for explicit URLs; complete real CLX galleries cannot be claimed or populated until the provider supplies that mapping. Verified 600-pixel images are not claimed to be originals. No production resync, source configuration change, paid generation or production prompt edit was performed.

## Validation

Regression coverage includes original-byte selection, alpha/aspect compatibility, transient failures, duplicate relationships, stable IDs, tenant isolation, stale option eligibility, same-origin detail fetches, Brand Kit revision preservation, overlay fallback and responsive grouped selectors. Hosted CI must pass on the final integrated head. Local full-suite database-environment failures are recorded separately from regressions.
