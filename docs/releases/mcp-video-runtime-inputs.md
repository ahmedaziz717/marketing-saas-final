# MCP runtime inputs and bounded video execution

Separate follow-on to PR109, based on combined ddf21ee. This is not part of the
approved PR108/109 rollout. No production permission or paid operation is implied.

## Behavior

MCP preparation accepts the same bounded declared runtime inputs as the existing
App runner. Values are applied to a clone, not saved to the App. Duplicate IDs,
unknown fields, mixed value formats and conflicting locked values are rejected.
Existing visibility/default, model, media ownership and nested-App resolution stays
authoritative. Pinned App revisions remain explicit in MCP approval; the ordinary
UI keeps its existing revision contract.

Input values, resolved graph, media references, prompt defaults and brand context
are bound to the request and exact in-app budget review. Changed inputs need a new
request; retries of unchanged requests preserve their receipt.

`prepare_video_content_run` advertises workflows:read, workflows:execute and the
new **creatives:generate_video** scope. Existing grants do not gain video authority.
The existing execute/read/stop tools operate on the connection-bound prepared run.
Approval is only through the signed-in, same-origin run review page, never an MCP
tool or a submitted assertion of consent.

Video children reuse the existing video worker, credit ledger and provider request
state. A versioned policy follows the parent approval into the child draft and its
atomic reservation. Scope, membership, revocation, parent stop, references, request,
model pricing and approved budget are checked before the first paid submission.
Uncertain acceptance is not automatically resubmitted; credits remain reserved for
reconciliation. A known provider request can still be polled and its output saved
after revocation without authorizing another generation. Outputs remain pending.

## Explicit limits

- Stored image references and text-to-video are supported; source-video editing and
  generated upstream image/video inputs require a later, separately reviewed stage.
- Preparation can resolve/sign stored media; it is not a static preview.
- No live publishing, activation, schedules, deletion, account administration or
  arbitrary router/code execution is exposed.
- Catalog fact and brief editing, bounded imports and broader configuration remain
  follow-on adapters with their own revision, receipt and permission requirements.
- Mocked/PGlite tests do not establish live provider or ChatGPT interoperability.
  Live paid testing requires a specific approved run and credit ceiling.

## Migration and later consent

0027_mcp_video_policy adds a nullable JSON policy to existing video_jobs. Existing
unmarked jobs retain their current path. No new infrastructure, provider credential,
environment variable or scheduler is required. Check migration numbering against
the release journal when integrating.

After a separately authorized deployment, start consent from the existing plugin:
https://chatgpt.com/plugins/plugin_asdk_app_6adcf1ad0b2c819193b5f9c1f16d5008
The client must generate fresh state/PKCE and the exact callback/resource for
https://app.evokeloop.com/mcp/oauth/authorize ; do not fabricate a consent URL.
Ask specifically for the selected workspace and creatives:generate_video alongside
workflows:read/workflows:execute. Existing 30-minute access and revocable 30-day
inactivity refresh limits remain unchanged. Each paid run needs its own exact review.
Manage/revoke at https://app.evokeloop.com/mcp/connections . No grant is issued here.

## Provider evidence

Official [idempotency documentation](https://docs.higgsfield.ai/docs/concepts/idempotency)
binds replay to the same key, endpoint and unchanged payload. The implementation
does not assume changed signed URLs or a fresh key can safely replace an uncertain
request. [Request lifecycle documentation](https://docs.higgsfield.ai/docs/concepts/requests)
describes known-request polling, queued cancellation and result retention; it does
not guarantee that signed input URLs remain valid indefinitely.
