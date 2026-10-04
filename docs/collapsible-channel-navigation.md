# Channel navigation and analytics sections

This UI-only change builds on the Facebook-first staging release. There are no
schema, credential, publishing-policy, provider-call or advertising-budget changes.

## Navigation (workspace refresh, October 2026)

- Default desktop state is an 80px rail with text below each icon. Expanding it
  is an explicit action (logo hover/focus reveals “Expand sidebar”, or Ctrl/Cmd+B).
  The 240px expanded state is remembered on this browser; mobile uses a drawer.
- Primary destinations are Home, Create, Activate, Measure, Optimize, Library,
  Brand, and Settings. Platform administration remains an independent shell.
- A compact group opens a single anchored flyout. It does not expand the rail or
  navigate. Expanded groups use one disclosure at a time. Groups start closed,
  close on selection, and are never reopened by route changes or old preferences.
- Escape closes the flyout/disclosure and restores focus. Buttons expose
  aria-expanded and links expose aria-current. Selecting a destination closes
  the mobile drawer.
- Create contains Apps, Drafts, Campaign plans, and planned creative workflows.
  Activate contains channel management, Calendar, and planned automations.
  Measure retains distinct Overview, Advertising, and Social reports.
- The header keeps account switching visible in compact mode and offers
  Light, Dark, and System. Appearance is saved per browser and synchronized
  across tabs. System follows OS changes. Public marketing pages stay light.
- Planned destinations open explicitly labeled roadmap pages, never operational
  editors. Existing source, library, publishing, settings, and historical links
  continue to work.

## Channel pages

Facebook and Meta Ads no longer repeat channel tabs or connection-management
cards. Account selectors still select among existing connections. Empty states
explain that accounts are managed in Settings / Integrations with a simple link;
no connection mutation is performed from these pages. Integration cards and
OAuth flows in Settings are unchanged. The historical legacy request screen is
not redesigned in this patch.

## Analytics

/app/analytics is Overview; /app/analytics/advertising and /app/analytics/social
are scoped views. Old ?tab=advertising and ?tab=social links continue to work.
Dates, channel, account and comparison are URL-backed; changing sections keeps
applied dates and comparison and clears incompatible account/channel filters.
Each scoped view only offers and requests the corresponding account types.
Provider reporting, missing-metric treatment and attribution are unchanged.

## Verification

New component tests cover collapse, direct links, permissions-neutral planned
items, mobile closure, ten-channel lists and unavailable local storage. Analytics
tests cover scopes, URL restoration and date/channel/account filters. The Chrome
channel fixture now renders the actual dashboard sidebar and pages, including
connected and empty channel states, Analytics subsections, mobile navigation and
a ten-channel stress case. Fixtures use synthetic data, not a production session.

Navigation semantics reference: https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-navigation/
