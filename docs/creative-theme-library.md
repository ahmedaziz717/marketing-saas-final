# Creative Builder Theme Library

Frame now uses a single shared theme catalog with **100 stable themes**. The taxonomy follows the useful planning structure seen in the read-only MSCC reference while using Frame-specific names, prompts, palettes, and interface components.

| Group | Theme Count | Purpose |
|---|---:|---|
| Always On | 8 | Recurring product, launch, offer, bundle, feature, weekend, and holiday directions |
| General / Evergreen | 20 | Reusable visual systems such as studio, cinematic, premium, technology, gradient, natural, and abstract treatments |
| January–December | 72 | Six campaign moments per month, including seasonal, retail, cultural, launch, and audience-relevant directions |
| **Total** | **100** | Stable IDs with searchable labels, Lucide icon keys, palette hints, and editable theme prompts |

Each saved Creative Builder setup stores its selected theme ID, the editable **main prompt**, and the editable **theme prompt** inside `campaign_briefs.creativeSetup`. Existing saved setups remain valid: when either prompt layer is absent, schema parsing restores the current approved defaults.

The final generation prompt treats both editable layers as **styling and composition guidance only**. Approved catalog facts, selected specifications, prices, brand policy, logo rules, and safety constraints remain authoritative and cannot be overridden by prompt edits.
