# Privacy email forwarding

Endpoint: `POST https://app.evokeloop.com/api/webhooks/resend/inbound`

In Resend, create a webhook for **email.received** only. In the Render web service set:

- `RESEND_WEBHOOK_SECRET`: the webhook's signing secret (`whsec_...`).
- `RESEND_RECEIVING_API_KEY`: a separate Resend **Full access** API key. Resend's sending-only keys cannot retrieve received messages. Keep this server-only; never use a VITE prefix or commit a credential.
- Existing `CONTACT_EMAIL_FROM`: `EvokeLoop <notifications@evokeloop.com>`.
- Existing `CONTACT_NOTIFICATION_EMAIL`: the owner's private destination inbox.

Save and deploy. The endpoint's GET response reports only its name, POST method and whether configuration is present. This is not proof of working credentials or delivery. POST returns 503 until all settings exist and 401 for invalid signatures.

The signed route is registered after hostname routing, before general JSON parsing and browser CSRF middleware. Signature verification uses Resend's SDK on the unmodified raw body, including timestamp replay protection. Only the privacy mailbox is accepted (envelope recipients take precedence when provided). Other events and recipients are acknowledged without forwarding. Forwarding back to the receiving domain is disallowed to prevent loops.

Messages are forwarded as an attached original `.eml` with its sender, content and attachments preserved, using the official SDK's wrapped forwarding helper. Open the attached message to read and reply to the original sender. A normal reply to the outer notification is not a branded privacy-mailbox reply. This does not create a full email client or a mailbox login.

The private RLS-protected ledger records the inbound ID, fixed destination/sender, introduction and delivery state. Concurrent deliveries claim a lease. Provider idempotency uses the inbound ID, and successful IDs remain deduplicated. A non-2xx webhook response asks Resend to retry; inspect webhook failures and replay after correcting credentials. Uncertain attempts older than 23 hours require manual provider review before any resend, rather than risking duplicates after Resend's 24-hour idempotency window. The endpoint does not pretend that provider acceptance proves mailbox delivery.

Activation test: send a message with a small attachment to privacy@evokeloop.com, confirm Resend received it, the webhook returned 200, the outgoing forward shows Delivered, and the destination inbox contains the original message. Replay the webhook and confirm no second forward. Events received before the webhook was created may need manual replay/forwarding from Resend; this endpoint does not backfill the receiving inbox.

References: https://resend.com/docs/dashboard/receiving/forward-emails and https://resend.com/docs/webhooks/verify-webhooks-requests
