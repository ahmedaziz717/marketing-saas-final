# Meta Marketing API Contract for Controlled Publishing

Verified against official Meta documentation on August 28, 2026.

| Operation       | Current contract used by Frame                                                                                                                                                                                                                       |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API version     | `v26.0`, as shown in the current creative documentation updated June and August 2026.                                                                                                                                                                |
| Validate token  | `GET /v26.0/me?fields=id,name` with the organization-supplied access token.                                                                                                                                                                          |
| Upload image    | `POST /v26.0/act_{AD_ACCOUNT_ID}/adimages` with the image bytes encoded as Base64 in the `bytes` parameter; persist the returned image hash.                                                                                                         |
| Create creative | `POST /v26.0/act_{AD_ACCOUNT_ID}/adcreatives` with `name` and an `object_story_spec`. For a link image ad, `object_story_spec` contains `page_id` and `link_data` with `image_hash`, `link`, `message`, `name`, `description`, and `call_to_action`. |
| Create ad       | `POST /v26.0/act_{AD_ACCOUNT_ID}/ads` with `name`, `adset_id`, `creative: { creative_id }`, and `status: PAUSED`. Frame never creates an active ad automatically.                                                                                    |
| Update ad       | `POST /v26.0/{AD_ID}` with the approved mutable field set. The initial MVP limits updates to `name`, `status`, and `creative`, with status constrained to `PAUSED` unless separately approved in a future version.                                   |

An ad creative is a separate object that contains the visual rendering data. Meta's documented flow creates the creative first, stores the returned creative ID, and then supplies that ID when creating an ad. The official examples create ads with `status="PAUSED"`; Frame follows that safer default. Image-library temporary URLs must not be used to create an ad creative; Frame uploads the bytes and uses the returned image hash instead.

The current Ad Creative reference documents recommended title and body limits, permissions errors, access-token errors, rate limits, and an application access-level error. Frame records the complete success or failure outcome in its append-only activity ledger while never storing the raw token in an event payload.

## Sources

1. Meta for Developers, “Ad creative,” updated June 28, 2026: https://developers.facebook.com/documentation/ads-commerce/marketing-api/creative
2. Meta for Developers, “Ad Creative,” updated August 6, 2026: https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-creative
3. Meta for Developers, “Ad, Image,” updated March 24, 2026: https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-image

## Channel-first ad creation (October 2, 2026)

Content Studio ads now use connected advertising channel → account → campaign → ad set → creative → preview. Only Meta Ads is implemented today. Google and Microsoft Advertising are not selectable until their connection and publishing adapters exist. Social accounts never enter this selector.

Campaign and ad-set lists start with an effective-status Active filter, support Paused / All statuses, and preserve an explicitly selected paused object (including newly created objects). Changing account clears both children; changing campaign clears the ad set. A saved publication retains `content.metaCampaignId` and `adSetId`; delivery verifies that both belong to the same account and campaign. Existing drafts without a campaign ID derive it from the selected ad set.

New campaigns expose the six ODAX objectives and auction buying, campaign/ad-set budget ownership, daily/lifetime budgets, supported bid strategies, and special categories. New ad sets support website Sales, Traffic and Leads, Awareness, and on-ad Engagement with matching performance goals; schedules; country targeting; manual adult age/gender controls; Advantage+ audience; accessible custom/lookalike audience inclusion/exclusion; automatic or selected Facebook/Instagram image placements; dataset and standard conversion event; and supported click/view attribution windows. Budget entry currently supports USD accounts. Ad-set budget sharing is explicitly off for new ABO campaigns.

App-specific, catalog, instant-form, messaging, reservation, advanced location/interest targeting, and other specialized Ads Manager features are not a complete embedded replica. The form explains these limits and links to the selected account in Ads Manager. Meta remains authoritative for objective/account/placement eligibility and minimum budgets; its errors are shown to the user. A settings review here is not a successful live API creation test.

The existing signed, expiring review ticket, membership checks, connection ownership, snapshot revalidation, single-use audit record, and live-delivery gate remain mandatory. Every new campaign/ad set/ad is PAUSED. Merely opening, selecting, saving, or previewing a draft performs no Meta write. Creation requires an explicit reviewed confirmation, returns the new ID and selects it without losing the creative draft.

Official references consulted for this extension:

- https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/campaigns.md/
- https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/adsets.md/
- https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-campaign.md/
- https://developers.facebook.com/documentation/ads-commerce/marketing-api/mobile-app-ads.md/

Verification uses synthetic provider responses and offline browser fixtures, including account/campaign scoping, inactive selection, paused creation review, inherited campaign budgets/bids, lifetime schedule validation, foreign pixel/audience rejection, and mobile layout. No live campaign, ad set, ad or spend was generated by these checks.

## AI copy options

Single-image Meta ad drafts support five primary texts, five headlines, and five descriptions (the primary field plus four alternatives). The image-grounded generator requests exactly five distinct, complete sets. The editor can regenerate all five sets, one three-field set, or one field in one option; single-field regeneration asks the model for only that replacement. Generated responses are validated before applying them. Stale responses never overwrite newer copy, image selections, or workspace context, and the latest applied generation can be undone. Saving edits continues to invalidate prior approval through the existing draft revision workflow.

All 15 reviewed values travel in the existing multiple-text creative payload. Carousel and placement-image drafts retain their one-copy-set publishing contract and offer five alternative sets to choose from. Organic Facebook captions retain three suggestions. Existing usage metering, credit enforcement, approved-image checks, workspace access and activity logging also apply to regeneration.
