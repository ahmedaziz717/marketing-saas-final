# Standalone catalog components follow-on

Stacked on PR105 head 950cabb, isolated in codex/catalog-components. Migration
0026 follows category/default migrations 0024/0025. No production writes or source
refresh has been performed. This does not alter PR105 or MCP activation.

## Behavior

Source-scoped gallery components become ordinary pending accessory catalog products,
with exact component code, explicit type, original image rows, and compatibility
relationships. Shared codes in the same source reuse one card across systems;
printed variants with distinct codes stay distinct. Parent specifications, prices,
category mappings and approvals are never inherited. Component-only identity is
included in the shared image/copy/video/PMax facts even if the display label changes.

In Catalog, use Separate component cards > Review separate component cards.
The review lists component identities and verified originals. Explicit creation is
role-gated, snapshot-fenced, audited and transactionally serialized. Repeated
requests reuse products/images/relationships. Parent media and existing generation
selections are untouched. New component cards require ordinary catalog review
before generation. No standalone landing page or sale price is fabricated.

Once separately represented, matching nested galleries/options are hidden only in
the catalog presentation. Compact compatibility links replace duplicate nested
cards; ordinary system galleries remain. Relationships whose source group changes
are not presented as current compatibility until reviewed again. No automatic
production conversion is enabled.

## Source setup and bounded limits

Gallery imports now preserve component.sourceCode from the configured idPath for
non-system groups. Set componentKind in a source mediaGroupRule (for example,
Chassis); missing types remain generic Component. Configure optionAmountPath if
needed. Raw price is retained as an unknown source option amount by default;
optionAmountMeaning: upgrade_delta must be explicitly configured only when its
meaning has been verified. These amounts belong to parent relationships, never the
component's standalone price. No global vendor-specific rules are added.

Old imported groups lack exact component metadata: refresh their galleries using
the existing authorized source flow after release, then review conversion. Code
does not guess identities from group labels or CDN paths. Conversion requires
complete declared galleries and originals at least 600 x 600, reuses existing
full-resolution storage, and performs no download, upload, model call or upscale.
A review is bounded to 500 parent products in one source; larger sources need a
separate scoped conversion design. Manual component edits and existing image
selections are preserved on repeated conversion.

## Validation

In-memory database tests cover tenant/source isolation, missing/revoked membership,
stale snapshots, repeated/concurrent requests, shared component deduplication,
parent-specific amounts, no inherited system CPU/price, preserved original images,
manual labels, incomplete/thumbnail rejection and compatibility invalidation.
UI tests cover explicit review/create and collapsed compatibility details. The real
CatalogPage fixture includes a system and two component cards, inspected at desktop
and 375px: no duplicate nested gallery, component-only labels, intentional details,
no horizontal overflow. Synthetic SVG artwork is fixture-only, not a source photo.
Use the authoring fixture on localhost with page=catalog-components. The page is
also included in the Chrome matrix. Full CI must pass on the final head.

## Refresh reconciliation

Reviewed same-view repairs update URL, storage and measured metadata on the existing
component image row, preserving saved selection IDs. Removed logical views are
retired, not deleted; only current view IDs populate the active gallery. A removed
primary falls back to a current original. Returning views reactivate their existing
rows. Historical removed selections remain stored but must be reselected before
new generation; they are never silently replaced with another angle. Source-owned
kind/specifications/provenance and compatibility kind/role refresh together. Manual
labels/descriptions and unrelated specifications remain intact. No-op review retries
do not advance the component revision.
