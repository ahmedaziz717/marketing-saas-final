# Copy analysis

The shared taxonomy defines 100 values across eight dimensions: messaging style,
messaging angle, emotional tone, benefits/features, urgency, offer, specificity,
and copy length. Values and their definitions are browsable in the workflow
comparison settings and in reports. Multiple values can apply to the same text.

## Where users find it

- Advertising analytics: select an account and dates, then **Analyze copy**.
- Workflow/App: Account & date range → Fetch Meta ad copy & results → Compare
  copy styles → Output. The comparison settings expose all eight dimensions and
  the purchase CPA/ROAS thresholds. Existing graphs gain these defaults without
  requiring a new node or changing their names.
- Saved publications: **Copy attributes** displays the tags saved with the draft.

Reports lead with ad names, actual text and weighted performance. Readers choose
a copy field and dimension, inspect value groups, and expand individual ads for
all assigned values and supporting text. Technical IDs are in collapsed details.

## Classification and persistence

The current automatic classifier uses explicit English text signals, simple
negation exclusion, and measured word/Unicode character counts. These are
reviewable automatic suggestions, not semantic AI judgments or calibrated
probabilities. Unsupported style, angle or tone stays unclassified. “No explicit
offer” means no supported signal was detected, not proof of no offer. There are
no paid provider calls for classification.

Each text field and variant receives its own full classification. Draft creation
and editing recompute tags on the server; client-supplied tags cannot override
the classifier. Creative Builder stores authored image headline/subheadline tags.
Selected image subheadlines remain separate from primary text and description.

Live Meta analysis and historical classification save current text/tag snapshots
in tenant-scoped `optimization_records` (`kind = copy_tags`). Records include
taxonomy version, text fingerprint, source and observation time. An older
import cannot replace a newer snapshot. Human-reviewed historical assertions
remain in their existing revision store and retain priority there.

Live reports use freshly fetched copy for the chosen connected account and
dates. EL-authored subheadlines can be joined only for the same organization,
connection, ad and published creative ID. Image text from external ads is not
extracted. Tags are stored even for multi-variant or carousel ads, but those ads
are excluded from per-text performance comparisons.

## Interpretation

Performance is ad-level, associated with the current creative snapshot. It does
not isolate the effect of a headline, offer or tone. Purchases and revenue use
the same Meta attribution definition across the report. Missing values stay
unavailable. CPA, CTR and ROAS are recomputed from summed underlying metrics.

An ad counts once per value group. Multi-value groups and field tables overlap;
their totals must not be added. Comparison thresholds control eligibility, not
statistical confidence. No causal confidence percentage is invented. Partial
coverage, unreadable copy, ties or fewer than two eligible comparison groups
prevent declaring an observed leader. The existing live inspection bound of
100 highest-spend returned ads remains visible in coverage.

Saved version-1 reports are rendered with their original results. Rerun the
workflow or refresh analytics to obtain the new dimensions; no saved run is
silently rewritten. This change does not resume imports, publish ads, change
budgets, or run paid generation.
