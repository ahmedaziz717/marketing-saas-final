# Insights Studio

Measure keeps its place in the marketing loop. Its dashboard and the main workspace dashboard now support private, named layouts. Insights Studio configures reusable report definitions through Scope, Report setup, Schedule & delivery, Review & run, and Results.

## Reporting model

- `app_private.insight_reports` owns account IDs, selected metrics, reporting period, timezone, comparisons, output sections, schedule, and delivery preferences. Edits use optimistic revisions. Saving an unchanged report does not create a new revision.
- `insight_runs` preserves the definition and revision used at queue time, source-specific results, status, and delivery state. PDFs are generated from that immutable result.
- `insight_dashboards` stores per-user, per-workspace layouts for the main and Measure dashboards. Each widget references its own private reporting entity, copied when it is pinned. Widget entities use `insight_reports.widgetOwnerUserId` and retain `sourceReportId` for provenance; they are excluded from the saved report library. Editing or archiving the original report does not alter its widgets. Layouts store the tile title, selected components, palette/custom colors, width, height, and order. Changes to widget settings and the layout commit atomically with optimistic revisions.
- All tables are in the existing private schema, with RLS enabled and no public Data API policies. Every API operation checks current workspace membership; shared report changes and runs require owner, admin, creator, or publisher access. Reviewers may read reports and manage/refresh their own private widgets. Every widget read, run, PDF, and layout save checks ownership as well as current workspace membership.

## Data and interpretation

Current data sources are connected Google Ads, Meta advertising and Facebook Pages. Advertising attribution and provider reporting timezone are retained. Accounts and currencies are kept separate; purchase value means platform-attributed value, not deduplicated business revenue. Missing data stays unavailable. CTR and cost per purchase are calculated from account totals, never averages of daily ratios. Facebook followers are a current snapshot; post-level engagement is lifetime engagement. Daily Page series retain provider period-end dates.

The executive summary describes measured changes using deterministic calculations. It does not claim causality or consume AI credits. Reports include selected KPIs, optional summary/charts/details, source notes, and methodology. Detail tables include at most 30 campaigns/posts per source. Up to eight sources can be selected per report. Custom reporting ranges support up to one year; recurring reports require a rolling period. Charts preserve missing-day gaps.

## Scheduling and delivery

The existing worker queues due reports and processes them. Daily, weekly, and monthly schedules use IANA timezones. Monthly days clamp to the last day of shorter months. DST gaps or repeated times shift to the next unambiguous local minute. Start/end dates are inclusive. Missed runs are consolidated into one catch-up run using the current reporting period; active runs are not duplicated. Queue leases recover interrupted workers. A unique report/schedule-slot key prevents duplicate scheduled runs.

The web process delivers completed report notifications using `REPORT_RESEND_API_KEY` / `REPORT_EMAIL_FROM`, falling back to the existing `CONTACT_RESEND_API_KEY` / `CONTACT_EMAIL_FROM`. `APP_ORIGIN` supplies secure report links. Email controls are disabled when configuration is missing. No addresses or schedules are enabled automatically.

Recipients must be active workspace members and are checked again before delivery. Manual runs send email only when explicitly selected. Delivery includes summary + authenticated report link and optionally the PDF. Provider idempotency keys, frozen recipient/sender snapshots, leases, and retries bounded to the provider's 24-hour window prevent duplicate notifications. Delivery state means the email provider accepted the message, not guaranteed inbox delivery. Failures are visible in Results and saved reports. No live email was sent during automated verification.

Pause schedule is available even if a source has disconnected. Queued scheduled runs are skipped after a pause; an already-running read may complete. If the saved schedule editor loses access, the schedule pauses and requires an authorized editor to save it again. Archiving prevents queued report delivery. Independently pinned widgets retain their own data and schedule. Removing a tile or deleting its layout archives that tile’s reporting entity and stops pending jobs. Widget refreshes never send email.

## Deployment

Migration `0016_insights_studio.sql` creates the three reporting tables and their indexes. Migration `0017_independent_dashboard_widgets.sql` adds ownership/provenance fields and detaches existing tiles, preserving layout order, sizes, last available results, and refresh schedules without changing source reports. No email settings are inherited. Deploy the web service first: the existing startup command applies Drizzle migrations before serving traffic. Then deploy the worker. Existing workflows and data remain unchanged. Both services must be live for scheduled reports to run and deliver.

## Verification

Database-backed tests cover configuration, rolling periods, timezone/DST handling, workspace isolation, role restrictions, report revisions, immutable results, partial provider failures, queue recovery, schedule deduplication, PDF output, notification retries, and private dashboard layouts. UI tests cover category navigation, complete configuration submission, and explicit manual email selection. A separate browser QA fixture exercises real components at 1440, 768, 390, and 360 pixels with synthetic data; no provider writes or real notifications are sent.

## Widget configuration

The dashboard editor has Content, Dates & refresh, and Style & size categories. Report widgets offer a component picker for executive summary, selected metrics, trend charts, and detail tables both when pinning and when editing from the dashboard. Titles default to the report/metric name, with custom text and an automatic-title reset. Date controls include presets, custom dates, and rolling day counts from 1 to 366. Independent daily/weekly/monthly refresh schedules use the same durable worker as reports. Content changes queue a new widget result; the last completed result remains visible while it runs. Pure title/color/size/component changes do not fetch data again.

The grid uses a 280px compact row and 16px gaps. Standard spans two rows (576px); tall spans three (872px), so two or three compact tiles exactly align with the corresponding larger tile including gaps. Dense placement fills vertical gaps. Widths are one third, one half, two thirds, and full; container queries collapse to two and then one column on smaller surfaces. Content scrolls within fixed tile bounds. Six coordinated palettes and custom background/text/chart colors apply consistently to headings, KPIs, charts, tables, controls, and metadata.

## Account scope, campaign status and chart controls

Report and widget editors show only the metrics/settings supported by selected accounts. Google-only reports hide Meta attribution fields and link-click metrics. Mixed reports retain each provider's meanings. Include inactive campaigns defaults off, including in the older Meta analytics screen. All totals, rows, chart points and comparisons use the same campaign scope; current campaign status applies to both date ranges. Historical saved snapshots retain their original data and are labelled for refresh when they predate this default.

Google details offer campaigns, ad groups, asset groups, ads, devices, user countries and account-local hours. Unsupported breakdowns remain explicitly unavailable. PMax asset-group totals are not individual-asset attribution. Account totals and displayed top-30 rows are separate.

Charts support area, line, columns, spend versus purchase value, ranking, distribution, tables and account comparisons. Weekly/monthly ratios are recalculated from aggregated numerators and denominators. Ratio and unit-cost metrics cannot be used for distributions; different or unknown currencies block monetary account comparison. Previous periods align by date offset, preserving missing days.

Dashboard date controls update only widgets set to Follow dashboard; Custom range widgets retain their own dates. Widget controls save and queue the corresponding report data. Duplicated charts receive independent private reporting entities. Starter layouts create compatible KPI, trend and ranking widgets for Google, Meta or mixed sources. Editing a widget through Dates & refresh uses the same date-source behavior.
