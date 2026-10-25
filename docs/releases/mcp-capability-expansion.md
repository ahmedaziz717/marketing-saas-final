# MCP capabilities and activation handoff

Isolated branch codex/mcp-capabilities from release73d1334. Code and mocked/local
validation only. No production grant, paid run, credentials, merge or deployment.
No new database migration. Existing domain engines remain authoritative.

## Capability / scope matrix

Every grant requires workflows:read. Existing workflows:read/workflows:draft
permissions keep their original meaning; new authority requires explicit consent.

| Scope | Implemented tools / consequence |
| --- | --- |
| workflows:read | Connection context, blocks, authoring drafts, pinned App contracts, static proposal preview/status |
| workflows:draft | Typed proposal/refinement and in-app review-link request; no direct save |
| workflows:save | Direct workflow/App authoring draft creation/edit; rename/put node/put edge; no deletion or publication |
| catalog:read | Bounded product/media identity pages and workspace category settings |
| brand:read | Existing Brand Kit, prompt discovery and bounded explicit prompt reads |
| creatives:draft | Local creative setup and video setup drafts; no generation |
| campaigns:draft | Local Google campaign changes and unscheduled publication drafts; no external validation/upload/mutation |
| brand:configure | Owner/admin explicit shared prompt default saves; affects future workspace work |
| catalog:configure | Owner/admin category additions/edits and product assignment; preserve existing mappings/IDs and manual overrides |
| workflows:execute | Prepare/review, execute, read and stop content-only text/image runs; separate exact run/budget approval required |

All draft/config writes use current role/tenant checks, strict inputs, revision
fences, and durable actor/org/tool/request-ID+payload-hash receipts. Domain save,
audit and receipt share the existing organization transaction. Replays return the
original saved result/revision even if later edited; they do not overwrite it.
Direct workflow save reuses proposal/apply and checks the applied receipt before
mutable dependency validation. Both phases reauthorize. An interruption can leave
an unapplied proposal; retry identical input/ID. Never silently start a new request
after uncertain transport. Graph request hashes bind identity, not human consent.

Catalog reads disclose raw imported category plus media identities; resolved
marketing mappings/guidance are read separately. No credentials, source secrets or
signed image URLs. Product/brand/prompt text is data, not agent instructions.

## Execution and cost boundaries

Preparation resolves nested Apps, rejects every unsupported/business/publishing
node and dynamic performance expansion BEFORE media preparation. Preparation may
read/prepare media and is not a side-effect-free static preview; it spends no AI
credits. Approved runs use the existing worker/metering engine and pending assets.

The authenticated same-origin /mcp/run-review page shows the complete bounded graph, prompts, model/input settings, Brand Kit and effective prompt defaults and approves the immutable request
and exact credit ceiling; approve is NEVER an MCP tool. The execute tool requires
that durable approval and a current execute grant. Enqueue checks revisions,
account pause/balance, concurrency and snapshot binding. Worker checks grant,
membership, snapshot, current brand/prompt context and accepted node prices before dispatch. The worker consumes the approved context snapshot after that check. A durable per-node
paid-attempt receipt prevents automatic repeated spending after an uncertain crash.
Safe stop preserves run history and assets; already dispatched work may complete.

Supported run graph: configured text/image inputs, text/image generation,
combine/output and compatible nested Apps. No runtime App input overrides yet.
Video execution is blocked until the child-worker boundary enforces the same
budget/revocation policy. The credit cap is EvokeLoop AI credits, not an invented
provider-dollar estimate. No paid/provider generation has been used to test this.

## Explicit exclusions and remaining staged work

- Deletion/removal, live publishing, activation, live schedules and external ad
  mutations are excluded by user instruction, not merely waiting for a toggle.
- Google change drafts may describe additions/updates but do not send them to
  Google; removal drafts are rejected. Google validate can prepare assets and is
  not exposed as static validation.
- Video generation, direct Studio generation and runtime App input overrides need
  further worker/budget integration. Text/image generation is available through
  the bounded workflow path; these are not claims of complete Studio parity.
- Ordinary catalog fact edits and campaign briefs need revision-fenced safe-save
  adapters; imports/source sync repair also require explicit side-effect scope.
- Full brand profile editing/activation can import logos or personalize prompts;
  current configure scope saves explicit prompt defaults only. No automatic AI
  personalization, model installation, connection/OAuth administration or billing.
- Backend has no universal safe “do everything” operation. No generic router/code
  execution tool is provided. Further supported operations require explicit typed
  adapters; this PR is a broad staged increment, not complete application parity.

## Consent diff and activation gate

Resource metadata advertises minimal workflows:read; per-tool metadata/challenges
request exact additional scopes. Authorization metadata lists supported scopes.
Existing tokens cannot use new tools or expand through refresh. Configure scopes
require owner/admin at consent and use; mixed grants lose eligibility on demotion.
Access tokens stay30minutes; rotating refresh stays revocable with30day inactivity.

After reviewed deployment by the sole release owner, parent must obtain exact
workspace/scope confirmation. Suggested wording (omit unrequested capabilities):

“Allow the existing EvokeLoop connection for CLXGaming to read catalog, Brand Kit,
prompts and category settings; directly save workflow/App, creative/video setup,
Google campaign and unscheduled publication drafts; and change shared prompt
and category defaults? Shared changes affect future workspace work. Also allow
content-only text/image execution, with each exact run and credit budget approved
separately in EvokeLoop? No deletion, live publishing, activation or live schedules.
Access remains revocable with30-minute tokens and30-day inactivity expiry.”

Do not create a duplicate plugin. Verify actual resulting scopes, workspace,
expiration, tool refresh and a separately authorized benign operation. Neither
this code nor documentation proves live ChatGPT step-up interoperability.

## References

- https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization
- https://developers.openai.com/plugins/build/auth

Current installed SDK/transport/registration are preserved. Follow per-tool scope
minimization and approval guidance; no credentials or persistent grants created.

