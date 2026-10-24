# Unified channel configurator and workflow capabilities

Google Ads now opens inside Activation Studio. The shared framework owns the preview, navigation, category rail and focused mobile editor. Google retains its native change schema, account boundary, campaign hierarchy, validation and publication path. Existing Google bookmarks redirect to the unified Studio with account and asset query parameters preserved. Google and Meta drafts stay mounted independently when switching channels.

## Capability parity

| Campaign or operation              | Native controls retained                                                                                                               | Location                                                      |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Search                             | Supported bids and targets, schedule, keywords and match types, negative keywords, network options, responsive text, display paths     | Destination, Creative, Copy, Delivery, Review & activate      |
| Performance Max                    | Asset group content, brand requirements, image and video associations, URL expansion, optional Merchant Center feed, supported bidding | Same framework, with asset groups rather than Meta ad sets    |
| Display                            | Responsive ad copy, long headline, business name, image placements and supported bids                                                  | Native fields within Creative, Copy and Delivery              |
| Shopping                           | Merchant account/feed label, feed-supplied images and text, supported bids                                                             | Copy explains the feed source; no invented standalone ad copy |
| Demand Gen                         | Audience selection, supported inventory surfaces, native text/image requirements and bids                                              | Native Creative, Copy and Delivery controls                   |
| App installs                       | Store and app ID, text/media assets and supported bids                                                                                 | Native campaign options and creative controls                 |
| Existing campaign/ad/group changes | Existing campaign discovery, ad groups and ads, Performance Max groups, association replacement/unlinking, saved revisions             | Destination → Campaign, then the appropriate native editor    |
| Publish                            | Exact reviewed change, Google validation, revision/review hash, explicit confirmation, authorized role and live-delivery flag          | Review & activate                                             |

Inactive campaigns remain off by default. Account selection is explicit; an unavailable deep-linked account cannot silently switch to another account. Merely visiting a channel or changing a category does not save or publish anything.

Advanced Google capabilities remain tracked in #83, including conversion-goal setup, product subdivision, audience creation, video-specific campaign creation and specialized budget/settings support. This release preserves supported capabilities; it does not claim every Google Ads option is available.

## Workflows and Apps

- Channel metadata now controls discovery in the step picker. A connected Google account reveals **Fetch Google Ads history**, **Google Ads performance**, and **Google campaigns & assets**, plus the shared classification/analysis steps in relevant sections. History reuses the existing resumable Google ingestion implementation.
- Google performance steps support account/campaign selection, dates, previous-period baselines, native breakdowns and an explicit inactive opt-in. Currency, time zone, attribution, missing values and incomplete evidence remain in the output.
- Inventory preserves Google campaigns, ad groups/ads and Performance Max asset groups/associations. Google account fields can be exposed in an App and wired to the Google account port. The server rechecks workspace, provider and connected status. These newly surfaced steps read data; Google ad mutations still use the reviewed Activation Studio path.
- Connecting lines can be selected by pointer or keyboard and removed with **Delete connection**, Delete or Backspace. Undo/redo restores the graph without deleting its nodes. Removal reports any newly missing required input using the existing run validation. Keyboard shortcuts ignore typing, dialogs and controls outside the editor.
- Published Apps show persisted output at the top left of the shared preview/summary. Images preserve aspect ratio and can be enlarged; videos retain controls; multiple outputs can be browsed. Review & run and Results retain full details, progress and run history. On phones, the summary remains available from the category overview, matching the focused Studio pattern.

## Verification

Targeted tests cover all six creation families, account selection, legacy links, independent channel drafts, selected-line deletion/undo/keyboard behavior, Google connection-field resolution, tenant/provider boundaries, reporting defaults and native asset-group data. Actual-component Chrome checks cover Google inventory and new campaigns, shared channel cards, Meta activation and App preview positioning at desktop, laptop and phone sizes.

TypeScript and the production build pass locally. The broad local run reached 1,382 passing tests; seven database-dependent suites require the isolated PostgreSQL environment in CI. Two obsolete UI/mock assertions found by that run were corrected and passed on rerun. Full PostgreSQL-backed CI remains the merge gate, including migrations, tests, builds, smoke and browser checks.

## App form model selection

Added to this batch following Ahmed's App Form screenshot and clarification:

- **App form → New field type → Model selector → Add field**, also available under canvas **Fields**. Bind the field to a Generate image, Generate video or AI prompt writer step. It starts with the step's current model as its one allowed/default choice.
- Designers choose compatible allowed models, exactly one default, and each model's native settings. Users select exactly one allowed model per run. A single-option field shows the fixed model. Locked or hidden fields use the authored default.
- Published versions retain the allowlist, default and settings. The server rejects forged, unavailable and incompatible selections before queueing. Resolved provider routes and settings drive quotes and execution; model selection never becomes prompt text or a batch request. Nested Apps retain their model defaults instead of interpreting incoming content as a model selection.
- The existing AI prompt writer now has a fixed-model control as well. GPT-5.5 retains the existing default; GPT-5.4 Mini is offered only after account availability verification and pricing setup. Existing Admin model-availability sync also checks supported text models. Initial Mini rates use the official [model documentation](https://developers.openai.com/api/docs/models/gpt-5.4-mini), verified October 22, with the existing published-pricing refresh. No new transform node or provider credential is introduced.
- Tests cover designer curation, single selection, hidden/locked defaults, server rejection, published-version isolation, and selected image/text model quote/execution parity. Browser checks cover authoring and the published-form preview on desktop, laptop and phone.

A broader visual redesign remains pending concept selection.
