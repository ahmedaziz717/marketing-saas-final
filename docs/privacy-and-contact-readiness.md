# Privacy and contact delivery review

Reviewed September 23, 2026 against the current application. This records implementation evidence and remaining review work; it is not a legal opinion or a platform approval.

## What this release changes

- `/privacy` describes accounts, workspace content, authorized integrations, enquiries, technical data, purposes, recipients, retention, deletion, U.S. rights, appeals, children, tracking signals and AI processing.
- Meta, Google, Microsoft Advertising/Bing, Shopify, BigCommerce and WooCommerce are covered without implying that a listed or planned integration is already enabled.
- All five public contact topics share one protected endpoint and a durable private notification queue. The notification recipient defaults to `ahmed.aziz@cybertron.com`. The requester's address is only a Reply-To address; it cannot override the recipient.
- Successful submissions display “Thank you for contacting us.” and promise an initial response within two business days. This is not a promise to complete a verified privacy request in that time.
- Existing saved requests receive pending notifications when the additive migration runs. Notification delivery does not close or fulfill the underlying request.

## Evidence and partner checks

| Area                  | Current evidence                                                                                                                     | Remaining condition                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Contact collection    | Signed expiring form token, origin check, rate/size limits, validation, default-deny private tables and administrator-only inbox     | Monitor the inbox and respond within the published commitment                                                                    |
| Notification delivery | Plain-text mail, server-controlled recipient, provider idempotency, atomic database lease, durable retries and visible failure state | Configure a verified sender and sending key; verify provider delivery after deployment                                           |
| Commerce              | `storeCatalog.ts` imports products/variants only; current connectors do not request customers, orders or payment cards               | Review any expansion before collecting protected customer data                                                                   |
| Meta                  | Limited authorized Facebook workflows, encrypted connection credentials, public deletion instructions and request form               | Confirm actual production scopes and current App Dashboard review requirements; complete verified deletion operationally         |
| Google                | Conditional disclosure, minimum-purpose commitments, revocation link and Limited Use statement                                       | Verify OAuth branding, scopes, consent screen, relevant product policies and any required assessment before enabling integration |
| Microsoft/Bing        | Conditional account/campaign/reporting disclosure and public privacy/terms URLs                                                      | Configure app registration URLs and review the applicable Advertising agreement and actual production scopes                     |
| Shopify               | Current manual catalog connector is not represented as an approved public Shopify app                                                | A public app needs mandatory privacy webhooks and applicable protected-data review before submission                             |
| AI                    | Requested prompts/assets/product facts go to the OpenAI business API; no application model-training pipeline                         | Confirm account-level provider terms and retention settings; review connected-data restrictions for each new feature             |
| Tracking              | Public pages have no advertising pixels or optional analytics scripts; font requests and necessary storage are disclosed             | Reassess notice/consent/GPC controls before introducing sale, sharing, targeted advertising or optional tracking                 |

Google requires accurate disclosures and permission scope minimization; Limited Use restricts downstream use and human access. A public policy is one part of the review. See the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy).

Microsoft app registration supports privacy and terms URLs in the consent experience. See [Microsoft's app registration guidance](https://learn.microsoft.com/en-us/entra/identity-platform/howto-add-terms-of-service-privacy-statement). This is not a substitute for the applicable Microsoft Advertising contract.

For Shopify App Store distribution, implement `customers/data_request`, `customers/redact` and `shop/redact`, including HMAC validation, even if no customer data is stored. These handlers are not implemented in the current catalog connector. See [Shopify privacy compliance](https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance) and [protected customer data](https://shopify.dev/docs/apps/launch/protected-customer-data).

Meta's official [privacy-policy expectations](https://developers.facebook.com/documentation/development/terms-and-policies/privacy-policy.md/) and [deletion callback documentation](https://developers.facebook.com/documentation/development/create-an-app/app-dashboard/data-deletion-callback.md/) were located, but their current bodies were not retrievable during this review. Recheck the authenticated App Dashboard before asserting Meta approval; no callback compliance is claimed here.

## Business and legal facts still to confirm

1. The legal service operator and business address. No public profile row currently identifies the operator; a hosting organization name is not proof of the contracting entity. Do not mark disclosures approved until verified.
2. Actual prior-12-month collection and disclosure practices. The policy describes audited current behavior and does not fabricate a retrospective certification. Add any required historical category disclosure after owner review.
3. Which state laws apply based on the business, people served, thresholds and exemptions; confirm consumer-request methods and deadlines, including any required toll-free method. The policy provides a form and email, verification, authorized agents and appeals. See [California's CCPA guidance](https://www.oag.ca.gov/privacy/ccpa) and [Colorado's CPA guidance](https://coag.gov/resources/colorado-privacy-act/).
4. Documented retention/deletion schedules, backup expiry, customer processing agreements, vendor contracts and incident procedures. Current policy uses purpose-based retention criteria; it does not invent a fixed deletion or backup period.
5. Have U.S. privacy counsel review the final policy and actual operating procedures before describing the service as compliant with every applicable law or guaranteed to pass partner review.

## Email operation

Set `CONTACT_RESEND_API_KEY` to a sending credential, `CONTACT_EMAIL_FROM` to an address on a verified Resend domain, and `CONTACT_NOTIFICATION_EMAIL=ahmed.aziz@cybertron.com` on the Render web service. Store credentials only in service secrets, never in this repository. No worker deployment is required for this queue.

The web process checks pending requests every 30 seconds. Transient errors retry with the same idempotency key. Permanent errors, exhausted attempts and uncertain retries beyond 23 hours become `needs_attention`; the admin inbox displays that state. Inspect the provider before any manual resend. Resend's [idempotency window is 24 hours](https://resend.com/docs/dashboard/emails/idempotency-keys).

`sent` means the provider accepted the message. Verify Delivered or a bounce in the provider before asserting mailbox delivery. Email failure never deletes the saved enquiry, changes request fulfillment status or exposes request details on the public thank-you page.


## September 24 policy follow-up

- Verified that billing remains preview-only (`server/routers/billing.ts`, `shared/frameProduct.ts`); no payment processor or live checkout is implemented. Policy now states this and describes plan/commercial enquiries without inventing Stripe, offline invoicing, or card processing.
- Removed the assertion that an operator name/address are already published. The public profile remains empty: owner must supply the legal operator's exact name and business mailing address. This gap is not cured by deleting the assertion.
- Added conditional EEA/UK controller/processor roles, purpose-linked legal bases, rights, a distinct objection notice, complaint links, response timing, information-provision consequences and transfer requirements. This is not a GDPR compliance certification. Before serving EEA/UK customers, confirm lawful-basis assessments, processor agreements, actual recipient transfer mechanisms, applicable representatives/DPO requirements and their contact disclosures. The notice does not assert executed SCCs, an IDTA, or Data Privacy Framework certification without evidence.
- Updated email-provider disclosure for the now-enabled Resend privacy-email receiving and forwarding, including sender-supplied attachments.
- Sources reviewed: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/what-privacy-information-should-we-provide/ ; https://www.edpb.europa.eu/topics/key-gdpr-concepts/legal-basis_en ; https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng ; https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/international-transfers/a-guide-to-international-transfers/
