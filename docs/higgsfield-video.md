# Product and Creator video creation

`/app/creatives/video` separates Product videos (Higgsfield) from Creator videos (future Creatify). Both categories use the same editor: create, edit, extend, motion control, references, prompt, duration, framing, resolution, sound, and bitrate. Creator videos add the existing 500-person model library, its filters and approved saved portraits, with up to four people per draft. Creator video setup and model selections can be saved and reopened; generation and credit quotes remain disabled until the Creatify integration is connected. The server and worker prevent creator video requests from reaching Higgsfield or reserving generation credits. These saved settings express the requested creative setup; future Creatify capability validation must precede generation. Existing product drafts default to the product category, requiring no data migration. Product video creation accepts product, service, and brand references without requiring a catalog product.

Creator videos were previously labeled UGC videos. The internal `ugc` category and existing URLs remain unchanged so saved drafts and bookmarks continue to work. Library filters use Creator content because uploaded creator and customer content can include both images and videos.

## Setup

1. Obtain an API credential and API credit balance at <https://open.higgsfield.ai>. A website subscription and its Unlimited mode do not include API usage.
2. Set server-only `HF_API_KEY` on both Render services: `frame-staging` and `frame-staging-creatives`. Copy the complete credential, typically `key_id:key_secret`. `HF_CREDENTIALS` is also accepted. Never expose it as a Vite variable or store it in this repository.
3. Deploy the web service first to apply migration `0009_outgoing_ogun`, then deploy the worker. The blueprint documents the environment-variable linkage; existing services need their actual secret configuration updated in Render.
4. Check **Admin → Provider rates → Higgsfield video generation**. Generation requires web configuration and a fresh worker heartbeat. `VIDEO_GENERATION_ENABLED=false` on either service is an optional pause switch. Draft editing remains available without credentials.
5. Review the six seeded resolution/model rates and AI-credit values before opening generation to customers. Test a short clip in an authorized test workspace after credentials are configured. No paid provider generation is executed by the automated tests.

## Supported operations

| Operation | API endpoint | Settings |
|---|---|---|
| Create without images | `bytedance/seedance-2.5/text-to-video` | Prompt, 4–30 seconds, six ratios, 480p/720p/1080p, sound, default/high bitrate |
| Create with references | `bytedance/seedance-2.5/reference-to-video` | Same settings; up to nine workspace images in this release |
| Edit | `bytedance/seedance-2.5/video-edit` | Source MP4, prompt, reference images, resolution, sound, bitrate; source duration/framing |
| Extend | `bytedance/seedance-2.5/video-extend` | Source MP4, prompt, references, extension length, resolution, sound, bitrate; source framing |
| Motion control | `higgsfield/genjutsu/motion-transfer/v1.0` | Source MP4, 1–8 images, optional prompt, resolution; source motion/timing/framing |

Source clips must be 4–30 seconds. Uploads retain the existing 20 MB video limit. Generated MP4s are downloaded with a 200 MB safety bound, subject to the Supabase project's storage limit. Audio generation is supported; separate audio-reference uploads and the provider website's Unlimited mode are not offered. The first release fixes the engine to the documented endpoints rather than displaying unsupported model choices.

## Jobs, review, and credits

- Private, RLS-enabled job records isolate workspaces. Creator roles can save/generate; source access is checked again before submission. Campaign-plan references are tenant-checked.
- Queueing atomically freezes the references/settings, reserves AI credits, and records pending usage. A workspace can have three unresolved requests at a time. Duplicate queue calls for the same draft do not reserve twice.
- The independent worker loop uses expiring leases. It persists the exact request body, ordered signed URLs, and job UUID before the first submission. The UUID is the provider idempotency key. Ambiguous retries reuse the exact body and key, including after restarts.
- Inputs use 24-hour signed storage URLs. An ambiguous submission older than 20 hours requires operator reconciliation; it never automatically changes the URLs/key. Raw provider errors and signed URLs are not returned through customer APIs.
- Cancellation is best effort while the provider still has the request queued. Credits are refunded only after confirmed cancellation/failure or proof that no request was submitted. A lost response does not imply a refund.
- Completed provider requests are recorded as succeeded even if copying the output to storage needs retrying. Storage retries use the same job-owned path and do not submit another generation. CDN downloads reject non-HTTPS, private IPs, unsafe redirects, oversized streams, and timeouts; they never carry API credentials.
- The finished MP4 is a **draft** in Content Studio, with dimensions, duration, and its existing Asset Library review flow. Generation does not approve or publish it. Drafts, active jobs, and failures appear under the Videos filter; the finished asset replaces the completed job there.

## Cost estimates

The migration seeds published pre-discount rates checked on October 3, 2026. Costs use a frozen per-request rate snapshot and measured MP4 dimensions/duration. Seedance uses video token units (`ceil(width × height × (input seconds + output seconds) × 24 / 1024)`), including its video-input multiplier. Motion transfer uses rounded-up source seconds. These units are not recorded as LLM input/output tokens.

AI credits are configurable per billable second, reserved from the selected settings; the quoted amount is checked again before enqueueing. Seedance bills credits for source plus requested output seconds; motion uses source seconds. Initial rates are deliberately explicit, editable values rather than pretending website Unlimited usage is free.

Provider costs are **estimates**, not account invoice reconciliation. Higgsfield discounts/promotions and rate changes are not automatically imported. Admins can update the rate overrides; changes apply to future requests. OpenAI's existing automatic rate sync only applies to supported OpenAI models.

## Reconciliation

For `attention` jobs, inspect the job UUID/idempotency key and stored provider request ID in `app_private.video_jobs`, plus the corresponding `ai_usage` record. Use the authenticated provider request dashboard to determine the outcome. **Check same request again** resumes polling or replays the unchanged acceptance request; it never creates a new intent. Do not reset the key or create a compensating credit until the provider's actual state is known. Failed output storage needs retrieval/copy repair, not a provider-generation refund.

## References

- [Lifecycle](https://docs.higgsfield.ai/docs/concepts/requests)
- [Idempotency](https://docs.higgsfield.ai/docs/concepts/idempotency)
- [Seedance API and pricing](https://open.higgsfield.ai/models/bytedance/seedance-2.5/text-to-video/playground)
- [Motion transfer API and pricing](https://open.higgsfield.ai/models/higgsfield/genjutsu/motion-transfer/v1.0/playground)
