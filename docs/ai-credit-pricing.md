# AI credit pricing contract

Customer credits are fixed when an action starts. Provider usage is recorded separately for cost and margin; completion must never create an additional debit. Confirmed failures refund the original reservation once. Unknown provider outcomes retain their reservation for reconciliation rather than resubmitting paid work.

## Higgsfield

Use the authenticated `POST /estimate/{model_endpoint}` with the same normalized input as generation. The `usd` response is the account-specific provider cost estimate; Higgsfield credits are not EvokeLoop credits. Apply the saved markup and credit conversion once, rounding retail credits up at the action boundary. Never use a published range or nominal output dimensions as a fallback customer quote.

Save cost basis, timestamp, request hash, markup, and credit value in the private rate snapshot. Video requests also persist the exact signed input body before submission. Revalidate before paid submission; changed or unavailable prices stop generation rather than increasing the charge. Models without a valid provider estimate fail closed.

Image batches quote each output and preserve each rate snapshot. Each actual image request is checked again before submission, including references introduced by a previous generated master. A different price stops that output for a new quote. Already completed outputs retain their accepted prices.

Workflows use the same quoting and metering paths. The worker checks each step against the accepted run price. A model requiring a source video cannot be reliably quoted before that video exists: run the source step, then quote the dependent step using its real input. Do not invent source URLs, durations, or invoice costs to permit a run.

## Token-priced models

OpenAI actions use verified token rates and an upfront action estimate. The accepted customer credits remain fixed even if actual tokens cost more or less. Record reported input, cached input, and output usage and its calculated wholesale cost in the admin ledger. A fixed customer price means realized markup may vary on token-priced actions.

## Admin accounting

`provider_account_estimate` is an authenticated estimate, not a reconciled invoice. Published comparison rates in the admin catalog explicitly exclude account discounts. Customer model lists do not advertise a Higgsfield list-price estimate as an account quote. Keep raw costs and reconciliation details private. A later provider invoice reconciliation may correct wholesale cost and margin, never the customer's accepted credits.

Historical charges are not rewritten by deploying this contract. Review disputed transactions separately against provider request IDs and invoices.
