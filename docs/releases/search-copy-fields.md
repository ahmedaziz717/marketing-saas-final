# Search copy fields and suggestions

Scope: the existing Activation Studio Copy > Ad copy fields and suggestion handling. The live navigation, category hierarchy, campaign cards, media pickers and activation flow remain unchanged.

Search now uses the existing shared AdCopyWorkspace for separate headlines, descriptions and both display paths. Each entry has a character counter and editable/removable draft text. Multiline paste splits headline/description entries without silently truncating overflow. Search enforces 3–15 headlines, 2–4 descriptions, 30/90 characters and 15-character paths. Required copy and keyword errors target their respective fields; blank legacy textarea lines were real empty entries rather than a disconnected binding.

AI generate all copy reads the campaign's current landing page using the existing DNS-pinned, public-network-only website reader. It combines readable page evidence with the selected workspace Brand Kit and existing copy, requests the maximum Search set, and returns editable suggestions without writing to the draft. Failed/empty/blocked pages stop before generation. Context changes invalidate suggestions and late responses. Tests mock page and AI calls.

The shared suggestion toolbar adds select/deselect all and rejects partial Add selected operations. Add all that fit explicitly reports skips. Search supports confirmed replacement of the selected field only, with Cancel and a draft-change guard. Existing Google/Meta manual copy stays intact.

Validation: targeted component, schema, route authorization and PGlite save/load tests; TypeScript; production client/web/worker builds; offline Chrome fixture coverage for Search, existing PMax and Meta on desktop/mobile in light/dark. The full local suite requires PostgreSQL for its integration suites; exact-head GitHub Actions supplies that database and remains the release gate. No paid generation, ad activation or production data edits are used for testing.
