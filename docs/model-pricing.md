# Generation models and credits

## Operations

- `/admin/models` controls model availability, provider routes, default markup, credit value, and model overrides. These procedures require the platform administrator role, not a workspace owner role.
- Each model has an immediate-save **Offer this model** switch. Turning it off hides it from customer pickers and blocks new generation requests, while retaining its pricing, route, and account verification. Pricing edits and availability sync do not turn disabled models back on.
- `/admin/tiers` sets monthly package credits. `/admin/accounts` assigns packages, grants extra credits, and controls enforcement. Existing unassigned workspaces remain in tracking mode; this release does not start Stripe billing or grant arbitrary credits.
- Default pricing is provider cost × 2 (100% markup). One credit represents $0.01 retail. Credits round up once per provider action. A workflow sums its actions; it does not round each token separately.
- The workspace header shows remaining credits. Apps and workflow steps show an estimate before generation. Token usage and measured video duration can change the final charge.
- Every model row immediately shows its fulfillment **Provider**, separately from the maker, and four per-action values: estimated provider USD, provider credit equivalent, retail USD after markup, and whole retail credits. Provider credit equivalents retain fractions; only retail credits round up. If rounding changes the retail dollar equivalent, that amount is also displayed. Unsaved policy edits are explicitly labeled as previews.
- OpenAI admin comparisons calculate text input + image input + model-specific image output using the current stored token rates. The default scenario is one 1024 × 1024 medium-quality image, 1,000 text input tokens and zero image input tokens. The admin can change quality, size and both input counts in **Image estimate settings**. These are explicit comparison assumptions, not observed averages. Per-row calculation details show each component and link to its source. The preview never changes saved rates or customer charges.
- Output estimates were checked against the [official OpenAI image-generation guide and calculator](https://developers.openai.com/api/docs/guides/image-generation#cost-and-latency) on 2026-10-06. Image 2.5 uses its own quality factors; Image 2 uses different factors. Image 1 and 1.5 use the documented output-token table. Mini's published per-image output prices conflict with the generic older-model token table, so Mini uses a clearly labeled approximate token equivalent of its own price table at the verified $8/1M rate, multiplied by its current stored output rate. The calculator/table snapshot needs review if model tokenization changes; token rates continue syncing daily.
- The former common $0.20 provisional **credit reservation** is no longer presented as an OpenAI action cost. Reservations remain separate, and may exceed the comparison estimate. Completed actions still settle using their frozen model rates and actual reported tokens; missing usage is never replaced with these hypothetical counts. Existing jobs, reservations, and ledger entries are unchanged.
- Explicit per-request provider overrides take precedence over the token comparison. Higgsfield image estimates and video estimates keep their listed default settings. Video estimates include the entire duration and any required source video, rather than displaying a per-second rate as the action cost. Wholesale costs and comparison settings/results are returned only by the platform-admin endpoint; customer interfaces continue showing credits only.

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
