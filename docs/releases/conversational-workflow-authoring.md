# Conversational workflow authoring — first increment

Based on `codex/render-supabase-migration` at `453688576a48ccd4ef5777d21e7f0576f9b1fb10`.

## Reviewable behavior

The workflow library and saved workflow editor offer **Build with chat**. A single metered text-model turn returns typed changes. The user inspects a static step/form preview and exact JSON changes, then explicitly applies the proposal to a draft. Unsaved editor changes disable chat entry. Apply errors leave local state intact. Published Apps, execution, schedules and posting retain their existing separate interfaces and authorization paths.

`server/lib/workflowAuthoring.ts` is the shared domain service. The tRPC router and MCP adapter call it directly. There is no second execution engine, arbitrary code generation or generic remote execution facility. The existing `appVersionId` representation of both `app` and `run_workflow` is unchanged. Graphs, form fields and models use the existing shared schemas and validation helpers. Pinned Apps use the existing resolver.

Every action rechecks active organization membership and workflow roles, under a membership lock. Draft and App reads are tenant-scoped. Static inspection checks referenced account/media/product ownership using local IDs only. It never decrypts credentials or reads/uploads image bytes. Nested definitions are bounded before expansion and still pass the existing resolver's limits. Runtime connection status, media approval, model availability, billing and provider-specific constraints remain execution-time checks.

Proposals are immutable `authoring.proposed` activity events containing the base hash, target revision, typed changes, proposed snapshot and preview. Applying requires the reviewed proposal hash and original revision. The transaction uses the existing organization lock, conditional revision update and audit hash chain. `authoring.applied` events hold durable request receipts; replays return the original ID/revision. Another user's proposal cannot be read or applied. A replay does not claim that the current draft still matches the original receipt.

Chat first commits an `authoring.requested` reservation, then uses `aiScope`, `listLLMModels`, `requireLatestGptTextModel` and `invokeLLM`. The new operation has a conservative metering estimate. Provider network retries remain those of the existing LLM infrastructure; the authoring agent itself makes one logical model call and has no tools or repair loop. Model output is parsed and validated before storing a proposal. No new provider route or credential is introduced.

## Limits and deliberate omissions

- 80 typed edits per proposal; existing 40-node / 100-edge draft schema; four nested App levels. Static preflight inspects at most 160 definition nodes (including repeated calls), which can be stricter than the existing 160 expanded-step / 400-edge execution limits.
- 6,000 characters per chat message, twelve history messages, 96,000 characters of draft/App/history context, and 8,000 output tokens. Discovery and chat share a scoped App contract catalog: at most 100 recent versions and 32,000 characters of complete contracts, with an explicit truncation flag. Contracts contain exact callable input IDs, declared types, form constraints and output IDs/types, using the existing App reader and normalization. Archived Apps are excluded. Multi-input composition uses those IDs with the existing `inputMapping` mechanism; large omitted contracts require explicit discovery/readApp outside the one-turn in-app agent. Text context is data, not an authority to execute tools.
- Static preview is a step/form/configuration summary, not a generated-media preview, quote or proof a workflow can run. Empty/incomplete drafts can carry readiness warnings; malformed graph/form/model definitions fail validation.
- The one-shot agent does not automatically refine an un-applied proposal. Apply a reviewed draft before asking for follow-up edits. Chat history is browser-local; persisted proposals and apply receipts are audited server-side.
- Failed or interrupted chat request IDs remain reserved. The UI checks the exact original request's status before retrying. Lost successful responses recover the stored proposal; unreceived requests reuse the original payload/key. Recorded failures offer an explicit **Start new metered attempt** action. Pending/uncertain requests require a fresh status check and explicit **Abandon unresolved attempt** before another attempt; abandonment fences late proposal persistence under the organization lock. It cannot cancel/refund a provider call already in progress, and another attempt may incur another charge. No unknown status silently starts new work. There is no automatic recovery worker.
- Existing Optimization Studio plans are preserved, but editing their plan structure is outside the typed operation set. Publishing, enabling automation, executing, spending generation credits and external posting are not MCP capabilities.
- Activity storage is reused; there is no workflow schema migration. Proposal retention follows the current activity-log retention policy. Large-scale proposal search, pagination and a dedicated revision browser are follow-up work.

## MCP adapter and later connection plan

The adapter is **unmounted**. Nothing in `server/_core/index.ts` exposes it. `createAuthoringMcp()` without configuration returns HTTP 503. It is not a usable ChatGPT connector until an authenticated connection is authorized, configured and verified.

The adapter uses the current official `@modelcontextprotocol/server` 2.4.0 SDK and Streamable HTTP, with a fresh server per request. It supports SDK protocol responses, including SSE framing for the tested 2025-11-25 client protocol. It exposes discovery, draft/App reads, typed proposals, static preview and reviewed draft apply only. The external host supplies typed proposals; it does not trigger EvokeLoop's model endpoint.

For a later, separately authorized connection:

1. Select an existing OAuth 2.1 authorization server. Verify authorization-code + PKCE S256, RFC 8414 discovery, resource/audience handling and a supported ChatGPT client-registration mechanism (CIMD, DCR or predefined client). Do not treat an ordinary browser session JWT as an MCP authorization grant.
2. Configure an HTTPS resource URL, exact issuer, trusted JWKS URL and origin allowlist. Implement `resolveUserId(issuer, subject)` through an explicit existing account link; return null for revoked/unlinked identities. Never map arbitrary numeric token claims to users. No account link or credentials were created in this increment.
3. After permission to expose the endpoint, mount the Fetch handler with host/origin validation preserved, a request-body limit, rate limiting and correct proxy configuration. Publish the supplied RFC 9728 protected-resource metadata path. The issuer hosts its own authorization metadata. Restrict the endpoint to the intended environment during verification.
4. Verify signed tokens for issuer, exact resource audience, expiry, not-before, subject and scopes. The implementation allows RS256/ES256 only and requires `sub`, `exp`, `iat`. JWT revocation beyond expiry requires the deployment's identity-link resolver or authorization-server revocation policy; JWKS signature verification alone is not token introspection.
5. Authorize `workflows:read` and, separately, `workflows:draft`. Configure ChatGPT's per-action approval for proposals and draft apply, and verify it with the actual client. Tool descriptions/annotations and a reviewed hash do not themselves prove a human clicked approval. Do not grant persistent write approval as part of initial connection testing.
6. Verify OAuth consent, discovery, tenant separation, revoked links/membership, insufficient scopes, review/apply, duplicate requests and stale revisions end-to-end. Keep execution, publishing, schedules, spending and posting absent from this connector. Any future addition needs its own permission/approval design.

Official references checked during implementation:

- [MCP TypeScript SDK: HTTP transport](https://ts.sdk.modelcontextprotocol.io/v2/serving/http)
- [MCP TypeScript SDK: authorization](https://ts.sdk.modelcontextprotocol.io/v2/serving/authorization)
- [OpenAI: MCP authentication](https://developers.openai.com/plugins/build/auth)

## Verification

The scoped Vitest suite uses PGlite with repository migrations, mocked model responses, real RSA JWT signing/verification with local test keys, and component tests. It covers tenant and membership checks, duplicate proposals/applies, concurrent revision conflicts, reviewed hashes, invalid graphs/forms/models, nested recursion/depth/breadth, pinned App compatibility, missing references, static-preview network isolation, model metering context, untrusted prompt content, invalid model output, HTTP auth boundaries, SDK tool dispatch, scope checks and review/apply UI behavior. Existing workflow execution tests use their provider mocks.

Initial scoped validation passed 72 tests, TypeScript and client/server/worker/MCP builds, but full CI subsequently found the reserved tRPC route name `apply`. The public procedure is now `applyDraft`; a real, unmocked root-router import test guards startup. Additional regressions cover status recovery, explicit abandonment, late-result fencing, unchanged-message new attempts, bounded multi-input App contracts and exactly advertised MCP scope grants. A local full-suite run reached 1,496 passing tests; seven files could not complete because the local isolated integration database was unavailable. Use the corrected commit's GitHub CI, which provisions PostgreSQL, for the full result. On Windows, build components are invoked directly rather than the package script's Unix `cp` command. Vite emits a large-chunk advisory.

No live model call, paid generation, workflow execution, public endpoint, OAuth grant, ChatGPT connector installation, deployment or merge was performed. Browser-connected authenticated ChatGPT testing and visual end-to-end testing against a running application remain later verification steps.
