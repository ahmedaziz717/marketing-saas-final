# Studio and App field maintenance

The canvas and App form duplicated field creation and model binding, while the Google route contained its entire campaign editor. This release reduces those maintenance points without changing saved graph formats, published App contracts or native campaign behavior.

- `shared/workflowFieldAuthoring.ts` creates App fields for both editors, including model defaults, binding to the first available generation step, and node/connection limits. Model defaults are also reused when a designer changes a selector's target.
- **Model selector** appears in the initial App form field choices. Designers still control allowed models and one default; each run selects one model. Existing published versions keep their settings.
- The Google route only preserves legacy links. Activation Studio uses the dedicated Google composer, with separate asset/ad, delivery, resource-field and review components. Google and Meta drafts remain independent.
- Google bidding choices and server validation use one native campaign-type mapping. All six existing campaign families and supported update/asset-group operations retain their controls.
- Connected channel labels and account-field metadata share one definition. App connection fields use the existing workspace-scoped account list, filter by provider and connected status, and exclude expired accounts. Google never uses the Meta account-image endpoint.

## Integration boundaries

New integrations should extend the existing connection metadata and workflow capability discovery, then implement their native configuration, validation, execution and reporting contracts. Connection discovery does not imply publishing support: `connectionChannelSchema` includes Google, while the legacy Facebook/Meta `channelSchema` remains limited to its existing publishing adapters. Google continues through its native reviewed-change service with workspace/account checks, revision validation and explicit publication approval.

This batch adds no integration, database migration, dependency, generation model or ad-delivery capability. Advanced Google work remains in #83. The broader Studio styling direction is still awaiting selection.

## Verification

Focused regression coverage exercises both field editors, automatic model binding and graph limits, published model defaults, provider-specific account filtering, all six Google creation families, native bidding rejection, independent channel drafts and legacy deep links. TypeScript, production build and the complete PostgreSQL-backed CI/browser gate are required before rollout. Live verification uses existing account discovery and field pickers without saving workflows, running paid generation or publishing ads.
