# Catalog imports and visible dialog validation

Scope: user-authorized catalog connection corrections and issue #77. This release does not change Meta app publishing, activate advertising, or change budgets.

## Catalog connection is separate from product readiness

- Readable API products with stable IDs/SKUs can be imported for review even when product-page links, images, or price currencies are missing. No invented URLs or currencies are inserted.
- Endpoint/authentication, JSON structure, identity, URL-safety and pagination failures remain source errors. Manual and CSV import schemas remain strict.
- Image-base paths are normalized as directories, preserving their subfolders with or without a trailing slash. Absolute and root-relative image URLs retain their normal meaning. Installed-component previews use the same rule.
- Unmatched optional product-page examples are explained without rejecting the feed. Family-specific mapping is retained; one desktop example is never applied to laptops.
- A failed remote image download records a product-level review notice, preserves existing images, and does not abort the other products. Storage/database failures still surface as failures rather than being hidden.
- Source ID plus external product ID remains the identity. Blank product URLs are never used to merge records. Refreshes preserve reviewed manual corrections, and later syncs retry unavailable source images.
- Catalog cards explain missing links/currencies/images and allow API drafts to be edited without first inventing a link. Empty links are not rendered as navigation targets. Imports remain pending review; publication confirmation and destination validation are unchanged.

## Visible warnings and actions

- API connect, Meta campaign/ad-set creation, and Meta editing share an action footer outside their scrollable forms.
- API settings changes display an explicit stale-preview state. Old warnings are not presented as fresh results; the user controls re-previewing, avoiding automatic billable interpretation.
- Ad-set schedule validation is shared by the client and server. Errors stay beside the action buttons, remain inline with the field, and can focus/scroll to the invalid date. They update or clear when corrected. Blank optional starts and paused creation are retained.
- Long messages have bounded scrolling without obscuring action buttons; errors are announced accessibly.

## Verification gates

Regression coverage includes mixed/incomplete feeds, stable identities, image failures and recovery, source isolation, manual correction preservation, trailing/root-relative/absolute image URLs, source-error blocking, stale previews, invalid dates, no execution without confirmation, and actual Chrome dialog geometry at desktop, laptop and mobile/short viewport sizes.

Run TypeScript, unit/integration tests, the production build and existing browser checks before merging. Deploy the existing web service first, confirm health and allow connections to drain, then deploy the existing creative worker. Do not describe release gates or signed-in live testing as complete until their results have been observed.
