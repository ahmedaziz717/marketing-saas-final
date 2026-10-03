# Activate Frame staging

The fresh Supabase database is ready. The Render app and worker have not been created yet. No merge into `main` is needed for staging.

## Confirmed resources

| Resource | Target |
| --- | --- |
| Supabase organization | Cybertron International, Inc. — `dnzqazuqjwfqylgnnhwu` |
| Supabase project | [frame-staging](https://supabase.com/dashboard/project/lxejhbtyfwpxlreuueyi) — Ohio |
| Render workspace | My Workspace — `tea-dak3afe743jc73fqgsv0` |
| Source branch | `codex/render-supabase-migration` |
| Migration review | [Draft PR #3](https://github.com/ahmedaziz717/marketing-saas-final/pull/3) |

Verified in Supabase: 18 application tables, zero application users or companies, a private `frame-assets` bucket, denied anonymous/customer direct table access and no security-advisor findings. The applied schema is also recorded in Drizzle's migration ledger, so app startup will not recreate it. Existing Manus data is not being imported.

## One-time secure setup

Use the Supabase project links below and enter the resulting values directly into Render. Do not paste passwords, API keys or database connection strings into chat or GitHub.

1. Open [Supabase Auth users](https://supabase.com/dashboard/project/lxejhbtyfwpxlreuueyi/auth/users). Create your own owner identity and complete or explicitly confirm your email verification through Supabase's account administration. Copy the user's UUID for `SUPABASE_OWNER_USER_ID`. Set this before the owner's first Frame login, because role assignment happens at first login. Also disable new-user signups in the project's Supabase Auth configuration during private staging. Frame's `AUTH_SIGNUP_ENABLED=false` controls its email-login flow; it does not change Supabase's provider settings.
2. Open the project's [Connect dialog](https://supabase.com/dashboard/project/lxejhbtyfwpxlreuueyi?showConnect=true). Obtain the **session pooler** PostgreSQL connection string, including the database password. If the password is unknown, set a new one through [Database settings](https://supabase.com/dashboard/project/lxejhbtyfwpxlreuueyi/settings/database); this project is fresh and has no deployed clients. Use the URI format with URL-encoded password characters and TLS (`sslmode=verify-full`). This is `DATABASE_URL` and, for this single-instance staging deployment only, also runs schema migrations. Do not use a transaction-pooler URL for schema deployment.
3. Open [Supabase API keys](https://supabase.com/dashboard/project/lxejhbtyfwpxlreuueyi/settings/api-keys). Copy the enabled publishable key to `SUPABASE_PUBLISHABLE_KEY` and a server secret key to `SUPABASE_SECRET_KEY`. The server secret stays in backend environment variables.
4. Have the project's OpenAI API key ready for `OPENAI_API_KEY`. Required model access must be checked before enabling the generation worker. The customer interface does not expose model names.

## Apply the prepared Render Blueprint

[Open the migration branch in Deploy to Render](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2Fahmedaziz717%2Fmarketing-saas-final%2Ftree%2Fcodex%2Frender-supabase-migration)

Choose **My Workspace**. Confirm that Render is reading `render.yaml` from **codex/render-supabase-migration**. Enter the five values above in its initial setup form and review the service costs before applying.

| Service | Prepared plan | Expected base cost |
| --- | --- | --- |
| `frame-staging` web app | Free; sleeps when idle | $0/month within free limits |
| `frame-staging-creatives` worker | `1c-2g` / Standard; 2 GB RAM | $25/month, prorated while running |
| Supabase project | Organization's quoted new-project cost | $0/month at creation; usage limits still apply |

Render worker charges apply even while `CREATIVE_WORKER_ENABLED=false`; that flag pauses job processing, not billing. AI usage, workspace fees and usage overages are separate. Review [Render's current prices](https://render.com/pricing) in the deployment screen. No paid Render service has been created on your behalf.

Render automatically supplies the web origin and generates the integration encryption secret. The worker references the same credentials. No manual secret environment group, copied encryption secret or merge into Manus is required. Automatic deployments are disabled initially so branch updates do not change staging without an explicit deploy.

## Finish authentication after Render assigns the app URL

1. In [Supabase Auth URL configuration](https://supabase.com/dashboard/project/lxejhbtyfwpxlreuueyi/auth/url-configuration), set the Site URL to the actual Render HTTPS app origin and add its exact `/api/auth/callback` URL to allowed redirects.
2. Verify delivery of the owner login email. Supabase's default sender restricts recipients; configure your approved SMTP provider before inviting customers. See [Supabase email delivery](https://supabase.com/docs/guides/auth/auth-smtp).
3. Open the Render app, sign in as the owner and create the company. Then verify saving, private uploads, previews and permissions using fresh products/assets.
4. After required model access is confirmed, enable `CREATIVE_WORKER_ENABLED=true` for one bounded generation check. Live ad changes remain disabled. Keep customer signups disabled until their complete onboarding and email flow is verified.

The connected Render tools can inspect and operate services once they exist, but do not expose multi-service Blueprint/worker creation. Supabase's connected tools also do not expose the project's database password, server secret or owner-creation operation. Those one-time Dashboard steps are the remaining setup boundary; no additional product-scope approval is needed.
