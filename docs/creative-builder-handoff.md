# Creative Builder implementation

This change belongs only to `ahmedaziz717/marketing-saas-final`, the separate Frame / Marketing SaaS project. The original MSCC application and `Marketing-OS` repository are read-only and must never receive these changes.

## Customer flow

Choose a theme → channels and sizes → products and catalog images → logo, shot type and direction → editable copy → review → generate → review and export results.

- Selecting a different theme immediately replaces the headline, subheadline and CTA with that theme's copy, including after loading a saved setup or editing copy. Clicking the already selected theme keeps edits. AI copy refresh has undo and ignores stale responses after setup changes.
- Product search retains selections. Each product has its own image, visible specification checkboxes and optional catalog price. Unchecked specifications remain factual context.
- Meta, Google Display and Microsoft formats are available without connecting an ad account. Only Meta outputs enter the existing Meta publishing workflow; other formats are exports.
- One master is generated per product group, then referenced for each size adaptation. Products together supports three products; separate mode supports up to 12, with 24 total outputs per attempt.
- Saved setups use a typed JSON field on a backing draft brief. Customers create them directly in Creative Builder; no prior brief approval is required. Catalog products and logos must still be approved, and the Brand Kit must be active for generation.
- Jobs start in the background. Results, frozen inputs, review decisions, comments and audits remain database-backed. A failed attempt inserts no partial result set. Interrupted jobs become retryable after a ten-minute lease expires and Results is checked; there is no automatic paid regeneration.
- Generation remains in the existing Node process. This is not an independent distributed worker queue. A process restart loses active work, which is marked failed after lease expiry.
- Exports preserve the requested pixel dimensions using contain resizing. The image provider is prompted for the target aspect ratio. Generated text, product likeness and compact banner composition still require human review; this is not proof of platform ad acceptance.

## Manus compatibility and activation

Existing Manus OAuth, MySQL, storage, Forge image/text services and hosting remain in place. No new authentication provider, database service or image API credential is introduced.

1. Review and merge the feature branch into this repository's `main`; coordinate with any active Manus editing task first.
2. Pull the connected repository in the **new** Manus workspace.
3. Install the lockfile dependencies: `corepack pnpm install --frozen-lockfile`.
4. Apply the reviewed migration before running the new app: `corepack pnpm exec drizzle-kit migrate`. Use the normal database backup/change procedure for the target environment. Migration `0006` adds four nullable/defaulted fields and extends the brief channel enum; it does not delete existing data.
5. Run `corepack pnpm exec tsx scripts/check-creative-services.ts` inside Manus. This read-only check uses the existing private Forge configuration and prints no credentials.
6. Open `/app/creatives` in the Manus preview. Create and reload a setup, refresh copy, then generate one product in two sizes. Confirm the selected product image, logo, copy and specs in both outputs; approve and download one.
7. Check a reviewer account and another company. Confirm reviewers cannot generate and one company's records are inaccessible to another.
8. Publish through Manus after preview validation.

The exact required image ID is configured privately in `server/lib/models.ts`. It resolves `gpt-image-2.5-sunburst` to the opaque enum returned by Forge ListModels. If that exact ID is unavailable, generation fails with neutral customer guidance. There is no silent fallback to another engine. Provider/model identifiers are excluded from the customer UI and activity responses.

## Verification

- `corepack pnpm check`
- `corepack pnpm exec vitest run --exclude '**/*.integration.test.ts'`
- `corepack pnpm build`

The GitHub workflow also provisions an **isolated MySQL 8 database**, applies all migrations and runs the full suite, including persistent builder, legacy generation and catalog integration tests. Providers are mocked in those tests; no advertising accounts, paid generation or production data are used. Do not point integration tests at a customer database.

Local checks cannot establish live Forge availability or the rendered Manus preview. Complete the environment checks above before calling this production-ready.
