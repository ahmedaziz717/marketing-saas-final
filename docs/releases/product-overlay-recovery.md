# Product overlay recovery

Based on release c6440dc. Draft implementation only; no production assets changed or generation requested.

Creative89 (image816) and91 (image904) selected the correct700x700 originals, with stored hashes matching downloaded source bytes. Alpha trimming produces384x568 and382x531. The previous600px trimmed-long-edge threshold blocked automatic finishing, while image732's480x666 cutout worked. New jobs use their chosen source; these examples are not stale enhancements.

Automatic enlargement now requires decoded canvas long edge >=600, visible cutout long edge >=500, short edge >=300, and no more than1.5x enlargement on either axis. Downscaling/native size still works. Both original dimensions are derived from decoded bytes, not catalog declarations. Transparent padding alone cannot qualify a thumbnail. Width/height fitting remains independent, and confidence>=.85, same camera angle, aspect difference<=15%, canvas geometry, and exact immutable source checks remain unchanged. These are bounded resampling rules, not a claim that enlargement creates detail; manual enlargement still requires explicit acceptance.

Failed layers open and reset as visible unsaved previews. Comparison remains deliberate; reset restores saved placement/source/opacity, clears enlargement consent, and never invokes alignment or saves. Successful layers behave as before. The complete background and logo/text remain preserved.

Future failures retain an additive `automaticFailureDiagnostic` with a stage and safe reason enum. Valid alignment responses may include layer index, confidence, camera-angle match, and aspect difference. Provider errors, credentials, URLs, and raw response text are not persisted. The legacy `automaticFailure` field is retained for compatibility. Storage failures are distinguished from alignment failures; unclassified alignment exceptions stay generic. Manual saves clear obsolete diagnostics. Historical88/90 have no exact diagnostic and remain unknown.

Validation:

- Hash-matched original PNG fixtures and exact placement metadata for85/89/91; mocked provider responses only.
- Negative tests for padded thumbnails, per-axis excessive enlargement, low confidence, camera mismatch, aspect/geometry errors, and invalid response.
- Job tests persist resolution/alignment/storage failure codes and preserve complete design/logo bytes.
- Actual React editor browser checks at1440x1000,375x812 and320x640: mouse/touch dragging, visible open/reset, comparison, independent height, enlargement consent, reachable actions and no horizontal overflow. Uses a separate headless profile, no live app tabs.
- Run `pnpm check`, focused overlay/preservation/job/editor tests, `pnpm build`, then `node scripts/check-product-overlay.mjs`. CI also runs the full existing migration/test/build/smoke/browser pipeline with an isolated PostgreSQL service.

Local full test attempt:1641 passed; eight files could not pass without an isolated PostgreSQL database (seven integration suites and imageService). No production database was used. CI is the full integration gate. The earlier esbuild ancestor-read restriction was resolved through approved runner permissions and a clean frozen-lockfile dependency install, not bypassed.

Coordination: PR105 touches the same router file (including formatting in overlay sections); the owner was sent the exact reserved overlay catch/metadata/read-response scope. No category, prompt, catalog, schema, or PR106 component logic is changed. Resolve any formatting conflict while retaining both semantic changes when combining releases.
