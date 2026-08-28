# Frame Operating Guide

## Product Boundary

Frame is a self-serve team workspace for producing **Meta image-ad creative** from controlled inputs. It deliberately does not include broad campaign analytics, budget optimization, email marketing, landing-page building, or autonomous media buying.

The production path is fixed:

> Active brand kit → approved source assets → approved campaign brief → GPT-generated variants → human creative approval → frozen publish request → explicit publisher approval → confirmed Meta action saved as `PAUSED`.

## Workspace Setup

The first authenticated user creates an organization and becomes its **owner**. Onboarding then activates the initial brand kit and optionally creates a role-bound invite for an administrator, creator, reviewer, or publisher. Invite links are bound to the invited email and expire after seven days.

The brand kit stores the approved palette, font names, voice guidance, required claims, and prohibited content. Uploaded logos, product images, and references enter a **pending** state and cannot be used in a campaign brief until an owner, administrator, or reviewer approves them.

## Creative Generation

Only approved campaign briefs with approved organization-owned assets are eligible. The server re-checks every status before creating a generation job and stores a snapshot plus deterministic input hash.

Frame requires the current approved GPT stack without fallback:

| Function | Required model |
|---|---|
| Structured creative planning and Meta ad copy | `gpt-5.5` |
| Advertising image generation | `MODEL_GPT_IMAGE_2` / GPT Image 2, medium quality |

If either required model is unavailable, the job fails safely. No partial output becomes approved or publishable.

## Review and Approval

The Creative Review workspace displays generated variants side by side. Reviewers can compare concepts, copy the ad-text package, download the image file, add comments, and explicitly approve or reject each variant. Only an approved variant can be included in a Meta publish request.

Editing a campaign brief returns it to draft and invalidates its prior approval. Publishing performs a fresh status check, so rejecting an approved creative after a request was prepared blocks execution.

## Meta Connection and Publishing

An owner or administrator supplies an ad account ID, Facebook Page ID, optional Instagram actor ID, and access token. Frame validates the token against Meta before storing it with AES-256-GCM encryption. The raw token is never returned through application APIs or written to the activity ledger.

A publish request freezes the approved creative, destination URL, ad set or ad identifier, action, and ad name into a deterministic payload hash. A publisher must explicitly approve that exact hash. Immediately before execution, Frame revalidates:

| Required condition | Failure behavior |
|---|---|
| Request status is approved | Publishing is blocked |
| Creative remains approved | Publishing is blocked |
| Meta connection remains connected | Publishing is blocked |
| Current payload hash equals approved hash | Publishing is blocked |
| Final user confirmation is provided | No network request is sent without it |

Frame uploads the approved image, creates a Meta ad creative, and then creates or updates the ad. Every created or updated ad is forced to **`PAUSED`**. Meta success and failure identifiers are recorded, but credentials are excluded.

## Activity Ledger

The application exposes insert and read operations only. Each organization event stores the previous event hash and its own deterministic hash. Reading the ledger verifies the full sequence by database ID; editing or deleting an event breaks verification and is visibly reported.

## Verification Status

The project includes unit tests for tenant isolation, role authorization, GPT-only model enforcement, generation eligibility, exact-payload publish approval, and activity-chain tamper detection. TypeScript validation, the full Vitest suite, production bundling, desktop screenshots, mobile screenshots, and runtime log review were completed before the delivery checkpoint.

