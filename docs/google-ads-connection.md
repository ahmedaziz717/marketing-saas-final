# Google Ads customer connections

Customers use **Integrations → Google Ads → Connect with Google**, authorize
EvokeLoop with their own Google login, and explicitly select up to 25 advertising
accounts. Direct accounts and clients below a manager account are discovered.
Workspace owners and admins manage connections; other members can see status.

This release implements account connectivity and access verification. Google Ads
campaign publishing, campaign changes, deletion, reporting, and AI-agent actions
are not implemented. Google credentials cannot pass into the Meta publishing or
workflow adapters. The Google transport only permits account listing and search.

## Server configuration

Set these on the existing EvokeLoop **web service** using its private environment
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
