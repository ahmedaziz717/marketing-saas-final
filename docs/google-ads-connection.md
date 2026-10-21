# Google Ads customer connections

Customers use **Integrations → Google Ads → Connect with Google**, authorize
EvokeLoop with their own Google login, and explicitly select up to 25 advertising
accounts. Direct accounts and clients below a manager account are discovered.
Workspace owners and admins manage connections; other members can see status.

This release implements account connectivity, access verification, and Insights Studio reporting. Google Ads
campaign publishing, campaign changes, deletion, and optimization-agent actions
are not implemented. Google credentials cannot pass into the Meta publishing or
workflow adapters. The Google transport only permits account listing and search.

## Server configuration

Set these on the existing EvokeLoop **web service and background worker** using their private environment
settings (never browser variables, repository files, or chat):

| Variable                              | Value                                                 |
| ------------------------------------- | ----------------------------------------------------- |
| `GOOGLE_ADS_CLIENT_ID`                | The standard Google Auth Platform web client's ID     |
| `GOOGLE_ADS_CLIENT_SECRET`            | That client's secret                                  |
| `GOOGLE_ADS_API_VERSION`              | `v26` (default; update as Google versions retire)     |
| `APP_ORIGIN`                          | `https://app.evokeloop.com`                           |
| `INTEGRATION_TOKEN_ENCRYPTION_SECRET` | Existing server encryption secret; preserve its value |

Register this exact redirect URI on the client:
`https://app.evokeloop.com/api/channels/google/callback`.
JavaScript origins are unnecessary for this server-side flow. The OAuth client ID
and secret identify EvokeLoop; customers do not supply API credentials.

Enable Google Ads API in the same Cloud project. Test access only permits test
Ads accounts. Explorer or higher is needed for real accounts such as CLX. Google
retired developer tokens in September 2026; this adapter uses Cloud project access.

The consent audience must allow external customers. While the app is in Testing,
add the testing Google login to Audience → Test users; refresh tokens for Ads
expire after seven days in this mode. Complete Google's required brand/scope
verification and production setup before the public rollout. The requested scope
is `https://www.googleapis.com/auth/adwords`; Google provides no narrower read-only
Ads scope and its consent text includes editing and deletion.

Use the **standard web client** for this user-driven integration. Google requires
a separate client tagged for AI agents before adding agent workflows; do not reuse
these tokens for agent actions. This release adds no agentic routes or tools.

## Storage and lifecycle

- Uses the existing `app_private.channel_connections` and `channel_oauth_sessions`
  tables with provider `google_ads`. No schema migration or dependency is required.
  Existing RLS/private-schema configuration is retained. No public API grants added.
- OAuth state is random, hashed, time-limited, single-use, cookie-bound and bound
  to the initiating EvokeLoop user and workspace. PKCE verifiers, OAuth grants and
  pending account lists are encrypted at rest. Tokens never reach the browser.
- Account selection is server-validated against that consent's discovered accounts,
  and each selected account is verified again before committing the connections.
- Expiring access tokens refresh on use. Refresh tokens are tied to the original
  OAuth client. Version checks prevent refresh/verification races from overwriting
  a reconnect or resurrecting a disconnected account. Revoked grants require reconnect.
- Disconnect removes the stored credentials for that workspace account. It does
  not delete campaigns or globally revoke the Google project grant, which could
  also disconnect the same person's other accounts/workspaces. Users can revoke
  the entire EvokeLoop grant from their Google Account's third-party access settings.
- Cancelling account selection erases the pending grant. Unused pending sessions
  expire after ten minutes and are cleaned up on subsequent Google connection attempts.
- Connected/disconnected events use the existing workspace audit log with no secrets.

## Release verification

Run the Google provider, OAuth/database, and UI tests plus existing Meta OAuth and
Insights regressions. Run TypeScript and production build, then the Google desktop
and mobile cases in `scripts/check-channel-layout.mjs`. CI runs the complete suite.

After deployment and server configuration, a workspace admin must complete the
real Google consent screen, choose a CLX account, check the connection, disconnect,
and reconnect. Automated fixtures cannot establish that Google has approved the
project or that the supplied client credentials are valid. This walkthrough must
not publish ads, change budgets, or remove campaigns.

Local validation on October 21, 2026: all 82 focused Google, Meta, and Insights
tests passed, along with TypeScript, the frontend/server/worker builds, and all
12 Google desktop/mobile browser cases (including 375×600). Picker and disconnect
screenshots were visually inspected. A broader local run passed 1,332 tests;
seven existing database-dependent suites could not pass without an isolated
PostgreSQL test database (one failed test and 59 skipped tests, including the
existing live-access skip). CI's PostgreSQL-backed full suite remains required
before merging. The live Google consent flow has not been exercised.

References:

- https://developers.google.com/google-ads/api/docs/oauth/multi-user-authentication
- https://developers.google.com/google-ads/api/docs/account-management/listing-accounts
- https://developers.google.com/google-ads/api/docs/account-management/get-account-hierarchy
- https://developers.google.com/google-ads/api/docs/api-policy/access-levels
- https://support.google.com/cloud/answer/15549257
- https://support.google.com/cloud/answer/15549945

## Reporting in the studios

Use **Integrations → Google Ads → Open Google Ads reports**, or choose Google Ads
under **Insights Studio → Accounts & dates**. The Google preset includes spend,
impressions, clicks, click CTR, CPC, conversions, conversion value, purchases,
purchase value, and purchase ROAS. Campaign details include Performance Max and
historical paused/removed campaigns with reported activity. Up to 30 campaigns
are shown in spend order; account totals use the account-level query, not this
limited display. Date comparisons, report schedules, PDFs, and independent
dashboard widgets use the existing Insights pipeline.

Google Display creative formats are labeled **Google Ads · Display**. Activation
and Optimization studios link to Google reporting and identify their publishing
and optimization limitations.

Dates use each Ads account's timezone. Standard Google `metrics.conversions`
and `metrics.conversions_value` are interaction-date metrics, following the
account's Conversions columns. Purchase metrics query the PURCHASE conversion
category separately; other goals are never counted as purchases. Spend is
converted from micros; conversion values are already in account currency.
Fractional conversion attribution is preserved. Google clicks/CTR are separate
from Meta link clicks/link CTR. Sources and currencies are not aggregated.

Only fixed GAQL SELECT queries are sent. The server validates dates/customer IDs,
uses the workspace's connected account and manager header, paginates reads,
refreshes access tokens, and retries an expired access token once. Failed
breakdowns are marked unavailable, and do not erase available totals or turn
missing data into zero. Scheduled runs recheck the editor's workspace access.

The worker needs the **same** `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`,
`APP_ORIGIN`, and `INTEGRATION_TOKEN_ENCRYPTION_SECRET` as the web service.
Use a shared private Render environment group or the Blueprint service references.
Existing account connections do not need to be recreated for reporting.

API references checked October 21, 2026:
- https://developers.google.com/google-ads/api/docs/reporting/overview
- https://developers.google.com/google-ads/api/docs/reporting/paging
- https://developers.google.com/google-ads/api/docs/conversions/reporting
