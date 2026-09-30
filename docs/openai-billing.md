# OpenAI billing in platform administration

Set `OPENAI_ADMIN_KEY` in the web service's server-side secret environment. Use an organization Admin API key authorized for cost reporting. The generation key remains `OPENAI_API_KEY`. The billing credential is never returned by a route, persisted in a usage record, or sent to a model proxy.

`/admin` → Overview → Actual OpenAI costs reads the official `/v1/organization/costs` endpoint. Date ranges use inclusive UTC calendar days and support up to 366 days. All pages must succeed before a report is returned. Results are cached in server memory for ten minutes; the overview refreshes while open and the Sync button explicitly refreshes. The startup check verifies access and warms the current-month cache without delaying server readiness.

The project selector filters OpenAI project IDs, not EvokeLoop customer accounts. All-project totals may include other applications using that OpenAI organization. Costs are grouped by project and billing line item. Recent costs may lag provider usage reporting. A successful empty response means no reported entries; an API/permission/format failure means unavailable, never a zero bill.

Provider-reported totals remain separate from request estimates and manually recorded expenses. Do not add both together: they can overlap. Shared-project billing cannot establish exact customer-level charges by itself. Customer contribution remains incomplete while requests lack verified estimates; billing integration does not manufacture rates or overwrite historical request snapshots. Use dedicated provider projects or a documented allocation method before attributing aggregate charges to customers.

Only global platform administrators may query or refresh these reports. Workspace ownership does not grant billing access. Raw upstream error bodies and credentials are never logged. The startup log records a bounded current-month verification summary; detailed billing categories stay in the authenticated admin response.

Reference: https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage/methods/costs
