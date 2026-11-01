# Theme preference repair

The storage listener previously trusted every event payload for the appearance key. A queued event could apply an older value after a newer explicit local choice, leaving rendered appearance different from persisted preference. Null or invalid values also reset the in-memory selection to the OS default, and session-storage events were accepted.

The listener now accepts only a valid preference from local storage whose value still matches the current persisted value. It ignores stale, invalid, removed and unrelated-storage events. Initialization, explicit light/dark/system choice, OS behavior and public-site light presentation remain unchanged.

Regression evidence: four new cases fail on the released listener and pass after the fix. Targeted theme/layout/public-site suite:22tests passed. Isolated Chrome:1586px and375px, each with light/dark/system across OS changes, refresh and public/workspace navigation; stale/deleted events ignored; real second-tab change synchronized. The browser regression is required in CI.

Diagnostic limit: live dark selection survived a fresh simple refresh/navigation reproduction. The user's intermittent flipping is accepted as a real reported issue, but the precise triggering event in that session has not been captured. This fixes a demonstrated synchronization defect; it is not evidence that every possible live flipping trigger has been eliminated. Production follow-up should verify the user's reported flow.

No saved-prompt work, business data, permissions or service configuration changes.
