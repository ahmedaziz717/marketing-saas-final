# EvokeLoop general architecture

Adopted as the forward-looking architectural baseline on 2026-10-06 at the
owner's request. Source: *EvokeLoop Concept & Architecture Brief*, October 2026,
22 pages, supplied by Ahmed Abdelaziz.

This document records product intent and implementation direction. It is not an
inventory of implemented capabilities, a production readiness assessment, or
authorization to publish content, change spending, or enable unattended actions.
Existing execution permissions and approval requirements remain enforced until
explicitly changed through a reviewed implementation.

> Apps accomplish tasks. Loops pursue objectives. People choose the control.

## Canonical objects

| Object | Contract |
| --- | --- |
| Ecosystem | Native capabilities and supported external integrations available for composition. |
| Node | A stable capability with typed inputs and outputs. Users configure its invocation; they do not rewrite its implementation. One integration can expose several nodes. |
| Workflow | Configurable connections between capabilities, including mappings, prompts, conditions, branches, waits, and human involvement. |
| App | A published, runnable workflow with a usable interface, declared inputs and outputs, eligible variables, permissions, ownership, and a version. |
| Loop | An objective-driven process composed of Apps that observes results and changes subsequent execution using feedback. A schedule alone does not make a Loop. |
| Engine | A reusable, versioned optimization policy created or configured through an Optimize workflow/App. It proposes or applies only permitted decisions at variable, App/workflow, or Loop scope. |

There are two levels of composition: the workflow inside an App, and the
workflow of Apps that can form a Loop. Neither should be a collection of
unrelated, hard-coded screens. Guided Apps must remain useful without requiring
users to open a workflow editor or build a Loop.

“Publish as App” packages a workflow for use. “Activate” refers to real delivery,
such as sending, publishing content, or launching an authorized campaign. These
must remain distinct actions in both contracts and the interface.

## Four capability families

| Family | Responsibility |
| --- | --- |
| Create | Produce assets, copy, briefs, plans, and other material from business context. |
| Activate | Carry out authorized delivery to a selected destination, with a durable external result or receipt. |
| Measure | Gather and normalize observations while preserving their meaning and attribution context. |
| Optimize | Analyze evidence and produce constrained decisions, experiments, or reusable engines. |

These families organize capabilities; they do not impose exactly four steps or
a rigid execution order. An optimizer may run inside a Create App, before an
activation, or across a Loop. Domain experts retain ownership of their part of
the process while sharing context and contracts.

## Optimization is an explicit contract

An App distinguishes supplied inputs, owner-controlled configuration,
optimizable variables, and derived outputs. A variable binding declares its
type, allowed values or constraints, engine version, owner, evidence scope,
control mode, and fallback.

An engine can be rules, statistics, an LLM, a trained model, or a combination.
It does not require training a new foundation model. Its result may be a
candidate value, a decision, retention of the incumbent, or abstention because
evidence is insufficient.

Changing an eligible prompt or theme does not authorize rewriting workflow
topology, altering objectives, increasing spend, or granting new permissions.
Brand restrictions, verified product facts, and other locked inputs remain
controlled. Multiple engines require conflict handling and bounded nesting.

Record the engine version, observable inputs, evidence references, selected
action, concise rationale, and downstream result. Do not expose private model
reasoning or treat an LLM's confidence as proof. Learning may update eligible
policy state or propose a new engine version; promotion follows the configured
authority and control mode.

## Control and execution

The control spectrum is Manual, Assisted, Reviewed, Bounded, and Unattended.
Control can be assigned independently to a variable, a step, an external action,
or an entire Loop. It must be a visible product setting, not a hidden prompt.
Unattended execution still has an owner, limited permissions, revocable
delegation, history, override, and pause/stop controls.

The shared execution foundation must support:

- Typed, versioned App, engine, node, and connector contracts with reproducible
  run snapshots and explicit fallback behavior.
- Durable jobs, waits, external job identifiers, approval state, cancellation,
  and correct resumption after interruption.
- Idempotency and reconciliation before retrying external side effects, so a
  retry cannot silently create duplicate posts, ads, or charges.
- Limits on nested calls, iterations, elapsed time, provider spending, credits,
  and authorized marketing spend, as relevant to each run.
- Server-enforced organization boundaries, permissions, credential isolation,
  and version-bound approvals wherever the configured policy requires them.
- Separate proposal and application records; no engine can expand its own
  authority.

## Evidence and learning

Preserve a linked chain from decision and engine version, through the exact
asset and activation, to observed outcomes. Evidence records retain source,
metric definition, window, cohort, currency, timezone, and attribution method.
Platform-reported conversions are not automatically deduplicated across tools.

Track evidence maturity explicitly: observed pattern, hypothesis, and tested
finding. Allow conversion delays and insufficient data. Compare a change with a
suitable incumbent or controlled experiment; a before/after difference alone
does not establish causality. Restrict the initial experiment space so that
results are interpretable.

Unpublished or unmeasured work can provide human preference and production
quality feedback, but cannot establish business effectiveness. Learning from
one channel or population must not silently become a universal rule. Logs alone
are not learning: the evidence must inform a later eligible decision.

## Reference layers and experience

| Layer | Components |
| --- | --- |
| Experience | App forms, workflow editor, Loop dashboard, variable inspector, operations views. |
| Control | Ownership, delegation, constraints, versions, approvals. |
| Execution | Typed contracts, durable jobs, retries, waits, event routing. |
| Evidence | Assets, decisions, observations, experiments, policy state. |
| Capabilities | Native nodes, connector adapters, external tools. |

Control and evidence apply throughout execution. They are not optional reporting
features added afterward. Creative workflows and marketing automations can have
different user experiences while sharing these foundations.

The default App view should make the task easy. “Open workflow” reveals process
logic. The variable inspector reveals source, owner, evidence, control, and
overrides. The Loop view shows its objective, next action, or reason for waiting.
Operations views show runs, approvals, failures, usage, and outcome links.

## Existing product decisions retained

These requirements come from the ongoing product direction and remain compatible
with the brief; their listing does not assert that every item is implemented.

- Shared business and brand context supports products, services, directories,
  and subscriptions. A catalog product must not be universally mandatory.
- The platform serves individual businesses and teams, with progressive
  disclosure. A narrow initial marketing Loop does not narrow the long-term
  architecture to paid ads alone; social, email, and landing-page capabilities
  can reuse the same foundations as supported integrations are added.
- The EvokeLoop master admin remains separate from customer workspaces.
  Customers see credits; internal provider costs, retail dollar equivalents,
  margin, and account/overall profitability belong in master administration.
- Model makers are customer-facing; actual routing providers, availability,
  rates, and configurable markup are visible in master administration. The
  intended default markup is 100%, subject to configurable pricing rules.
- Model selection and provider routing remain separate concepts. Provider
  changes must preserve compatible contracts and correctly attribute usage and
  cost. Per-action quotes and credit settlement must remain consistent.
- Plan entitlements, credit limits, and run bounds belong in server enforcement.
  Stripe billing activation remains deferred.
- API/MCP access for ChatGPT, Claude, and other authorized clients must reuse
  the same permissions, approvals, versioning, idempotency, usage attribution,
  and audit controls as the user interface.
- A provider credential manager remains a proposed administrative capability;
  this baseline neither implements it nor changes credential storage.

## Incremental implementation direction

Start with a small supported node set and one useful Loop, preserving the value
of standalone Apps. Reuse the existing business context, assets, approvals,
connections, job handling, and metering where suitable. Confirm actual code
capabilities before deciding whether to adapt or replace a component.

1. Define common App/node/engine contracts, eligible variable bindings, execution
   identity, and evidence references around a narrow existing task.
2. Build one expert-owned theme or copy-prompt engine with candidates, review,
   an incumbent, evidence scope, and abstention.
3. Connect authorized Meta activation to measurement with an explicit objective,
   observation window, outcome identity, limits, and fallback behavior.
4. Use new evidence to inform the next eligible change, then prove that the same
   engine can be reused in a second compatible App.
5. Expand providers, channels, and capabilities through supported adapters after
   reuse and reliable operation have been demonstrated.

This sequence is a planning direction, not approval to launch ads or remove
existing publishing gates. It does not require an immediate platform rewrite,
universal marketplace, or cross-customer learning.

The first proof should be a reusable engine changing one permitted App variable,
respecting control settings, and using observed outcomes to improve a subsequent
decision. Measure usefulness against an incumbent and total operating cost.
The competitive differentiation is a hypothesis to validate, not a claim that
workflow builders, agents, Apps, or closed-loop marketing are unique to EvokeLoop.

## Relationship to earlier documentation

This baseline governs future architectural direction. The original Frame MVP
scope and operating guide are historical descriptions of an earlier product
boundary, not the target scope. Existing implementation-specific security,
approval, and integration requirements remain applicable until deliberately
revised; adopting this architecture does not bypass them.

The source brief is a product/reference architecture, not a finalized database
schema or technical design. Detailed migrations, APIs, engine promotion rules,
and runtime choices require implementation-specific design and validation.
