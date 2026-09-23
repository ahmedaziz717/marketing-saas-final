# Evokeloop domain cutover

Public/app domain separation is activated when PUBLIC_SITE_ORIGIN differs from
APP_ORIGIN. Before that cutover, sign-in links and account routes on any attached
domain already redirect to the configured APP_ORIGIN. This keeps browser requests,
session cookies and email callbacks on the same origin while custom domains serve
the public website. Noncanonical POSTs are rejected and never replayed. Customer
data, cookie scope and existing API permissions stay intact.

1. Verify HTTPS on root, www and app domains; keep Render's subdomain enabled.
2. In Supabase Authentication > URL Configuration retain existing allowed URLs
   and add https://app.evokeloop.com/api/auth/callback and the same path with
   query matching: https://app.evokeloop.com/api/auth/callback?** . Never add a
   wildcard hostname. Review email templates: preserve their token-hash and
   deliberate confirmation flow, changing only any hard-coded old origin.
3. Coordinate Supabase Site URL https://app.evokeloop.com with the Render web
   settings below, after this code is deployed. These three values are nonsecrets;
   merge them without replacing other environment variables:

   APP_ORIGIN=https://app.evokeloop.com
   PUBLIC_SITE_ORIGIN=https://evokeloop.com
   LEGACY_SITE_ORIGINS=https://frame-staging.onrender.com,https://www.evokeloop.com

4. Apply matching APP_ORIGIN on the worker. No database or asset migration is needed.
5. Add https://app.evokeloop.com/api/channels/meta/callback to Meta's exact redirect
   allowlist before connection testing. This does not enable Meta posting or ads.
6. Test password login, signup/verification/password setup, magic links, password
   resets, invitations, logout, stored media and public request submission with a
   separately authorized test identity. Existing passwords/accounts remain valid.

App root redirects to /app; public documents opened on app redirect to website.
Existing /app/... routes are retained. Public forms authorize only the public
origin; dashboard APIs authorize only the app origin. Session cookies remain
host-only: sign in again on the new host. Legacy GET links redirect, but POSTs
are never replayed cross-host. Old PKCE flows need a new email; old token-hash
links retain their confirmation paths. Redirects are temporary and not cached.

If Supabase URL/email configuration cannot be verified, leave the three live
settings unchanged. Prepared routing is not the same as a verified auth cutover.
Rollback: restore prior APP_ORIGIN, unset PUBLIC_SITE_ORIGIN/LEGACY_SITE_ORIGINS,
redeploy and restore Supabase Site URL. Do not change any DNS or customer data.

References: https://render.com/docs/custom-domains ;
https://supabase.com/docs/guides/auth/redirect-urls ;
https://supabase.com/docs/guides/auth/auth-email-templates .
