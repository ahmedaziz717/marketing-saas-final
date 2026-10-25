# Shared Studio, App and Workflow elements

Product identity is a product ID, not an individual photo. Render one product card with its gallery through `CatalogGallery`; use `ProductPhotoGroups` for keyed video references. Keep image IDs and `product_image:<id>` keys stable when adapting old saved forms. Previewing a photo must not select it or submit a run. Full-resolution source references remain distinct from browsing thumbnails.

Keep system photos together, including legacy primary photos without gallery metadata. Component and optional-component galleries retain their identity, eligibility and provenance; never silently substitute them as the configured system. Missing imported images must be explained as a data gap, not fabricated by the renderer.

Use `StudioChoicePicker` and `studioThemeChoices` for Theme choices. Preserve manual direction and saved IDs, including unavailable legacy selections. Do not create per-App copies of these contracts.

Changes to any shared element need tests for old saved values, explicit selection versus preview, unavailable references, desktop/mobile layout and image/video semantics. Source recipe saves and bounded gallery imports are separate reviewed actions; neither a UI release nor a preview authorizes a production backfill.

This is an implementation guide for focused engineering work, not a new autonomous agent system. MCP capability work remains isolated from presentation and catalog repair work.
