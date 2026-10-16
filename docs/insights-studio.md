# Insights Studio

Measure keeps its place in the marketing loop. Its dashboard and the main workspace dashboard now support private, named layouts. Insights Studio configures reusable report definitions through Scope, Report setup, Schedule & delivery, Review & run, and Results.

## Reporting model

- `app_private.insight_reports` owns account IDs, selected metrics, reporting period, timezone, comparisons, output sections, schedule, and delivery preferences. Edits use optimistic revisions. Saving an unchanged report does not create a new revision.
- `insight_runs` preserves the definition and revision used at queue time, source-specific results, status, and delivery state. PDFs are generated from that immutable result.
- `insight_dashboards` stores per-user, per-workspace layouts for the main and Measure dashboards. Widgets reference a report and optionally an account/metric; they do not copy the report configuration. Layouts support add/remove, ordering, width, and height.
- All tables are in the existing private schema, with RLS enabled and no public Data API policies. Every API operation checks current workspace membership; report changes and runs require owner, admin, creator, or publisher access. Reviewers may read reports and edit their own dashboard layouts.

## Data and interpretation

Current data sources are the existing Meta advertising and Facebook Page connections. Advertising attribution and provider reporting timezone are retained. Accounts and currencies are kept separate; purchase value means platform-attributed value, not deduplicated business revenue. Missing data stays unavailable. CTR and cost per purchase are calculated from account totals, never averages of daily ratios. Facebook followers are a current snapshot; post-level engagement is lifetime engagement. Daily Page series retain provider period-end dates.

The executive summary describes measured changes using deterministic calculations. It does not claim causality or consume AI credits. Reports include selected KPIs, optional summary/charts/details, source notes, and methodology. Detail tables include at most 30 campaigns/posts per source. Up to eight sources can be selected per report. Custom reporting ranges support up to one year; recurring reports require a rolling period. Charts preserve missing-day gaps.

## Scheduling and delivery

The existing worker queues due reports and processes them. Daily, weekly, and monthly schedules use IANA timezones. Monthly days clamp to the last day of shorter months. DST gaps or repeated times shift to the next unambiguous local minute. Start/end dates are inclusive. Missed runs are consolidated into one catch-up run using the current reporting period; active runs are not duplicated. Queue leases recover interrupted workers. A unique report/schedule-slot key prevents duplicate scheduled runs.

The web process delivers completed report notifications using `REPORT_RESEND_API_KEY` / `REPORT_EMAIL_FROM`, falling back to the existing `CONTACT_RESEND_API_KEY` / `CONTACT_EMAIL_FROM`. `APP_ORIGIN` supplies secure report links. Email controls are disabled when configuration is missing. No addresses or schedules are enabled automatically.

Recipients must be active workspace members and are checked again before delivery. Manual runs send email only when explicitly selected. Delivery includes summary + authenticated report link and optionally the PDF. Provider idempotency keys, frozen recipient/sender snapshots, leases, and retries bounded to the provider's 24-hour window prevent duplicate notifications. Delivery state means the email provider accepted the message, not guaranteed inbox delivery. Failures are visible in Results and saved reports. No live email was sent during automated verification.

Pause schedule is available even if a source has disconnected. Queued scheduled runs are skipped after a pause; an already-running read may complete. If the saved schedule editor loses access, the schedule pauses and requires an authorized editor to save it again. Archiving also removes the report from active dashboards and prevents queued delivery.

## Deployment

Migration `0016_insights_studio.sql` creates only the three new tables and their indexes. Deploy the web service first: the existing startup command applies Drizzle migrations before serving traffic. Then deploy the worker. Existing workflows and data remain unchanged. Both services must be live for scheduled reports to run and deliver.

## Verification

Database-backed tests cover configuration, rolling periods, timezone/DST handling, workspace isolation, role restrictions, report revisions, immutable results, partial provider failures, queue recovery, schedule deduplication, PDF output, notification retries, and private dashboard layouts. UI tests cover category navigation, complete configuration submission, and explicit manual email selection. A separate browser QA fixture exercises real components at 1440, 768, 390, and 360 pixels with synthetic data; no provider writes or real notifications are sent.
