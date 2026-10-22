# Google creative selection in existing campaigns

Existing Google campaigns now follow the same selection sequence as Meta in Activation Studio: choose the account and campaign, choose its ad group or asset group, choose a format/type tile, select compatible assets, and review the exact change.

- Performance Max group additions offer Images, Videos, Text and eligible Logos. Images and videos can be added together in one saved change. The selected campaign and group remain visible.
- Display and Demand Gen ad creation offer their implemented image/logo options; Search uses text. These controls do not add new Google campaign or ad-type capabilities.
- Approved workspace images and matching existing Google assets appear as visual tiles. Placement and source options follow the selected media type. Videos use existing Google video assets or a valid YouTube video ID; direct workspace video uploads remain unsupported.
- Asset-only changes omit budget/bidding navigation. Existing-asset removal is collapsed separately and defaults to no removals. Switching the type preserves additions already staged in the draft.
- Native validation, saved revisions, explicit review and provider publication remain unchanged. No migration or new dependency is required.

Validation includes all six new-campaign flows, existing PMax mixed-media additions and exact save payloads, approved-image and remote-type filtering, YouTube validation, existing Display/Demand Gen/Search formats, and campaign-level brand restrictions. The existing Chrome fixture now exercises both image and video selection for existing PMax groups. Full CI and Chrome checks gate merge; local Chrome is unavailable in this workspace.

This addresses the existing-campaign creative selection gap in #83. It does not close its remaining advanced Google scope.
