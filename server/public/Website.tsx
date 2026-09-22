import React from "react";
import { EvokeLoopLogo, MarketingLoop } from "../../shared/brand";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Layers3,
  Sparkles,
  CalendarDays,
  ShieldCheck,
  ChartNoAxesCombined,
  CircleCheck,
  Link2,
  MoveUpRight,
  Image,
  SlidersHorizontal,
  MousePointer2,
} from "lucide-react";
import { FAQ, PILLARS, type WebsiteProfile } from "../../shared/publicWebsite";
import { PROPOSED_PLANS } from "../../shared/frameProduct";
import { ARTICLES } from "./content";
import { dashboardHref } from "../lib/siteOrigins";

type Props = {
  path: string;
  profile: WebsiteProfile;
  formToken: string;
  error?: string;
  topic?: string;
  receipt?: { state: string; createdAtMs: number; updatedAtMs: number } | null;
  unavailable?: boolean;
};
const Arrow = () => <ArrowRight size={17} aria-hidden="true" />;

export function PublicWebsite(props: Props) {
  const { path, profile } = props;
  const legal =
    path === "/privacy" || path === "/terms" || path === "/data-deletion";
  return (
    <div className="evokeloop-website">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <div className="container header-inner">
          <a href="/" className="brand" aria-label="EvokeLoop home">
            <EvokeLoopLogo />
          </a>
          <nav aria-label="Main navigation" className="desktop-nav">
            <a
              href="/product"
              aria-current={path.startsWith("/product") ? "page" : undefined}
            >
              Platform
            </a>
            <a
              href="/integrations"
              aria-current={path === "/integrations" ? "page" : undefined}
            >
              Integrations
            </a>
            <a
              href="/pricing"
              aria-current={path === "/pricing" ? "page" : undefined}
            >
              Pricing
            </a>
            <a href="/security">Trust</a>
            <a href="/about">Company</a>
          </nav>
          <div className="header-actions">
            <a href={dashboardHref("/login")} className="login-link">
              Sign in
            </a>
            <a href="/contact?topic=access" className="button small">
              Request access <Arrow />
            </a>
          </div>
          <details className="mobile-nav">
            <summary aria-label="Open navigation">
              <span>Menu</span>
              <ChevronDown size={18} />
            </summary>
            <nav aria-label="Mobile navigation">
              <a href="/product">Platform</a>
              <a href="/integrations">Integrations</a>
              <a href="/pricing">Pricing</a>
              <a href="/security">Trust</a>
              <a href="/about">Company</a>
              <a href="/contact">Contact</a>
              <a href={dashboardHref("/login")}>Sign in</a>
              <a href="/contact?topic=access">Request access</a>
            </nav>
          </details>
        </div>
      </header>
      <main id="main">
        {path === "/" ? (
          <Home />
        ) : path === "/product" ? (
          <Product />
        ) : path.startsWith("/product/") ? (
          <PillarPage id={path.split("/")[2]} />
        ) : path === "/integrations" ? (
          <Integrations />
        ) : path === "/pricing" ? (
          <Pricing />
        ) : path === "/about" ? (
          <About profile={profile} />
        ) : path === "/contact" ? (
          <Contact {...props} />
        ) : path.startsWith("/request-status/") ? (
          <Receipt {...props} />
        ) : ARTICLES[path] ? (
          <Article {...props} />
        ) : (
          <div className="container section">
            <h1>Page not found.</h1>
            <a className="button" href="/">
              Back to EvokeLoop
            </a>
          </div>
        )}
        {legal && (
          <div className="container legal-company">
            <Business profile={profile} />
          </div>
        )}
      </main>
      <footer className="site-footer">
        <div className="container footer-top">
          <div className="footer-brand">
            <a href="/" className="brand">
              <EvokeLoopLogo reversed />
            </a>
            <p>
              Marketing that gets smarter
              <br />
              every time it runs.
            </p>
            <span className="eyebrow">
              Create / Activate / Measure / Optimize
            </span>
          </div>
          <div>
            <h2>Platform</h2>
            {PILLARS.map(p => (
              <a key={p.id} href={`/product/${p.id}`}>
                {p.name}
                {p.id === "optimize" && " (roadmap)"}
              </a>
            ))}
            <a href="/integrations">Integrations</a>
            <a href="/pricing">Proposed pricing</a>
          </div>
          <div>
            <h2>Company</h2>
            <a href="/about">About EvokeLoop</a>
            <a href="/contact">Contact & support</a>
            <a href="/contact?topic=access">Request access</a>
            <a href="/security">Security & trust</a>
            <a href={dashboardHref("/login")}>Sign in</a>
          </div>
          <div>
            <h2>Data & policies</h2>
            <a href="/privacy">Privacy notice</a>
            <a href="/terms">Preview terms</a>
            <a href="/data-deletion">Data deletion</a>
            {profile.supportEmail && (
              <a href={`mailto:${profile.supportEmail}`}>
                {profile.supportEmail}
              </a>
            )}
          </div>
        </div>
        <div className="container footer-bottom">
          <p>
            &copy; {new Date().getUTCFullYear()}{" "}
            {profile.operatorName || "EvokeLoop"}.{" "}
            {profile.operatorName
              ? "EvokeLoop is a product of this business."
              : "Pre-release product website."}
          </p>
          <p>Independent software. Not affiliated with or endorsed by Meta.</p>
        </div>
      </footer>
    </div>
  );
}
function Intro({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="container page-intro">
      <p className="eyebrow">
        <span className="dot" />
        {eyebrow}
      </p>
      <h1>{title}</h1>
      <div className="intro-copy">{children}</div>
    </section>
  );
}
function CTA() {
  return (
    <section className="container cta">
      <div>
        <p className="eyebrow">YOUR NEXT BETTER MOVE</p>
        <h2>
          Start something.
          <br />
          <em>Keep improving it.</em>
        </h2>
        <p>Bring your next campaign into one connected workflow.</p>
      </div>
      <div className="cta-actions">
        <a className="button" href="/contact?topic=access">
          Explore early access <Arrow />
        </a>
        <a href="/product" className="text-link">
          Take a closer look <MoveUpRight size={16} />
        </a>
      </div>
    </section>
  );
}
function StudioVisual() {
  return (
    <div
      className="hero-visual"
      aria-label="Illustration of the EvokeLoop creative and approval workflow, not customer results"
    >
      <div className="studio-window">
        <div className="window-top">
          <span>
            <EvokeLoopLogo symbol /> Content Studio
          </span>
          <span className="window-label">Illustrative workspace</span>
        </div>
        <div className="window-body">
          <aside aria-hidden="true">
            <span className="mock-active">
              <Layers3 size={16} />
              Create
            </span>
            <span>
              <CalendarDays size={16} />
              Activate
            </span>
            <span>
              <ChartNoAxesCombined size={16} />
              Measure
            </span>
            <span>
              <SlidersHorizontal size={16} />
              Optimize
            </span>
          </aside>
          <div className="creative-board">
            <div className="board-heading">
              <div>
                <span className="eyebrow">Spring collection</span>
                <h3>Find your fresh angle.</h3>
              </div>
              <span className="tiny-pill">3 variations</span>
            </div>
            <div className="creative-tiles">
              {[
                "The everyday, elevated.",
                "A little more possibility.",
                "Made for your next move.",
              ].map((t, i) => (
                <div className={`creative-tile tile-${i}`} key={t}>
                  <span className="tile-brand">FORM / STUDIO</span>
                  <div className="bottle">
                    <span>FORM</span>
                    <small>daily essentials</small>
                  </div>
                  <p>{t}</p>
                </div>
              ))}
            </div>
            <div className="board-footer">
              <span>
                <Image size={14} /> Image assets
              </span>
              <span>
                Saved to working drafts <CircleCheck size={15} />
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="float-review">
        <span className="check-disc">
          <Check size={20} />
        </span>
        <div>
          <strong>The right version. Approved.</strong>
          <small>Ready for your next publishing step.</small>
        </div>
      </div>
      <div className="float-cursor" aria-hidden="true">
        <MousePointer2 size={22} />
        Your team
      </div>
      <div className="visual-caption">
        Create in Studio. Review in the library. Publish with approval.
      </div>
    </div>
  );
}
function Home() {
  const icons = [
    Sparkles,
    CalendarDays,
    ChartNoAxesCombined,
    SlidersHorizontal,
  ];
  return (
    <>
      <section className="hero-band">
        <div className="container hero">
          <div className="hero-copy">
            <p className="eyebrow">
              <span className="dot" /> THE INTELLIGENT MARKETING LOOP
            </p>
            <h1>
              Marketing that
              <br className="desktop-break" /> gets smarter
              <br />
              <em>every time it runs.</em>
            </h1>
            <p className="hero-lede">
              From your first idea to your next better decision. Connect
              creative, campaigns and performance in one marketing workspace.
            </p>
            <div className="button-row">
              <a href="/contact?topic=access" className="button">
                Explore early access <Arrow />
              </a>
              <a href="/product" className="button secondary">
                Meet the platform <MoveUpRight size={16} />
              </a>
            </div>
            <p className="hero-note">
              <ShieldCheck size={15} /> Useful automation. Human control.
            </p>
          </div>
          <div className="hero-loop">
            <MarketingLoop />
            <p className="loop-disclosure">
              A connected workflow today. Automated optimization is on the
              roadmap.
            </p>
          </div>
        </div>
        <div className="container hero-bottom">
          <span>CREATIVE ENERGY. CONTINUOUS IMPROVEMENT.</span>
          <a href="#the-platform">
            Discover the loop <ChevronDown size={15} />
          </a>
        </div>
      </section>
      <section
        className="container stack-band"
        aria-label="Integration availability"
      >
        <p>
          Built around
          <br />
          <strong>your marketing world.</strong>
        </p>
        <div>
          <span>
            Facebook <small>In setup</small>
          </span>
          <span>
            Meta Ads <small>In setup</small>
          </span>
          <span>
            Shopify <small>Preview</small>
          </span>
          <span>
            BigCommerce <small>Preview</small>
          </span>
          <a href="/integrations">
            See all integrations <Arrow />
          </a>
        </div>
      </section>
      <section id="the-platform" className="container section platform-intro">
        <div>
          <p className="eyebrow">ONE CONNECTED SYSTEM</p>
          <h2>
            Your best work shouldn't
            <br />
            <em>start from zero.</em>
          </h2>
        </div>
        <p>
          Ideas become creative. Creative becomes campaigns. Results inform what
          happens next. EvokeLoop is designed to keep that context moving with
          you, instead of leaving it scattered across tools.
        </p>
      </section>
      <section
        className="container pillar-grid"
        aria-label="EvokeLoop platform capabilities"
      >
        {PILLARS.map((p, i) => {
          const Icon = icons[i]!;
          return (
            <article
              id={p.id}
              key={p.id}
              className={`pillar-card pillar-${p.id}`}
            >
              <div className="card-top">
                <span className="pillar-number">
                  {p.number} / {p.name}
                </span>
                <span className="availability">{p.status}</span>
              </div>
              <div className="pillar-icon">
                <Icon size={28} />
              </div>
              <h3>{p.headline}</h3>
              <p>{p.description}</p>
              <div className="feature-tags">
                {p.items.slice(0, 3).map(item => (
                  <span key={item}>{item}</span>
                ))}
              </div>
              <a className="text-link" href={`/product/${p.id}`}>
                Explore {p.name.toLowerCase()} <Arrow />
              </a>
            </article>
          );
        })}
      </section>
      <section className="section studio-story">
        <div className="container">
          <div className="section-heading">
            <div>
              <p className="eyebrow">FROM POSSIBILITY TO READY</p>
              <h2>
                Create freely.
                <br />
                <em>Move forward deliberately.</em>
              </h2>
            </div>
            <p>
              Keep the experiments in your Studio.
              <br />
              Give your strongest ideas a clear path to approval.
            </p>
          </div>
          <StudioVisual />
        </div>
      </section>
      <section className="container section control-story">
        <div>
          <p className="eyebrow">
            AUTONOMOUS IN AMBITION. ACCOUNTABLE BY DESIGN.
          </p>
          <h2>
            Your team stays
            <br />
            <em>in the loop.</em>
          </h2>
          <p>
            Approving a creative isn't the same as publishing a campaign. Keep
            the right person in control of every decision that matters.
          </p>
          <a className="text-link" href="/security">
            Explore the safeguards <Arrow />
          </a>
        </div>
        <div className="control-steps">
          {[
            [
              "01",
              "Make room for ideas.",
              "Create, upload and refine. Working drafts stay in Content Studio.",
            ],
            [
              "02",
              "Choose what moves forward.",
              "Submit a version. An authorized reviewer approves it or requests changes.",
            ],
            [
              "03",
              "Give delivery its own approval.",
              "Review the final caption, destination and schedule before publishing.",
            ],
            [
              "04",
              "Bring the learning back.",
              "Use available channel reports to inform your next brief and decisions.",
            ],
          ].map(([n, t, d]) => (
            <article key={n}>
              <span>{n}</span>
              <div>
                <h3>{t}</h3>
                <p>{d}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="connected-band">
        <div className="container section integration-teaser">
          <div>
            <p className="eyebrow">YOUR ACCOUNTS. YOUR AUTHORIZATION.</p>
            <h2>
              Connected by you.
              <br />
              <em>Working together.</em>
            </h2>
            <p>
              Bring your catalog into the creative process. Connect your own
              business channels when available. One workspace, without handing
              over control.
            </p>
            <a className="text-link" href="/integrations">
              Explore integration availability <Arrow />
            </a>
          </div>
          <div className="connection-illustration">
            {[
              ["Facebook Pages", "Organic content and engagement", "In setup"],
              ["Meta Ads", "Paid activity and reporting", "In setup"],
              [
                "Shopify / BigCommerce / WooCommerce",
                "Product catalog imports",
                "Preview",
              ],
              [
                "More channels & email",
                "Expanding your connected workflow",
                "Planned",
              ],
            ].map(([name, desc, state]) => (
              <div className="connection-row" key={name}>
                <span className="provider-letter">
                  <Link2 size={20} />
                </span>
                <div>
                  <strong>{name}</strong>
                  <small>{desc}</small>
                </div>
                <span className="availability">{state}</span>
              </div>
            ))}
            <p className="fineprint">
              Meta connection availability depends on platform setup, review and
              customer authorization. No shared advertiser accounts.
            </p>
          </div>
        </div>
      </section>
      <section className="container section faq-section">
        <div>
          <p className="eyebrow">A LITTLE CLARITY</p>
          <h2>
            Good questions.
            <br />
            <em>Clear answers.</em>
          </h2>
          <p>
            What works today. What's next.
            <br />
            And where you stay in control.
          </p>
        </div>
        <div className="faq-list">
          {FAQ.map(([q, a]) => (
            <details key={q}>
              <summary>
                {q}
                <ChevronDown size={19} />
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>
      <CTA />
    </>
  );
}
function Product() {
  return (
    <>
      <Intro
        eyebrow="THE EVOKELOOP PLATFORM"
        title="One loop. A clearer next move."
      >
        <p>
          Creative energy meets a repeatable cycle of learning and improvement.
          Explore the connected workspace, and see exactly what is available
          today.
        </p>
      </Intro>
      <section className="container product-cycle">
        <div>
          <h2>
            Not four disconnected tools.
            <br />
            <em>One continuous system.</em>
          </h2>
          <p>
            Create content. Activate approved work. Measure available results.
            Bring those insights into the next iteration.
          </p>
          <p className="fineprint">
            The loop describes the product vision. Automated optimization is
            planned; current decisions remain under your control.
          </p>
        </div>
        <MarketingLoop />
      </section>
      <section className="container section capability-grid">
        {PILLARS.map(p => (
          <article className="capability" key={p.id}>
            <div className="card-top">
              <span className="pillar-number">
                {p.number} / {p.name}
              </span>
              <span className="availability">{p.status}</span>
            </div>
            <h3>{p.headline}</h3>
            <p>{p.description}</p>
            <a className="text-link" href={`/product/${p.id}`}>
              Explore {p.name.toLowerCase()} <Arrow />
            </a>
          </article>
        ))}
      </section>
      <CTA />
    </>
  );
}
function PillarPage({ id }: { id: string }) {
  const p = PILLARS.find(p => p.id === id);
  if (!p) return null;
  return (
    <>
      <Intro eyebrow={`${p.name} / ${p.status}`} title={p.headline}>
        <p>{p.description}</p>
      </Intro>
      <section className="container capability-grid">
        {p.items.map((i, n) => (
          <article className="capability" key={i}>
            <span className="step-number">0{n + 1}</span>
            <h2>{i}</h2>
            <p>
              {p.id === "create"
                ? [
                    "Turn selected brand and product inputs into creative variations. Review the result rather than treating generation as approval.",
                    "Organize the logos, product images and reference material your team is authorized to use.",
                    "Keep drafts in Studio. Send only selected versions to the library's Needs Review queue, preserving original versions.",
                    "Upload existing images, videos and creator content. UGC is a classification, not a duplicate file store.",
                  ][n]
                : p.id === "activate"
                  ? [
                      "Prepare Facebook Page content separately from paid advertising. Customer consent determines the Page available to the workspace.",
                      "Inspect existing Meta campaigns and prepare paused image ads in existing ad sets. Budget editing and campaign activation remain outside this release.",
                      "Plan two Facebook posts a week by default, or choose your own cadence. Navigate into future weeks and months.",
                      "Review the caption, asset version, destination and schedule before delivery. Edits clear the relevant approval.",
                    ][n]
                  : p.id === "measure"
                    ? [
                        "View available connected-account results together or focus on paid and organic activity separately.",
                        "Select a reporting range and compare it with an equal prior period, keeping filter context visible.",
                        "Inspect supported Meta campaign and platform metrics. Missing provider metrics remain unavailable rather than invented zeros.",
                        "Keep spend grouped by account currency. Platform attribution is not claimed as deduplicated revenue or causal lift.",
                      ][n]
                    : [
                        "Planned: turn performance signals into reviewable suggestions, rather than unexplained automatic decisions.",
                        "Planned: evaluate allocation opportunities with explicit budget and permission controls.",
                        "Planned: distinguish experiments and incremental lift from platform attribution. Not available in the current release.",
                        "Planned: coordinate end-to-end marketing tasks on top of the existing permission and approval system.",
                      ][n]}
            </p>
          </article>
        ))}
      </section>
      <div className="container notice section-note">
        <ShieldCheck size={23} />
        <p>
          <strong>{p.status}.</strong> {p.next}
        </p>
      </div>
      {p.id === "create" && (
        <div className="container studio-wide">
          <StudioVisual />
        </div>
      )}
      <CTA />
    </>
  );
}
function Integrations() {
  const groups = [
    {
      name: "Social & advertising",
      entries: [
        [
          "Facebook Pages",
          "Meta setup pending",
          "Pages selected by the customer, organic posts and available Page reporting.",
        ],
        [
          "Meta Ads",
          "Meta setup pending",
          "Customer ad accounts, existing campaign reporting and paused image-ad creation.",
        ],
        [
          "Instagram & TikTok",
          "Planned",
          "Organic publishing is on the roadmap, not available in this release.",
        ],
        [
          "Google & Microsoft Ads",
          "Planned",
          "Paid-channel integrations are planned; listing them does not mean they are connected.",
        ],
      ],
    },
    {
      name: "Catalog & content",
      entries: [
        [
          "Shopify, BigCommerce & WooCommerce",
          "Preview",
          "Import products using supported read-only store credentials. This is not Meta catalog management.",
        ],
        [
          "Website import",
          "Preview",
          "Review imported product and brand material before using it in creative work.",
        ],
        [
          "Email providers & CMS",
          "Planned",
          "Email delivery and CMS publishing will be added alongside their creation workflows.",
        ],
      ],
    },
  ];
  return (
    <>
      <Intro
        eyebrow="A growing, connected workspace"
        title="Your stack, in the picture."
      >
        <p>
          Every customer connects their own accounts. Availability is explicit:
          a planned integration is not a working connection, and account consent
          is never permission to spend.
        </p>
      </Intro>
      <section className="container connect-flow">
        <h2>The Meta customer experience</h2>
        <div>
          {[
            "Choose Facebook or Meta Ads",
            "Authorize access with Meta",
            "Select your Page or ad account",
            "Review available capabilities",
          ].map((s, i) => (
            <p key={s}>
              <span>{i + 1}</span>
              {s}
            </p>
          ))}
        </div>
        <p className="fineprint">
          Intended self-service flow. Public onboarding depends on EvokeLoop's
          platform setup, Meta review, account eligibility and granted
          permissions. Customers do not create a developer app or enter
          EvokeLoop's credentials.
        </p>
      </section>
      {groups.map(g => (
        <section key={g.name} className="container section">
          <h2 className="section-label">{g.name}</h2>
          <div className="capability-grid">
            {g.entries.map(([t, s, d]) => (
              <article className="capability" key={t}>
                <div className="card-top">
                  <Link2 size={22} />
                  <span className="availability">{s}</span>
                </div>
                <h3>{t}</h3>
                <p>{d}</p>
              </article>
            ))}
          </div>
        </section>
      ))}
      <section className="container notice section-note">
        <ShieldCheck size={24} />
        <p>
          Manage account selection, reconnection and disconnection in{" "}
          <strong>Settings &gt; Integrations</strong>. Read our{" "}
          <a href="/privacy">Privacy notice</a> and{" "}
          <a href="/data-deletion">Data deletion instructions</a> before
          connecting.
        </p>
      </section>
      <CTA />
    </>
  );
}
function Pricing() {
  return (
    <>
      <Intro
        eyebrow="Proposed monthly pricing / USD"
        title="Room to start. Room to grow."
      >
        <p>
          A subscription for your workspace, with usage designed around your
          creative and marketing needs. These plans are proposals, not active
          subscriptions or an offer to charge your account.
        </p>
      </Intro>
      <section className="container pricing-grid">
        {PROPOSED_PLANS.map(p => (
          <article
            className={`price-card ${p.id === "growth" ? "featured" : ""}`}
            key={p.id}
          >
            <span className="eyebrow">
              {p.id === "growth" ? "Built for a growing team" : "Proposed plan"}
            </span>
            <h2>{p.name}</h2>
            <div className="price">
              {p.monthlyUsd ? (
                <>
                  ${p.monthlyUsd}
                  <small>/ month</small>
                </>
              ) : (
                "Custom"
              )}
            </div>
            <p>
              {p.id === "enterprise"
                ? "A conversation about larger-scale needs and requirements."
                : p.description}
            </p>
            <a
              className={`button ${p.id === "growth" ? "" : "secondary"}`}
              href="/contact?topic=access"
            >
              Discuss early access <Arrow />
            </a>
            <div className="price-details">
              <p>
                <Check size={16} />
                {p.credits
                  ? `${p.credits.toLocaleString("en-US")} proposed AI credits / month`
                  : "Custom usage structure"}
              </p>
              <p>
                <Check size={16} />
                {p.monthlyAdSpendUsd
                  ? `Proposed spend band: up to $${p.monthlyAdSpendUsd.toLocaleString("en-US")} / month`
                  : "Custom marketing scale"}
              </p>
              <p>
                <Check size={16} />
                Final feature limits to be confirmed
              </p>
            </div>
          </article>
        ))}
      </section>
      <div className="container notice section-note">
        <p>
          <strong>No checkout or automatic billing is active.</strong> Credit
          consumption, video allowances, overages, taxes and final commercial
          terms will be defined before purchase. Ad-spend bands refer to
          customer scale; advertising spend is not included in the subscription.
          Selecting a plan does not unlock an unfinished feature.
        </p>
      </div>
      <CTA />
    </>
  );
}
function Business({ profile: p }: { profile: WebsiteProfile }) {
  return (
    <section className="business-panel">
      <h2>Business information</h2>
      {p.operatorName ? (
        <>
          <p>
            <strong>EvokeLoop is operated by {p.operatorName}.</strong>
          </p>
          {p.businessAddress && (
            <p className="preserve-lines">{p.businessAddress}</p>
          )}
          {p.operatorWebsite && (
            <p>
              <a href={p.operatorWebsite} rel="noopener noreferrer">
                Operator website <MoveUpRight size={14} />
              </a>
            </p>
          )}
        </>
      ) : (
        <p>
          EvokeLoop is a pre-release marketing platform. The operator's verified
          legal details have not yet been published; they must be confirmed
          before public launch and Meta verification submission.
        </p>
      )}
      <div className="business-contacts">
        {p.supportEmail && (
          <p>
            Support: <a href={`mailto:${p.supportEmail}`}>{p.supportEmail}</a>
          </p>
        )}
        {p.privacyEmail && (
          <p>
            Privacy: <a href={`mailto:${p.privacyEmail}`}>{p.privacyEmail}</a>
          </p>
        )}
        <p>
          <a href="/contact">Public contact form</a> /{" "}
          <a href="/data-deletion">Request data deletion</a>
        </p>
      </div>
      {!p.disclosuresApproved && (
        <p className="draft-notice">
          <strong>Pre-release disclosure draft.</strong> Operator details and
          these policies still need approval by the platform operator before use
          in a Meta verification submission.
        </p>
      )}
    </section>
  );
}
function About({ profile }: { profile: WebsiteProfile }) {
  return (
    <>
      <Intro eyebrow="About EvokeLoop" title="Marketing works better together.">
        <p>
          EvokeLoop is a self-service software platform being built for business
          teams that want their creative work, channel activity and measurement
          in one place.
        </p>
      </Intro>
      <section className="container about-grid">
        <div>
          <h2>
            One connected process.
            <br />
            <em>Not four disconnected tools.</em>
          </h2>
          <p>
            Start with brand and product knowledge, turn it into creative work,
            move selected versions through review, and prepare channel-specific
            delivery. Bring the resulting performance information back into the
            same workspace.
          </p>
          <p>
            Our direction is Create, Activate, Measure and Optimize. We are
            rolling it out in stages: creative production and review first,
            Facebook-first activation and reporting next, with broader channels,
            attribution and optimization on the roadmap.
          </p>
          <p>
            EvokeLoop is software for customers to use with their own authorized
            accounts. It is not a single advertiser's account, a promise to
            manage every campaign for you, or an official Meta product.
          </p>
          <a className="text-link" href="/product">
            See current capabilities <Arrow />
          </a>
        </div>
        <Business profile={profile} />
      </section>
      <CTA />
    </>
  );
}
function ContactForm({
  formToken,
  topic = "support",
  error,
}: Pick<Props, "formToken" | "topic" | "error">) {
  return (
    <form className="contact-form" action="/public/request" method="post">
      <input type="hidden" name="formToken" value={formToken} />
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="form-grid">
        <label>
          Your name
          <input name="name" autoComplete="name" maxLength={120} required />
        </label>
        <label>
          Email address
          <input
            name="email"
            type="email"
            autoComplete="email"
            maxLength={254}
            required
          />
        </label>
      </div>
      <label>
        How can we help?
        <select name="topic" defaultValue={topic}>
          <option value="access">Early access</option>
          <option value="demo">Product walkthrough</option>
          <option value="support">Support</option>
          <option value="privacy">Privacy question or request</option>
          <option value="deletion">Data deletion request</option>
        </select>
      </label>
      <label>
        Business or workspace reference <span>(optional)</span>
        <input name="workspace" maxLength={200} />
      </label>
      <label>
        Message
        <textarea
          name="message"
          rows={5}
          minLength={10}
          maxLength={4000}
          required
          placeholder={
            topic === "deletion"
              ? "Describe which data you want removed and your relationship to the workspace. Do not include passwords or tokens."
              : "Tell us about your request. Please do not include passwords, tokens or sensitive personal information."
          }
        />
      </label>
      <div className="form-trap" aria-hidden="true">
        <label>
          Leave this field empty
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <label className="checkbox-label">
        <input name="acknowledgement" type="checkbox" value="yes" required />
        <span>
          I have read the <a href="/privacy">Privacy notice</a> and understand
          EvokeLoop will use this information to handle my request. Identity or
          business authority may need to be verified.
        </span>
      </label>
      <button className="button" type="submit">
        {topic === "deletion" ? "Submit deletion request" : "Send request"}
        <Arrow />
      </button>
      <p className="fineprint">
        Your request is stored in EvokeLoop's private platform inbox. A receipt
        is not confirmation that a demo is booked, access is granted or data is
        deleted. No marketing subscription is added.
      </p>
    </form>
  );
}
function Contact(props: Props) {
  return (
    <>
      <Intro
        eyebrow="Talk to the EvokeLoop team"
        title="Let's make your next move."
      >
        <p>
          Ask about early access, explore the product, get help, or make a
          privacy request. No EvokeLoop account is needed to contact us.
        </p>
      </Intro>
      <section className="container contact-grid">
        <div>
          <p className="eyebrow">A real request, not a dead-end form</p>
          <h2>
            Tell us what
            <br />
            <em>you have in mind.</em>
          </h2>
          <p>
            We save your request and provide a private status link. Keep it for
            reference while the platform team reviews your message.
          </p>
          <p>
            For deletion requests, identify the data and the workspace where
            possible. Do not send credentials or identity documents through this
            form.
          </p>
          <Business profile={props.profile} />
        </div>
        <ContactForm {...props} />
      </section>
    </>
  );
}
function Article(props: Props) {
  const page = ARTICLES[props.path];
  return (
    <>
      <Intro eyebrow={page.eyebrow} title={page.title}>
        <p>{page.intro}</p>
      </Intro>
      <div className="container article-layout">
        <nav aria-label="Policy sections" className="article-toc">
          {page.sections.map((s, i) => (
            <a key={s.title} href={`#section-${i + 1}`}>
              {s.title}
            </a>
          ))}
          <a href="/contact">Contact the team</a>
        </nav>
        <article className="policy-content">
          {!props.profile.disclosuresApproved && (
            <div className="draft-notice">
              <strong>Pre-release draft.</strong> This document describes the
              current preview. The operator must confirm its business details
              and approve these disclosures before public launch or Meta
              submission.
            </div>
          )}
          {page.sections.map((s, i) => (
            <section key={s.title} id={`section-${i + 1}`}>
              <h2>{s.title}</h2>
              {s.paragraphs.map(p => (
                <p key={p}>{p}</p>
              ))}
            </section>
          ))}
          {props.path === "/data-deletion" && (
            <section id="request">
              <h2>Submit your deletion request</h2>
              <ContactForm {...props} topic="deletion" />
            </section>
          )}
          <p className="policy-related">
            Related: <a href="/privacy">Privacy</a> /{" "}
            <a href="/data-deletion">Data deletion</a> /{" "}
            <a href="/terms">Terms</a> / <a href="/contact">Contact</a>
          </p>
        </article>
      </div>
    </>
  );
}
function Receipt({ receipt, unavailable }: Props) {
  return (
    <>
      <Intro
        eyebrow="Private request receipt"
        title={
          receipt
            ? "Your request is on record."
            : unavailable
              ? "Status temporarily unavailable."
              : "Request not found."
        }
      >
        <p>
          {receipt
            ? "Keep this private link to check the status of your request. It contains no public name, email or message."
            : unavailable
              ? "Please try this same link again later. This does not mean your request was lost."
              : "Check the full link you received after submitting. No request details are available at this address."}
        </p>
      </Intro>
      {receipt && (
        <section className="container receipt-panel">
          <CircleCheck size={32} />
          <h2>Status: {receipt.state.replaceAll("_", " ")}</h2>
          <p>
            Received: {new Date(receipt.createdAtMs).toISOString().slice(0, 10)}
          </p>
          <p>
            Last updated:{" "}
            {new Date(receipt.updatedAtMs).toISOString().slice(0, 10)}
          </p>
          <p>
            This is a saved-request receipt, not an automated email
            confirmation. The platform team may contact the email you supplied
            to verify identity or authority.
          </p>
          <p>
            A closed request does not by itself mean all requested data was
            deleted. The team must separately explain the outcome and any
            exceptions.
          </p>
        </section>
      )}
      <div className="container section">
        <a className="button secondary" href="/contact">
          Contact EvokeLoop <Arrow />
        </a>
      </div>
    </>
  );
}
