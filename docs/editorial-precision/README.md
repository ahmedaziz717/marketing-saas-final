# Editorial Precision migration

## Scope and source

Based on release branch `codex/render-supabase-migration`, verified at `d80efe807fb36af5d95d9ce2d7b7622069291d9c`; the repository default `main` is an older lineage. Work is isolated on `codex/editorial-precision-ui`. No prompt-default persistence changes, provider behavior, permissions, or business operations are included.

Both approved Library references were downloaded through the user's ChatGPT Library UI after the official helper failed on Windows `os.setxattr`. Readable files and pixels were verified before styling: Creative Studio `libfile_105e4f00bb848191877e09c5b377518c` (1,430,428 bytes), Dashboard `libfile_d9a791d83c8c8191b5b4ab94cf82c1a9` (1,449,162 bytes). Reference files remain consumer-local rather than becoming application content.

## Design and behavior

- Porcelain surfaces, navy text, restrained teal controls, compact surfaces and visible focus rings share one light/dark token source. Workspace-specific lavender overrides are removed. Semantic status colors, artwork palettes, chart series, and workflow wire types retain their meanings.
- A scalable SVG loop and accessible font wordmark replace raster-dependent branding. Manrope is bundled locally for the workspace with system sans fallbacks.
- Four studio entry points remain on Home, followed by distinct Apps and Workflows directories, existing live insights, and existing review/calendar/brand/integration shortcuts. No concept metrics or sample products replace live queries.
- Creative Studio retains its preview, summary, category rail, choices, drafts, quoting, generation and approval controls. Preview/Review/Results tabs organize existing result controls and history. Switching results retains draft settings and selects Review without approving or generating.
- All other studios, Apps, workflow libraries/canvas/forms, catalog, settings, admin, auth, dialogs and drawers inherit the same tokens and shared controls. Family colors remain contextual accents; primary actions use teal.

## Coverage and verification

`component-coverage.csv` inventories every application page/shared component; inheritance is not a claim that every permutation has been manually inspected. The browser fixture matrix covers desktop/mobile in both themes, including repeated studio navigation, generation gates, approvals, failure recovery, dialogs, publishing, Apps, Workflows, admin, catalog, settings, and empty states. Synthetic fixture records stay outside application code. Screenshot review and final results are recorded separately as validation completes.

Commands: `pnpm check`, `pnpm test`, `pnpm build`, `node scripts/smoke-build.mjs`, `node scripts/check-dialog-layout.mjs`, `node scripts/check-channel-layout.mjs`, `node scripts/check-public-website.mjs`. No lint script exists. Set `CHROME_BIN` for Windows browser tests. `node scripts/preview-ui.mjs` serves synthetic fixtures locally on port 4179 for visual inspection.

Baseline limitations on this Windows executor: full tests require an isolated PostgreSQL database; six integration setup failures plus one image-service test fail without it. The build's existing final Unix `cp` command fails after Vite/esbuild succeed; copying `server/lib/brandPdfWorker.mjs` to `dist/brandPdfWorker.mjs` with PowerShell allows the unconfigured-DB smoke check. CI provides ephemeral PostgreSQL and Linux for the complete gates. These limitations must not be represented as successful full tests.

Release remains gated on complete checks and visual coverage. The user's later production approval is recorded in the task; approval alone does not waive any gate.
