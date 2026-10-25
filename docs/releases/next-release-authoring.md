# Next release: category mapping, authoring context and gallery selection

Base: c6440dc (release includes MCP PR104). Branch: codex/next-release-authoring.
No deployment, production personalization, category assignment, Google publication,
or account permissions are part of implementation QA.

## Work order and acceptance gates

1. Google Ads validation: remove unsupported GAQL ordering; canonicalize evidence
   locally; retain sanitized provider codes/request IDs; independently test new
   campaign compilation and existing asset-group changes. No Google asset upload
   before validateOnly. Distinguish read preparation errors from mutation errors.
2. Category mapping and category-aware copy: workspace-owned marketing categories,
   source-scoped many-code mappings confirmed by users, per-product override,
   provenance and unmapped handling. Preserve raw category and manual edits through
   sync. One resolved context for image/copy/video/PMax, with explicit mixed or
   unclassified handling. Gaming/Workstation are fixtures, not SaaS rules.
3. Brand Kit/prompt controls: compact context and actual resolved prompts; session
   edits versus explicit shared saves; immutable generic V0 and first personalized
   V1 restoration; safe preparation for existing kits preserving active manual
   prompts/drafts. Fix video theme display/resolver disagreement.
4. PMax AI copy drafts: metered existing model infrastructure, prompt library and
   category context, schema counts/length validation, preserve edits, readable
   field errors and missing asset navigation; no publication in generation.
5. Gallery: consistent preview plus compact scrolling Hero/2/3 strip, separate
   focus and selection, explicit lightbox, touch/keyboard/mobile, compact group
   selector. Bounded image multi-selection with explicit output semantics. Preserve
   source identity, optional-component eligibility, full-resolution generation,
   and the approved product overlay stretching/background behavior.

## Checks

Tenant isolation; revision conflicts; manual edits through sync and prompt saves;
mixed/unmapped category choices; source mapping review; deterministic context across
all four consumers; mocked models and no provider calls in previews; Google
create/update operations and redacted errors; gallery mobile/keyboard selection
and original-resolution payloads; overlay regression. Run full CI on final head.

## First diagnostic checkpoint

The actual browser draft is revision 1, asset_group_assets, account 9395041996,
campaign 24287762548, group 6751268279, adding creative:86 as MARKETING_IMAGE.
prepare() orders asset_group_asset.resource_name, which Google's v26 field
reference declares Sortable=False. This fails before asset preparation/mutate;
googleJson previously collapsed general GAQL errors into a connection error.
The existing log session had no selected Render workspace, so the historical
provider request ID/code is unverified. No claim of an OAuth/account failure.

The create path does not issue that group query and is independently covered;
live creation success is not inferred from reports or local mocks.
