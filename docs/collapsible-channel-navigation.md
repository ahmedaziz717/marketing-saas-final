# Channel navigation and analytics sections

This UI-only change builds on the Facebook-first staging release. There are no
schema, credential, publishing-policy, provider-call or advertising-budget changes.

## Navigation

- Social Media expands to Facebook, Instagram (planned) and TikTok (planned).
- Advertising expands to Meta Ads, Google Ads (planned) and Microsoft Ads (planned).
- Analytics expands to Overview, Advertising and Social Media.
- Groups are independent, remember their open state when storage is available,
  and open automatically for direct links. Toggling a group does not navigate.
- Collapsed desktop icons expand the rail before showing children. Selecting a
  real destination closes the mobile drawer. Planned channels are not fake links.
- Disclosure buttons expose aria-expanded and aria-controls; links expose
  aria-current. Escape inside a group closes it and focuses the parent.

The same WorkspaceNavigation component accepts additional items without adding
horizontal tabs. Existing source, library, publishing and settings routes remain.

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
