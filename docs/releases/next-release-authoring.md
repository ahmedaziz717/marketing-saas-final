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

## Integrated candidate and local QA

- Gallery commits 9018702/d21a11a and Google/PMax d3269d7 are integrated without
  duplicating their shared contract parent. Draft PR: #105.
- Additive migrations 0024/0025 create workspace category settings and immutable
  initial brand prompt values. No production category or prompt data is seeded.
  Personalization remains an explicit metered action and preserves manual active
  revisions. Restoring V0/V1 in Studio is a session edit until explicitly saved.
- Studio enforces an explicit neutral choice for unmapped/mixed subjects before
  provider calls. Shared workflow/App media resolution continues to accept old
  forms while carrying authoritative category facts; no App version migration.
- Image multi-select supports up to four views per product, twelve views total;
  separate mode produces each selected view for each format. Together mode keeps
  one view per product. Display thumbnails never replace source image IDs/URLs.
- The combined local gallery fixture was inspected at desktop and narrow width:
  preview changes did not change selection; optional-group selection retained the
  earlier image; incomplete source galleries stayed explicit; lightbox used the
  original image. Touch swipe is automated event-test coverage, not device QA.
- Actual category/prompt components were inspected at 375px with synthetic data:
  no horizontal overflow, explicit unmapped choice, compact disclosures, session
  editing and V0 restore. Fixtures make no real provider or production saves.
- Initial combined CI b6596b7 passed migrations/TypeScript, then reported 28 failed,
  1694 passed and one skipped test. Failures exposed the shared App media gate
  above plus outdated UI mocks/selectors and a route allowlist. Those failures
  were corrected and the affected suites rerun locally. Final exact-head full CI
  remains the release gate, including production build and Chrome checks.

Run the standalone gallery fixture with `vite --config
client/src/components/__fixtures__/vite.gallery.config.ts`. For actual shared
workspace components, use `vite --config
client/src/components/__fixtures__/vite.authoring.config.ts` and open
`/client/src/components/__fixtures__/authoring-context.html?page=authoring-context`.
The `catalog-gallery` page exercises grouped selection. Both fixtures are local
only and have no production credentials.

No Google publication/upload or paid generation has been tested against production.
The fresh automatic overlay/edit/reset report remains separate and unverified;
the previously user-approved product stretching/background controls are unchanged.
