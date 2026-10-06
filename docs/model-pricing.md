# Generation models and credits

## Operations

- `/admin/models` controls model availability, provider routes, default markup, credit value, and model overrides. These procedures require the platform administrator role, not a workspace owner role.
- Each model has an immediate-save **Offer this model** switch. Turning it off hides it from customer pickers and blocks new generation requests, while retaining its pricing, route, and account verification. Pricing edits and availability sync do not turn disabled models back on.
- `/admin/tiers` sets monthly package credits. `/admin/accounts` assigns packages, grants extra credits, and controls enforcement. Existing unassigned workspaces remain in tracking mode; this release does not start Stripe billing or grant arbitrary credits.
- Default pricing is provider cost × 2 (100% markup). One credit represents $0.01 retail. Credits round up once per provider action. A workflow sums its actions; it does not round each token separately.
- The workspace header shows remaining credits. Apps and workflow steps show an estimate before generation. Token usage and measured video duration can change the final charge.
- Every model row immediately shows four values for one complete action at its listed default settings: estimated provider USD, provider credit equivalent, retail USD after markup, and whole retail credits. Provider credit equivalents retain fractions; only retail credits round up. If rounding changes the retail dollar equivalent, that amount is also displayed. Unsaved policy edits are explicitly labeled as previews.
- Admin action estimates and customer quotes share the same calculation. Video estimates include the entire default duration and any required source video, rather than displaying a per-second rate as the action cost. Wholesale action estimates are returned only by the platform-admin endpoint.
- OpenAI image actions use the configured provisional estimate, visibly labeled alongside the default quality. The seeded $0.20 medium-quality estimate is not a published per-image price, and can be the same across models with different token rates. Per-million text-input, image-input, and image-output rates, verification date, and source are available under each model. Equal per-token rates do not imply equal token consumption or equal final image costs. Reservation overrides remain separate from the rates used to price completed usage.

## Catalog and routes

`shared/modelCatalog.ts` defines model identities and supported input schemas. `shared/data/higgsfieldModels.json` contains the Higgsfield API catalog verified on 2026-10-05, including source links and public price options. Models without verified pricing remain unavailable until configured.

`ai_model_settings` stores the enabled flag and selected provider route. Same-model route aliases currently cover direct OpenAI and Higgsfield Sunburst/Flare. Adding another direct provider requires implementing its adapter and registering a compatible route; changing a label alone does not create a provider integration. Requests keep the selected route and rate snapshot. The customer badge is “Direct pricing,” not an unverified discount claim.

Customer model cards, selection labels, and maker filters identify the actual maker (for example, ByteDance for Seedance). Fulfillment providers are displayed only in platform administration. Higgsfield remains the maker for its own native models, while the Marketing Studio Sunburst and Flare endpoints identify their underlying maker as OpenAI.

The server checks OpenAI account availability through `GET /v1/models` at startup and from the admin sync control. Existing scheduled pricing synchronization checks official OpenAI model pricing daily. New models require verified prices before use.

Higgsfield public list prices are estimates, not account invoices. Configuration-specific prices use published matching options; incomplete public matrices use the published upper bound. Promotions and negotiated discounts are excluded. Administrators can override costs using their actual agreement. Catalog discovery is a reviewed snapshot, not an invented automatic provider-catalog API.

## Accounting and execution

- New actions reserve credits using a frozen rate, markup, and credit value. Existing usage and queued creative/video jobs retain their saved prices.
- Successful OpenAI actions settle against reported input/output usage. Video actions settle against measured output dimensions/duration and the selected provider pricing unit. Settlement ledger keys make adjustments idempotent.
- Known provider failures refund the reservation. Ambiguous submissions or missing usage remain reserved and marked for attention; a timeout is not evidence that no billable work occurred.
- Higgsfield image submissions record the idempotency key and provider request ID. Review an ambiguous request with that provider ID before refunding or retrying. Never automatically submit a second paid request to resolve an unknown outcome.
- Workflow preflight checks model input compatibility. Downstream steps recheck their price using actual inputs; a changed quote stops the step before another provider call.
- Provider requests use tenant-validated stored references. Model options cannot inject arbitrary image, video, audio, or file URLs. Outputs retain the existing download and storage validation.

Deploy the web service first so its database migrations complete, then deploy the generation worker. Verify the catalog and credit UI without creating paid generations. Provider prices remain estimates until reconciled to the provider's billing records.
