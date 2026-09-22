# EvokeLoop experience redesign - implementation plan

## Sequence and release boundaries
1. Finish the prepared domain-routing release and verify it independently.
   DNS/TLS are complete; do not claim auth cutover until Supabase allowlist,
   Site URL and email templates are confirmed. Preserve the working login.
2. Redesign the public product website using the supplied brand system.
3. Carry the same system through dashboard navigation, home, creation and review,
   publishing, analytics, settings and authentication surfaces.
4. Test real rendered public routes, UI fixtures, permissions and responsive
   layouts before merging into codex/render-supabase-migration and deploying.
   Do not change main or the original Manus app. No background-work promises.

## Source of truth
- Brand Brief, pp.1-2: connected marketing cycle, tagline, five traits,
  creation/activation/measurement/optimization, human control, domain strategy.
- Brand Guidelines v1.0, pp.3-5: use outlined master; no retyping/stretching,
  preserve connected oo, 160px visible wordmark minimum, clear space of half E.
- Brand Guidelines p.6: Ink Navy #0A1C26, Loop Teal #00B5A7, White #FFFFFF,
  Mint #C7F5EE, Mist #F1F7F7, Slate #526B76, Teal Ink #007F76.
  Navy text on teal primary buttons; dark teal for small links on white.
- Brand Guidelines p.7: Manrope 400-800 across marketing and product interface.
- Brand Guidelines p.8: useful, concrete, accountable; no guaranteed growth
  claims or autonomous features beyond what the implementation supports.
- Supplied primary SVG: keep original bytes. Approved dark reversal uses the
  same geometry with all navy lettering white; standalone oo uses the master
  path unchanged. Do not generate or redraw the logo.

## Creative direction
Navy editorial hero, confident sans-serif hierarchy, generous white space,
teal actionable accents, mint moments and quiet mist working surfaces.
The central visual is a closed four-stage cycle: Create > Activate > Measure >
Optimize > Create. It communicates the product vision, not a false claim of
live automated optimization. Four keyboard-accessible stage links and explicit
availability labels accompany the visual. Motion is subtle, can be paused,
and respects reduced-motion preferences. No fabricated customer logos,
testimonials, revenue statistics, awards or live activity.

## Public website
- Header: real SVG, concise navigation, clear sign-in and early-access actions.
- Home: exact core tagline, loop visual, stage stories, illustrative workflow,
  connected-account explanation, human approval model, FAQ and final CTA.
- Platform: same cycle and four detailed product areas, current/planned labels.
- Integrations: catalog support vs Meta setup vs future channels distinguished.
- Pricing: retain proposed plans and no active checkout/charging implication.
- Company/contact/security/privacy/terms/deletion: complete new visual treatment;
  preserve legal-identity draft state and functional private request intake.
- Every public route works as real HTML without executable JS. Responsive
  native menu, accessible FAQ and request forms remain. No new third-party JS.
- Manrope can use the existing Google Fonts delivery route; disclose font
  requests for both site and app if used. Do not distribute environment fonts.

## Dashboard
- Shared design tokens, Manrope-only heading hierarchy and consistent component
  radii, borders, focus rings, buttons, form controls, tabs and tables.
- Quiet navigation grouped by Create / Activate / Measure / Optimize; preserve
  independent collapsible channel groups, active states, links and mobile drawer.
- SVG logo in expanded sidebar; compact mode must not squash the wordmark.
- New persistent workspace toolbar with real destination links, no dead controls.
- Home becomes a task-oriented workspace: start, saved work, review, planning,
  loop navigation and explicit upcoming capabilities. Do not invent metrics.
- Restyle Content Studio and approved library handoff without changing its states:
  drafts in Studio > submit > Needs Review > approved > separate publish review.
- Authentication receives the same logo/layout/type; password/magic-link/signup
  behavior stays intact. Brand changes do not change existing accounts or roles.

## Verification gates
- TypeScript; production web and worker builds; full CI PostgreSQL + unit tests.
- Existing approval/dialog, channel-navigation and public-form regressions.
- Public layouts at 1440/1024/375/320px; app at desktop and phone widths.
- Logo aspect ratio and minimum visible width; no small white text on teal.
- Loop read order, links, motion pause and reduced-motion; no overflow.
- No executable JS required for public pages; no customer/auth data in public HTML.
- No credential, billing, live-social or live-ads activation; no DB changes.
- Final report separates verified deployment from operator-only auth setup.
