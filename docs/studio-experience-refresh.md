# Studio experience refresh — approved batch, 18 October 2026

The approved desktop and mobile concepts guide this release. One shared journey now serves Creative, Activation, Insights, Optimization, and published workflow Apps (including the workflow editor's App preview).

## Interaction contract

- Desktop shows every category in a wrapping grid, with its actual current value and exploration status.
- Mobile starts with a two-column overview. Opening a category shows a focused editor, with All categories and previous/next navigation.
- Inputs stay mounted when switching between mobile overview and editor. Responsive changes do not discard drafts or in-progress copy suggestions.
- Leaving a section can show one dismissible reminder listing unseen current choices. Keeping them is separate from viewing them. Exploration never implies validity or approval and never gates generation.
- Missing required fields are labeled Not set and are not described as valid defaults. Existing validation and execution/approval gates remain authoritative.
- Preview and summary are compact and expandable. Active creative generation/results open the preview. One sticky Generate action displays the creative's credit estimate.
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

## Next batch — not implemented here

Ahmed explicitly deferred these after requesting them:

- Increase the Brand voice limit above 4,000 characters, with a counter and clear validation.
- Allow PDF brand guideline uploads with safe handling and a reviewable extraction before updating the Brand Kit.

- Use official Meta, Facebook, and other partner logos across selectors, Apps, and integrations. Keep the mark visible and recognizable; design cards and backgrounds around it.

Tracked in GitHub issue #61. Implement only after a separate execute instruction.
