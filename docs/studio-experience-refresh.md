# Studio experience refresh — approved batch, 18 October 2026

The approved desktop and mobile concepts guide this release. One shared journey now serves Creative, Activation, Insights, Optimization, and published workflow Apps (including the workflow editor's App preview).

## Interaction contract

- Desktop uses a sticky, roomy category rail beside the choices, with current values, viewed status, icons, and overflow arrows.
- Mobile starts with a two-column overview. Opening a category shows a focused editor, with All categories and previous/next navigation.
- Inputs stay mounted when switching between mobile overview and editor. Responsive changes do not discard drafts or in-progress copy suggestions.
- Section navigation is immediate. An optional inline review of unviewed choices opens only when requested; no discovery popup interrupts the flow. Exploration never implies validity or approval and never gates generation.
- Missing required fields are labeled Not set and are not described as valid defaults. Existing validation and execution/approval gates remain authoritative.
- Desktop preview and summary are expanded by default and collapsible, with comfortable heights that adapt to the available screen height. Active creative generation/results open the preview. One sticky Generate action displays the creative's credit estimate.
- Keyboard focus, disabled choices, reduced motion, safe-area padding, and dark theme are covered by the shared controls.

## Route and form audit

| Entry                                                                         | Current experience                                                                                                                 |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Create / Image creator and `/app/creatives/images`                            | Creative Studio, image mode; query context retained                                                                                |
| `/app/creatives/studio` and `/app/creatives/configurator`                     | Shared image/video Creative Studio                                                                                                 |
| `/app/creatives/video`                                                        | Creative Studio, video mode                                                                                                        |
| Old `/app/creatives/ugc` links                                                | Existing compatibility redirect preserves the UGC flag and query context                                                           |
| Old social/ad creation links                                                  | Existing Activation Studio compatibility path retains publication, account, asset, plan, and schedule context                      |
| `/app/advertising/meta/legacy`                                                | Redirect to the current Meta workspace; legacy connection/publishing form is no longer exposed                                     |
| Published workflow Apps and App previews                                      | Shared studio journey; existing field controls, locked defaults, visibility rules, estimates, and exact-version execution retained |
| Insights and Optimization                                                     | Shared journey with current category values; existing saved report/plan, execution, results, and experiment behavior retained      |
| Apps libraries, workflow canvas/library, dashboards, Brand, Catalog, settings | Shared workspace palette, surfaces, spacing, inputs, navigation and cards; chart/status semantics retained                         |

The old CreativeBuilder and VideoStudio components are retained for compatibility tests, not exposed by production creation routes. Brand/account administration and workflow graph authoring remain purpose-specific controls within the shared visual system.

## Typography

Preserve font remains off by default. Choosing Automatic clears the lock. Enabling it from a brand default saves one explicit family. The full saved/queued setup retains both fields. An enabled font lock explicitly overrides conflicting theme, brand-font, and master-composition typography while retaining composition, lighting, imagery, effects, product markings, and original logos. Known distinctive fonts include descriptive letterform guidance. AI image rendering can still vary; the interface states that generated lettering needs review. This is not deterministic vector typesetting.

Font previews load independently as they enter view. Loading/failure is visible instead of silently presenting the same fallback as every family. Private custom font names and campaign copy are never sent to the public font service.

## Follow-up releases

Brand voice now supports 30,000 characters and reviewable PDF imports. Official partner logos, visual selection tiles, and the sticky category rail shipped in PRs #63–64; model portrait proportions were corrected in #65. Issue #61 is the release agenda.

## Saved-state and legacy UI audit — 18 October 2026

The live route audit found remaining old presentation in state branches and portaled dialogs, rather than a second set of studio routes:

- Activation Studio's saved, failed, uncertain, processing, queued, and published states now share the Calendar review layout: clear state card, explicit next actions, destination/timing, expanded creative preview, optional copy details, and a dated activity timeline. The original provider response remains visible.
- Activation entry/review section navigation now uses separated lavender tiles, with every section above the panel on mobile. Read-only delivery records omit inactive editor steps, bringing status and recovery higher in the mobile view. Drafts stay mounted when resizing or switching sections.
- Workspace Dialog, AlertDialog, Sheet and Drawer portals receive the same palette as the workspace. Default action buttons use the violet accent; destructive/status semantics remain distinct. Public marketing styling is unchanged.
- Campaign-plan, Catalog, website-import and compatibility creative dialogs use the same title scale. Workspace onboarding, invitation and access recovery headings no longer use the old oversized editorial treatment.
- Creation routes and their compatibility redirects remain as listed above. Brand management, report tables, calendar scheduling and workflow graph authoring retain controls appropriate to their task. The unused LegacyPublishingPage had no production route or imports and has been removed.

Approval roles, revision checks, explicit delivery confirmations, uncertain-delivery reconciliation, and retry-safe checks remain authoritative. Opening a result does not publish or retry anything. Desktop/mobile browser fixtures cover failed, uncertain, completed, processing and queued delivery, in addition to the existing Calendar approval flows; failure recovery is checked above the fold at desktop/laptop sizes.

Recommended next work: preserve safe, actionable provider error details and validate known destination/asset/campaign requirements before submission. The screenshot's generic Meta “Invalid parameter” does not identify a cause; diagnosing it is separate from this visual cleanup. The existing database connection-headroom/deployment-sequencing follow-up remains queued in issue #61.

## Studio height refinement — 18 October 2026

The desktop preview, section navigation and choice artwork regain breathing room. Section tiles show their subtitles and viewed indicators instead of a single compressed line. Preview and artwork heights adapt to the viewport, keeping the first choice card above the sticky action bar on shorter laptops. Square model portraits retain their natural proportions. The mobile overview/focused-editor structure and sticky category rail remain shared across all four studios.

## Larger tile refinement — 18 October 2026

The follow-up request makes the desktop height increase more substantial: 112px section tiles, 96px category tiles, and large preview/gallery image areas. Gallery tiles also gain width so the artwork keeps useful proportions. The initial expanded preview can occupy more of the page; choosing a category automatically brings the actual choice card above the sticky action bar when needed. The rail uses the space at its sticky position rather than shrinking to fit below the expanded preview. Mobile keeps its existing focused editor, and model portraits stay square. Browser checks cover both the initial gallery entrance and full-tile visibility after navigation.
