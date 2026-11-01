# Lifestyle model library

500 fictional AI-generated model portraits: 350 adults, 100 children (6–12), and 50 teens (13–17). The built-in image generation tool created the portraits; these WebP copies retain the generated composition. All model choices are actual portrait cells, not placeholder or recolored duplicates.

The original 100 adult portraits and stable IDs remain unchanged in `{female|male}-{black|brown|blonde|auburn|silver}.webp` (five columns, two rows). Their ages are tagged as mixed adults, rather than inventing precise age metadata.

The 400 additions occupy sixteen sheets with five columns and five rows. Catalog IDs, gender, designed age range, hair-color rows, filenames and crop coordinates live in `shared/lifestylePeople.ts`. Exact prompts and generated asset paths are recorded in `docs/lifestyle-model-generation.json`. Age ranges are casting categories, not claims about real people. Grid generation requested varied skin tones, face shapes, hairstyles and ordinary age-appropriate clothing; metadata never infers ethnicity.

Browser previews and server extraction share grid dimensions. Generation receives only the individually selected portraits, in selection order, after product, campaign and logo references. A master composition precedes those references for size adaptations. The server preserves single-person legacy drafts and validates the new list of up to four distinct references. Favorites and their original portrait count as the same identity. Uploaded references stay private to the workspace, need permission confirmation (parent/guardian for minors), and retain Asset Library approval checks at save and worker execution.

Do not replace an existing identity. Add a new ID and filename for future portraits so saved drafts keep their references. New library additions were generated on 2026-10-03 with the built-in tool; no external stock-photo library or API fallback was used.
