# Meta Marketing API Contract for Controlled Publishing

Verified against official Meta documentation on August 28, 2026.

| Operation | Current contract used by Frame |
|---|---|
| API version | `v26.0`, as shown in the current creative documentation updated June and August 2026. |
| Validate token | `GET /v26.0/me?fields=id,name` with the organization-supplied access token. |
| Upload image | `POST /v26.0/act_{AD_ACCOUNT_ID}/adimages` with the image bytes encoded as Base64 in the `bytes` parameter; persist the returned image hash. |
| Create creative | `POST /v26.0/act_{AD_ACCOUNT_ID}/adcreatives` with `name` and an `object_story_spec`. For a link image ad, `object_story_spec` contains `page_id` and `link_data` with `image_hash`, `link`, `message`, `name`, `description`, and `call_to_action`. |
| Create ad | `POST /v26.0/act_{AD_ACCOUNT_ID}/ads` with `name`, `adset_id`, `creative: { creative_id }`, and `status: PAUSED`. Frame never creates an active ad automatically. |
| Update ad | `POST /v26.0/{AD_ID}` with the approved mutable field set. The initial MVP limits updates to `name`, `status`, and `creative`, with status constrained to `PAUSED` unless separately approved in a future version. |

An ad creative is a separate object that contains the visual rendering data. Meta's documented flow creates the creative first, stores the returned creative ID, and then supplies that ID when creating an ad. The official examples create ads with `status="PAUSED"`; Frame follows that safer default. Image-library temporary URLs must not be used to create an ad creative; Frame uploads the bytes and uses the returned image hash instead.

The current Ad Creative reference documents recommended title and body limits, permissions errors, access-token errors, rate limits, and an application access-level error. Frame records the complete success or failure outcome in its append-only activity ledger while never storing the raw token in an event payload.

## Sources

1. Meta for Developers, “Ad creative,” updated June 28, 2026: https://developers.facebook.com/documentation/ads-commerce/marketing-api/creative
2. Meta for Developers, “Ad Creative,” updated August 6, 2026: https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-creative
3. Meta for Developers, “Ad, Image,” updated March 24, 2026: https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-image
