# OpenAI billing in platform administration

Set `OPENAI_ADMIN_KEY` in the web service's server-side secret environment. Use an organization Admin API key authorized for cost reporting. The generation key remains `OPENAI_API_KEY`. The billing credential is never returned by a route, persisted in a usage record, or sent to a model proxy.

`/admin` → Overview → Actual OpenAI costs reads the official `/v1/organization/costs` endpoint. Date ranges use inclusive UTC calendar days and support up to 366 days. All pages must succeed before a report is returned. Results are cached in server memory for ten minutes; the overview refreshes while open and the Sync button explicitly refreshes. The startup check verifies access and warms the current-month cache without delaying server readiness.

The project selector filters OpenAI project IDs, not EvokeLoop customer accounts. All-project totals may include other applications using that OpenAI organization. Costs are grouped by project and billing line item. Recent costs may lag provider usage reporting. A successful empty response means no reported entries; an API/permission/format failure means unavailable, never a zero bill.

Provider-reported totals remain separate from request estimates and manually recorded expenses. Do not add both together: they can overlap. Shared-project billing cannot establish exact customer-level charges by itself. Customer costs are calculated per recorded request and grouped by its EvokeLoop organization. Missing token usage remains unpriced.

## Account-level token pricing

Verified standard pricing as of 2026-09-30:

| Model | Text input / 1M | Cached text input / 1M | Text output / 1M | Image input / 1M | Image output / 1M |
| --- | --- | --- | --- | --- | --- |
| gpt-5.5 | $5 | $0.50 | $30 | Included in input tokens | N/A |
| gpt-image-2.5-sunburst | $5 | N/A for direct Images API | No text output | $8 | $30 |

GPT-5.5 retains the >272,000-input-token 2× input / 1.5× output rule. The integration uses standard global endpoints. Future pricing changes, service tiers, regional endpoints or negotiated discounts require verified rate updates.

Images are calculated from `input_tokens_details.text_tokens`, `input_tokens_details.image_tokens`, and image output tokens. Total category counts must reconcile with reported totals; missing or inconsistent usage is not guessed. Direct Images API has no cached-input discount. Responses API image generation is deliberately not priced using this path because its returned usage omits cache hits. Per-request overrides remain available but take precedence over token pricing.

Migration 0008 sets the previously unconfigured image rate without overwriting custom prices, and backfills successful unpriced Sunburst records with valid token breakdowns. It preserves the old pricing snapshot in the usage metadata, records an audit entry, and leaves credits unchanged. Backfilled values are calculated at verified standard rates, not claimed to be exact invoice charges. New requests snapshot rates before execution. Later rate edits do not rewrite priced history.

Sources:
- https://developers.openai.com/api/docs/models/gpt-5.5
- https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst
- https://developers.openai.com/api/docs/guides/image-generation#cached-input-pricing

Only global platform administrators may query or refresh these reports. Workspace ownership does not grant billing access. Raw upstream error bodies and credentials are never logged. The startup log records a bounded current-month verification summary; detailed billing categories stay in the authenticated admin response.

Reference: https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage/methods/costs
