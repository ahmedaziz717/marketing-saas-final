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

## Published pricing freshness and customer attribution

The web service checks the official Markdown model pages for `gpt-5.5` and
`gpt-image-2.5-sunburst` at startup and on a six-hour timer, skipping sources
checked in the last 24 hours. Global admins can force a check in
`/admin/pricing`. Exact model IDs, pricing units, modality tables and text
long-context multipliers must parse successfully. Invalid/unavailable sources
retain last known prices and set a visible verification warning. This is a daily
published-rate check, not an instantaneous guarantee of invoice pricing.

Automatic pricing is adopted only for the exact original standard-rate seeds.
Administrators can disable automatic pricing for a negotiated contract override.
Concurrent admin edits are protected by an updatedAt compare-and-set. Each request
continues storing its immutable rate snapshot; source checks never rewrite past
usage. Sources, content-version hashes, successful verification time, and failed
check status are stored with the provider rate. The dedicated pricing page exposes
the source and stale/error state. Stripe remains disconnected.

Recommended architecture: separate OpenAI production and staging projects, with
per-EvokeLoop-customer request attribution and credit enforcement in our own ledger.
A project per customer is optional for dedicated enterprise isolation, not required
for per-customer cost estimates. The read-only Admin API key is sufficient for
billing reports and need not be broadened. Shared-project invoice totals cannot
be represented as exact billed costs per EL customer: discounts, adjustments,
late charges, and other applications must be reconciled separately. Do not bill
customers from estimates while presenting them as reconciled provider invoices.

## Administration navigation

`/admin` overview; `/admin/accounts` searchable directory (50 rows per page,
server-side tier/access filters); `/admin/usage` customer usage; `/admin/billing`
actual OpenAI billing; `/admin/tiers` plans; `/admin/pricing` rate configuration;
`/admin/finance` manual entries; `/admin/audit` administrative history. Account
creation and credit editing have separate dialogs. Customer workspace admins do
not gain access to these pages or APIs.
