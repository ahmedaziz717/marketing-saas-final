# Studio choice sizing and compact controls

This follows PR #84 and the three October 22 layout screenshots. Large illustrated cards remain useful for choosing actual creative treatments and destinations. Routine filters and settings now fit the layout around them.

- Studio galleries use a shared 200px minimum card width with 12px gaps, giving three or four columns in typical desktop editors. Comparable choice artwork is 120px tall. Channel logos use a 48px plate, and redundant channel copy is removed. Portrait galleries retain square images; previews and result charts keep their own dimensions.
- Workflow inspector fields use native controls by default. Capabilities and start mode are short, visible text choices. Weekday, model options and other form settings no longer create a tall illustrated gallery. Explicit visual pickers still show their source images.
- Date presets remain visible together, including custom dates, in 40px text controls with two columns on phones. Report details, metric selection, schedules and saved optimization plans use ordinary compact controls. Creative theme/style collection filters use a dropdown beside the search field.
- Google account choices no longer request photos from the Meta connection endpoint. Meta photo lookup remains available.
- Sequential deployment waits for both old web and old worker processes to drain before declaring release verification ready. The configured worker shutdown allowance is respected.

Verification exercises native form labels, required fields, reset, submission, keyboard choices, provider-specific photos, saved reports and workflow settings. Actual-page Chrome checks cover the three screenshot scenarios, compact card geometry, visibility of real workflow steps and scheduling controls, desktop/laptop/phone layouts and horizontal overflow. Full repository CI remains the merge gate.

Remaining agenda: live CLX generation-to-delivery and output-quality review needs a separately authorized real generation/publication; automatic GitHub deployment still needs its Render secret configured. Advanced Google settings listed in the preceding release remain available in Google Ads. Fifteen catalog source images still need valid source media.
