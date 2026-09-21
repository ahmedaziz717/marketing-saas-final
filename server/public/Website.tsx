import React from "react";
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
const Mark = () => (
  <span className="brand-mark" aria-hidden="true">
    f
  </span>
);
export function PublicWebsite(props: Props) {
  const { path, profile } = props;
  const legal =
    path === "/privacy" || path === "/terms" || path === "/data-deletion";
  return (
    <div className="frame-website">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <div className="container header-inner">
          <a href="/" className="brand" aria-label="Frame home">
            <Mark />
            Frame<span className="preview-word">Preview</span>
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
            <a href="/login" className="login-link">
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
              <a href="/login">Sign in</a>
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
              Back to Frame
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
              <Mark />
              Frame
            </a>
            <p>
              Your next marketing move.
              <br />
              One connected workspace.
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
            <a href="/about">About Frame</a>
            <a href="/contact">Contact & support</a>
            <a href="/contact?topic=access">Request access</a>
            <a href="/security">Security & trust</a>
            <a href="/login">Sign in</a>
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
            {profile.operatorName || "Frame"}.{" "}
            {profile.operatorName
              ? "Frame is a product of this business."
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
        <p className="eyebrow">Your next chapter</p>
        <h2>
          Make room for
          <br />
          <em>better marketing.</em>
        </h2>
        <p>Explore the preview. Help shape what comes next.</p>
      </div>
      <div className="cta-actions">
        <a className="button light" href="/contact?topic=access">
          Request access <Arrow />
        </a>
        <a href="/contact?topic=demo" className="text-link">
          Talk to the Frame team <MoveUpRight size={16} />
        </a>
      </div>
    </section>
  );
}
function StudioVisual() {
  return (
    <div
      className="hero-visual"
      aria-label="Illustration of the Frame creative and approval workflow, not customer results"
    >
      <div className="studio-window">
        <div className="window-top">
          <span>
            <span className="mini-mark">f</span> Content Studio
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
  return (
    <>
      <section className="container hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="dot" />
            The marketing workspace, reimagined
          </p>
          <h1>
            Your marketing.
            <br />
            In one <em>Frame.</em>
          </h1>
          <p className="hero-lede">
            From the first creative idea to the next informed decision. Bring
            your content, channels and performance into one connected workspace.
          </p>
          <div className="button-row">
            <a href="/contact?topic=access" className="button">
              Explore early access <Arrow />
            </a>
            <a href="/product" className="button secondary">
              See the platform
            </a>
          </div>
          <p className="fineprint">
            Preview available. More channels and optimization tools on the
            roadmap.
          </p>
        </div>
        <StudioVisual />
      </section>
      <div className="container journey-strip">
        {PILLARS.map(p => (
          <a key={p.id} href={`#${p.id}`}>
            <span>{p.number}</span>
            <strong>{p.name}</strong>
            <Arrow />
          </a>
        ))}
      </div>
      <section className="container section platform-intro">
        <div>
          <p className="eyebrow">Less switching. More doing.</p>
          <h2>
            Not another tool.
            <br />
            <em>A place for the whole process.</em>
          </h2>
        </div>
        <p>
          Creative work should not lose its context when it becomes a post, an
          ad, or a performance report. Frame brings those steps together, with
          your team in control.
        </p>
      </section>
      <section
        className="container pillar-grid"
        aria-label="Frame platform capabilities"
      >
        {PILLARS.map(p => (
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
            <h3>{p.headline}</h3>
            <p>{p.description}</p>
            <div className="feature-tags">
              {p.items.slice(0, 3).map(i => (
                <span key={i}>{i}</span>
              ))}
            </div>
            <a className="text-link" href={`/product/${p.id}`}>
              Explore {p.name.toLowerCase()} <Arrow />
            </a>
          </article>
        ))}
      </section>
      <section className="workflow-section section">
        <div className="container">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Move forward, without losing control</p>
              <h2>
                Good work deserves
                <br />
                <em>a clear next step.</em>
              </h2>
            </div>
            <a href="/security" className="text-link">
              Built-in controls <Arrow />
            </a>
          </div>
          <div className="workflow-grid">
            {[
              [
                "01",
                "Keep the experiments.",
                "Generate, upload and refine in Studio. Working drafts stay out of your shared approved library.",
              ],
              [
                "02",
                "Choose what moves on.",
                "Submit a selected version to the library. An authorized reviewer approves it or requests changes.",
              ],
              [
                "03",
                "Give publishing its own check.",
                "Choose the caption, account and schedule. Final publishing approval is separate from asset approval.",
              ],
              [
                "04",
                "Learn from the results.",
                "Review available organic and paid metrics, then bring what you learn back to your next creative brief.",
              ],
            ].map(([n, t, d]) => (
              <article key={n}>
                <span className="step-number">{n}</span>
                <h3>{t}</h3>
                <p>{d}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="container section integration-teaser">
        <div>
          <p className="eyebrow">Your accounts. Your workspace.</p>
          <h2>
            Connected by you.
            <br />
            <em>Controlled by you.</em>
          </h2>
          <p>
            Connect your own business assets, not a shared advertiser account.
            Facebook and Meta Ads are first; the architecture is built to grow
            with more channels.
          </p>
          <a className="text-link" href="/integrations">
            Explore integration availability <Arrow />
          </a>
        </div>
        <div className="connection-illustration">
          <div className="connection-row">
            <span className="provider-letter">f</span>
            <div>
              <strong>Facebook Pages</strong>
              <small>Organic posts & engagement</small>
            </div>
            <span className="availability">In setup</span>
          </div>
          <div className="connection-row">
            <span className="provider-letter">M</span>
            <div>
              <strong>Meta Ads</strong>
              <small>Paid activity & reporting</small>
            </div>
            <span className="availability">In setup</span>
          </div>
          <div className="connection-row">
            <span className="provider-letter pale">+</span>
            <div>
              <strong>More of your marketing stack</strong>
              <small>Instagram, Google Ads, email & more</small>
            </div>
            <span className="availability">Planned</span>
          </div>
          <p className="fineprint">
            Meta access is pending platform setup and review. Customers
            authorize their own accounts when available.
          </p>
        </div>
      </section>
      <section className="container section faq-section">
        <div>
          <p className="eyebrow">A little clarity</p>
          <h2>
            Questions,
            <br />
            <em>answered.</em>
          </h2>
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
        eyebrow="One platform. Four connected stages."
        title="From idea to impact."
      >
        <p>
          Start with the workflows available in preview. Grow into a broader
          marketing operating system as new channels, measurement and
          optimization tools arrive.
        </p>
      </Intro>
      <div className="container product-list">
        {PILLARS.map(p => (
          <article key={p.id} className="product-row">
            <span className="big-number">{p.number}</span>
            <div>
              <p className="eyebrow">
                {p.name} / {p.status}
              </p>
              <h2>{p.headline}</h2>
              <p>{p.description}</p>
              <p className="fineprint">{p.next}</p>
            </div>
            <a className="button secondary" href={`/product/${p.id}`}>
              Explore {p.name} <Arrow />
            </a>
          </article>
        ))}
      </div>
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
          Intended self-service flow. Public onboarding depends on Frame's
          platform setup, Meta review, account eligibility and granted
          permissions. Customers do not create a developer app or enter Frame's
          credentials.
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
            <strong>Frame is operated by {p.operatorName}.</strong>
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
          Frame is a pre-release marketing platform. The operator's verified
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
      <Intro eyebrow="About Frame" title="Marketing works better together.">
        <p>
          Frame is a self-service software platform being built for business
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
            Frame is software for customers to use with their own authorized
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
          Frame will use this information to handle my request. Identity or
          business authority may need to be verified.
        </span>
      </label>
      <button className="button" type="submit">
        {topic === "deletion" ? "Submit deletion request" : "Send request"}
        <Arrow />
      </button>
      <p className="fineprint">
        Your request is stored in Frame's private platform inbox. A receipt is
        not confirmation that a demo is booked, access is granted or data is
        deleted. No marketing subscription is added.
      </p>
    </form>
  );
}
function Contact(props: Props) {
  return (
    <>
      <Intro
        eyebrow="Talk to the Frame team"
        title="Let's make your next move."
      >
        <p>
          Ask about early access, explore the product, get help, or make a
          privacy request. No Frame account is needed to contact us.
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
          Contact Frame <Arrow />
        </a>
      </div>
    </>
  );
}
