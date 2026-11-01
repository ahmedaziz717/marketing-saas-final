# AI credit pricing contract

Customer credits are fixed when an action starts. Provider usage is recorded separately for cost and margin; completion must never create an additional debit. Confirmed failures refund the original reservation once. Unknown provider outcomes retain their reservation for reconciliation rather than resubmitting paid work.

## Higgsfield

Use authenticated `POST /estimate/{model_endpoint}` with the same normalized input as generation. A numeric `usd` response is the account-specific cost estimate; Higgsfield credits are not EvokeLoop credits. Apply markup and credit conversion once, rounding retail credits up at the action boundary. Numeric quotes always take precedence and must never receive an additional provider discount.

Seedance 2.0/2.5 may return a descriptive token formula instead. The reviewed formula adapter accepts only that model's known billing grammar and reads dollar rates from the fresh API response. It estimates output tokens from the resolution canvas, aspect ratio, generated duration, and server-resolved source-video metadata. Image/audio references do not receive the video-input multiplier. Editing and extension descriptions already include that multiplier. Standard canvases use the manufacturer specification, including 640×640 for square 480p; 4K and free-aspect canvases remain explicitly nominal estimates. Unrecognized formulas, missing required media metadata, API errors, and malformed numeric responses stop quoting; they do not fall back to promotional ranges.

Formula quotes are `published_rate_estimate`, never account invoices. Admins may record a model endpoint's verified account discount, evidence and review date. Unconfigured discounts default to zero; expired configured discounts require review. Never infer a discount from marketing maxima or one rounded transaction. Formula snapshots retain token rate, dimensions, durations, list cost, discount and formula version. Measured video output updates wholesale estimates only.

Save cost basis, timestamp, request hash, markup, and credit value in the private rate snapshot. Video requests also persist the exact signed input body before submission. Revalidate before paid submission; changed or unavailable prices stop generation rather than increasing the charge. Models without a valid provider estimate fail closed.

Image batches quote each output and preserve each rate snapshot. Each actual image request is checked again before submission, including references introduced by a previous generated master. A different price stops that output for a new quote. Already completed outputs retain their accepted prices.

Workflows use the same quoting and metering paths. The worker checks each step against the accepted run price. A model requiring a source video cannot be reliably quoted before that video exists: run the source step, then quote the dependent step using its real input. Do not invent source URLs, durations, or invoice costs to permit a run.

## Token-priced models

OpenAI actions use verified token rates and an upfront action estimate. The accepted customer credits remain fixed even if actual tokens cost more or less. Record reported input, cached input, and output usage and its calculated wholesale cost in the admin ledger. A fixed customer price means realized markup may vary on token-priced actions.

## Admin accounting

`provider_account_estimate` is an authenticated estimate, not a reconciled invoice. The admin catalog labels reference comparisons and whether a verified discount is applied. Customer model lists do not advertise a static list-price range as an account quote. Keep raw costs and reconciliation details private. A later invoice reconciliation may correct wholesale cost and margin, never the customer's accepted credits.

Historical charges are not rewritten by deploying this contract. Review disputed transactions separately against provider request IDs and invoices.

## Live verification — 2026-10-07

Authenticated Kling 3.0 Pro text-to-video quotes successfully produced 143 EL credits for 5 seconds and 286 for 10 seconds with sound on. No paid generation was submitted during verification.

Seedance 2.5 returned HTTP 200 with `{type: "description", pricing_description: "..."}`. This led to the reviewed formula estimate path above. Exact 100% realized markup and an immutable upfront retail price cannot both be guaranteed when wholesale cost depends on final output. EL absorbs any difference instead of increasing the customer debit.

Rate sources: https://open.higgsfield.ai/models/bytedance/seedance-2.5/reference-to-video/playground and https://open.higgsfield.ai/models/bytedance/seedance-2.0/reference-to-video/playground. Canvas source: https://docs.volcengine.com/docs/ark/seedance-2-5. The reported $0.87 charge is consistent with a 15% discount on $1.0272, but this is not sufficient evidence to configure an account-wide or model-wide discount. Rounding the invoice display before calculating retail would lose precision; retain full precision until the credit boundary.
