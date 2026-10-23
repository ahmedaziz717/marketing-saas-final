# Editorial Precision migration

The approved Creative Studio and Dashboard references were downloaded through the ChatGPT Library UI, verified as readable PNGs, and pixel-inspected before implementation. The official materialization helper encountered an unsupported Windows `os.setxattr` call; the supported browser download resolved that transfer issue. Reference IDs: `libfile_105e4f00bb848191877e09c5b377518c` and `libfile_d9a791d83c8c8191b5b4ab94cf82c1a9`.

## Design and scope

`client/src/styles/designTokens.css` owns the shared porcelain, navy, and restrained teal palette for light and dark themes. Manrope is bundled locally. The active logo uses maintainable SVG geometry and font lettering. Shared controls, portal dialogs, drawers, forms, empty/error/loading states, studios, Apps, Workflows, settings, catalog, and admin inherit these tokens. Existing artwork, semantic status colors, and distinguishable chart/wire colors retain their purpose.

Home presents four compact studio entry points and separate Apps/Workflows collections while retaining live insights and existing shortcuts. Creative Studio retains its configurator structure, category rail and compact choices; Preview/Review/Results organize the existing preview, review actions and history. No illustrative concept metrics replace live data. No backend generation, publishing, billing, permission or credential behavior was changed.

## Coverage and evidence

- `component-coverage.csv`: 229 inventoried pages/components. Direct route coverage and shared dependencies are explicitly distinguished. Shared dependencies are exercised through routed fixtures, not claimed as independently inspected in every possible state. ComponentShowcase is not routed.
- `visual-matrix.csv`: 484 passing local browser cases across desktop/mobile, light/dark, compact widths and relevant roles. The broad run initially found a compact Studio height regression; all 42 affected Studio cases passed after correction. Admin fixtures were corrected to render actual admin sections, and 36 admin cases were rerun successfully.
- `screenshots/`: eight representative final screenshots. The complete generated matrix is retained in local/CI artifacts rather than application assets.
- The original task audit checklist is synchronized with the maintained component coverage file.

Screenshots inspected manually include Home light desktop/dark mobile, Creative light compact desktop/dark desktop/mobile, Apps directory, dark workflow canvas, catalog, actual admin model pricing, activation failure, onboarding and Insights. Fixture data is synthetic and confined to test scripts.

Manual browser checks covered theme persistence; Preview/Review/Results; history failure/retry; saved-draft dialog dismissal with Escape; and native Home → Apps → Workflows → Back → Forward → reload, preserving the expected route. Automated existing tests cover generation/review/approval/workflow behavior and repeated/interrupted flows. Production paid generation or publishing was not used as a test.

## Local validation

- `corepack pnpm check`: passed.
- `corepack pnpm test`: 1,419 passed, 59 skipped, one failed test across seven failed files, matching the pre-change baseline without an isolated PostgreSQL database. Six integration suites fail setup (asset approval/library, catalog rescan, creative generation/builder, workspace team); imageService has the database-dependent failed test. CI supplies isolated PostgreSQL and must pass the full suite before release.
- Targeted auth contracts: 52 passed. Branding contracts: 21 passed.
- Vite and esbuild production compilation passed. The existing build command's Unix `cp` tail is unsupported on this Windows executor; equivalent PowerShell copying of `brandPdfWorker.mjs` was followed by a passing HTTP smoke check with `--allow-unconfigured-db`. Linux CI must pass the unmodified full build and configured smoke check.
- `node scripts/check-dialog-layout.mjs`: passed.
- `node scripts/check-public-website.mjs`: 14 guest documents and 36 desktop/mobile cases passed.
- `node scripts/check-channel-layout.mjs`: 484 local cases passed across the broad run and corrected/remaining targeted runs. Final-head CI repeats the complete matrix in one run.
- No lint script is defined by this repository.

The local preview (`node scripts/preview-ui.mjs`) uses fixtures only. It supports real browser navigation and serves bundled fonts/artwork for representative visual review. It is not a replacement for application integration tests.

## Release gate

PR89 targets the verified production lineage `codex/render-supabase-migration`, originally at `d80efe807fb36af5d95d9ce2d7b7622069291d9c`, rather than the stale default branch. Final-head CI, review of concurrent changes and exact-commit web/worker health verification are required. The existing release workflow deploys web first, waits for healthy exact-commit responses and connection draining, then deploys the worker. User authorization permits release only after those gates pass. Final CI/deployment outcomes are recorded in the task report and GitHub runs; this document does not assert an uncompleted release.
