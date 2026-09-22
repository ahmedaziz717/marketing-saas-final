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
  MoveUpRight,
  Image,
  SlidersHorizontal,
  MousePointer2,
} from "lucide-react";
import { FAQ, PILLARS, type WebsiteProfile } from "../../shared/publicWebsite";
import { PROPOSED_PLANS } from "../../shared/frameProduct";
import { ARTICLES } from "./content";
import { dashboardHref } from "../lib/siteOrigins";
import {
  IntegrationDirectory,
  ProviderLogo,
  integrationGroups,
} from "./IntegrationDirectory";

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
              Get started <Arrow />
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
              <a href="/contact?topic=access">Get started</a>
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
              </a>
            ))}
            <a href="/integrations">Integrations</a>
            <a href="/pricing">Pricing</a>
          </div>
          <div>
            <h2>Company</h2>
            <a href="/about">About EvokeLoop</a>
            <a href="/contact">Contact & support</a>
            <a href="/contact?topic=access">Get started</a>
            <a href="/security">Security & trust</a>
            <a href={dashboardHref("/login")}>Sign in</a>
          </div>
          <div>
            <h2>Data & policies</h2>
            <a href="/privacy">Privacy notice</a>
            <a href="/terms">Terms of service</a>
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
            {profile.operatorName || "EvokeLoop"}. All rights reserved.
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
        <p className="eyebrow">YOUR AMBITION. YOUR NEXT MOVE.</p>
        <h2>
          Do more with
          <br />
          <em>the team you have.</em>
        </h2>
        <p>
          Bring AI, marketing experience and your ideas together. Your next
          campaign starts here.
        </p>
      </div>
      <div className="cta-actions">
        <a className="button" href="/contact?topic=access">
          Get started <Arrow />
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
              <span className="dot" /> AI. EXPERIENCE. YOUR ADVANTAGE.
            </p>
            <h1>
              Expertise built in.
              <br />
              <em>You in control.</em>
            </h1>
            <p className="hero-lede">
              Create content, plan campaigns and understand results with AI,
              backed by the experience of marketing teams. Do more with the team
              you have, with less overhead and complexity.
            </p>
            <div className="button-row">
              <a href="/contact?topic=access" className="button">
                Get started <Arrow />
              </a>
              <a href="/product" className="button secondary">
                Meet the platform <MoveUpRight size={16} />
              </a>
            </div>
            <p className="hero-note">
              <ShieldCheck size={15} /> You set the direction. You approve what
              goes live.
            </p>
          </div>
          <div className="hero-loop">
            <MarketingLoop />
            <p className="loop-disclosure">
              From your first idea to your next better decision.
            </p>
          </div>
        </div>
        <div className="container hero-bottom">
          <span>MARKETING THAT GETS SMARTER EVERY TIME IT RUNS.</span>
          <a href="#the-platform">
            Discover the loop <ChevronDown size={15} />
          </a>
        </div>
      </section>
      <section
        className="container stack-band"
        aria-label="Marketing platforms"
      >
        <p>
          Built around
          <br />
          <strong>your marketing world.</strong>
        </p>
        <div>
          {[
            ["meta", "Meta Ads"],
            ["googleads", "Google Ads"],
            ["shopify", "Shopify"],
            ["bigcommerce", "BigCommerce"],
          ].map(([id, name]) => (
            <span className="stack-provider" key={id}>
              <ProviderLogo id={id} />
              {name}
            </span>
          ))}
          <a href="/integrations">
            See all integrations <Arrow />
          </a>
        </div>
      </section>
      <section id="the-platform" className="container section platform-intro">
        <div>
          <p className="eyebrow">BUILT FOR YOU TO RUN</p>
          <h2>
            The power to do more.
            <br />
            <em>The freedom to stay lean.</em>
          </h2>
        </div>
        <p>
          You don't need an agency or a large team of graphic designers, media
          buyers, copywriters and analysts to get started. EvokeLoop brings the
          essential work into one workflow, helping you create, plan and learn
          without years of marketing experience.
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
              <p className="eyebrow">YOUR IDEAS, WITH AI AT YOUR SIDE</p>
              <h2>
                Create with confidence.
                <br />
                <em>Make it your own.</em>
              </h2>
            </div>
            <p>
              Start with your product and brand. Let AI help with images and
              copy, then refine and approve the work that feels right for your
              business.
            </p>
          </div>
          <StudioVisual />
        </div>
      </section>
      <section className="container section control-story">
        <div>
          <p className="eyebrow">YOUR BUSINESS. YOUR DECISIONS.</p>
          <h2>
            You and your team.
            <br />
            <em>In the driver's seat.</em>
          </h2>
          <p>
            Set the creative direction, choose your accounts and review what
            goes live. EvokeLoop helps you do the work while you keep the final
            say.
          </p>
          <a className="text-link" href="/security">
            Explore the safeguards <Arrow />
          </a>
        </div>
        <div className="control-steps">
          {[
            [
              "01",
              "Start with what you know.",
              "Bring your products, brand and business goals. You know your customers; start with that insight.",
            ],
            [
              "02",
              "Let AI help you create.",
              "Generate images, explore copy and refine your ideas. Choose the versions that represent your business.",
            ],
            [
              "03",
              "Make it yours. Then approve.",
              "Your team reviews the creative, caption, destination and schedule before publishing.",
            ],
            [
              "04",
              "Learn and choose your next move.",
              "See your connected account results and use what you learn to shape the next campaign.",
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
            <p className="eyebrow">BUILT AROUND YOUR BUSINESS</p>
            <h2>
              Your tools.
              <br />
              <em>Working together.</em>
            </h2>
            <p>
              Bring your product catalog, campaign creative and social content
              into the same workflow. Spend less time on handoffs and more time
              moving your marketing forward.
            </p>
            <a className="text-link" href="/integrations">
              Explore integrations <Arrow />
            </a>
          </div>
          <div
            className="provider-showcase"
            aria-label="Advertising and catalog platforms"
          >
            {[
              ...integrationGroups[0].providers,
              ...integrationGroups[2].providers,
            ].map(provider => (
              <a
                className="provider-tile"
                href="/integrations"
                key={provider.id}
              >
                <ProviderLogo id={provider.id} />
                <strong>{provider.name}</strong>
              </a>
            ))}
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
            Getting started, working with AI and keeping your team in control.
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
        title="One platform. More power for your team."
      >
        <p>
          Bring creative, campaign planning and reporting into a workflow you
          can run yourself. AI supports the creative work, marketing experience
          shapes the process, and your team makes the decisions.
        </p>
      </Intro>
      <section className="container product-cycle">
        <div>
          <h2>
            A clear path from
            <br />
            <em>idea to improvement.</em>
          </h2>
          <p>
            Start with your brand and products. Create content, prepare
            campaigns and approve what goes live. Bring the results back into
            your next creative decision, all in one workspace.
          </p>
          <p className="fineprint">
            Build your marketing around the team you have and the goals you set.
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
      <Intro eyebrow={p.name} title={p.headline}>
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
                    "Start with your brand and products. Let AI help you generate images and explore copy, then refine the ideas you want to use.",
                    "Keep your logos, product images and reference material together so each new piece of creative starts with your business.",
                    "Compare versions and gather feedback in one place. Send the work you choose for review while keeping your original drafts.",
                    "Bring existing images, videos and creator content into your asset library so your team can build on work you already have.",
                  ][n]
                : p.id === "activate"
                  ? [
                      "Connect the Facebook Page you manage and prepare posts with your approved creative, captions and schedule in one place.",
                      "Review campaigns and prepare image ads in existing Meta ad sets. Ads are created paused for your review and activation in Meta.",
                      "Build a posting rhythm that suits your business. Plan future weeks and months, and review your calendar in the view that works for you.",
                      "Keep the final say over the creative, caption, destination and schedule. Changes return the work for approval before delivery.",
                    ][n]
                  : p.id === "measure"
                    ? [
                        "Bring results from your connected accounts into one view, with separate reports for advertising and social activity.",
                        "Choose your dates and compare with the previous period to see how your marketing is changing over time.",
                        "Look closer at the campaign and channel metrics available from Meta to understand where to focus your attention.",
                        "Read spend in each account's currency and see platform-reported results in context as you make your next decision.",
                      ][n]
                    : [
                        "Review available campaign and channel reports to identify the creative, messages and products your team wants to explore next.",
                        "Use your product information and brand assets to generate a fresh set of creative variations for the next campaign.",
                        "Compare versions, collect feedback and send the selected work for approval before using it in a campaign.",
                        "Keep the next brief grounded in what you learned. Your team chooses the changes and approves the next round of work.",
                      ][n]}
            </p>
          </article>
        ))}
      </section>
      <div className="container notice section-note">
        <ShieldCheck size={23} />
        <p>{p.next}</p>
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
  return (
    <>
      <Intro
        eyebrow="YOUR MARKETING ECOSYSTEM"
        title="Your tools. One connected workflow."
      >
        <p>
          Bring your catalog, campaign creative and social content together.
          Explore the platforms behind your marketing and find the workflow that
          fits your business.
        </p>
      </Intro>
      <IntegrationDirectory />
      <section className="container notice section-note integration-account-note">
        <ShieldCheck size={24} />
        <div>
          <h2>Your accounts. Your control.</h2>
          <p>
            Manage account connections in your workspace. Account actions depend
            on your provider permissions; creative exports are ready to upload
            through the relevant platform. Read our{" "}
            <a href="/privacy">Privacy notice</a> or{" "}
            <a href="/data-deletion">Data deletion instructions</a>.
          </p>
        </div>
      </section>
      <CTA />
    </>
  );
}

function Pricing() {
  const descriptions = {
    launch: "A starting point for your marketing workflow.",
    growth: "More creative capacity for a growing marketing team.",
    scale: "For teams managing higher-volume marketing and measurement.",
    enterprise: "A tailored plan for your organization and marketing needs.",
  };
  return (
    <>
      <Intro eyebrow="Monthly plans / USD" title="Room to start. Room to grow.">
        <p>
          Build a marketing workflow around the team you have. Find the right
          plan for your creative output and campaign activity, then talk with us
          to confirm your workspace's plan, usage and onboarding.
        </p>
      </Intro>
      <section className="container pricing-grid">
        {PROPOSED_PLANS.map(p => (
          <article
            className={`price-card ${p.id === "growth" ? "featured" : ""}`}
            key={p.id}
          >
            <span className="eyebrow">
              {p.id === "growth"
                ? "Built for a growing team"
                : "Workspace plan"}
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
            <p>{descriptions[p.id]}</p>
            <a
              className={`button ${p.id === "growth" ? "" : "secondary"}`}
              href="/contact?topic=access"
            >
              Contact sales <Arrow />
            </a>
            <div className="price-details">
              <p>
                <Check size={16} />
                {p.credits
                  ? `${p.credits.toLocaleString("en-US")} AI credits / month`
                  : "Custom usage structure"}
              </p>
              <p>
                <Check size={16} />
                {p.monthlyAdSpendUsd
                  ? `Ad-spend band: up to $${p.monthlyAdSpendUsd.toLocaleString("en-US")} / month`
                  : "Custom marketing scale"}
              </p>
              <p>
                <Check size={16} />
                Plan details confirmed with your team
              </p>
            </div>
          </article>
        ))}
      </section>
      <div className="container notice section-note">
        <p>
          Prices are in USD. Contact our team to confirm features, usage
          allowances and commercial terms before purchase. Ad-spend bands
          describe your marketing scale; advertising spend and applicable taxes
          are separate from the plan price.
        </p>
      </div>
      <CTA />
    </>
  );
}
function Business({ profile: p }: { profile: WebsiteProfile }) {
  return (
    <section className="business-panel">
      <h2>{p.operatorName ? "Business information" : "Contact EvokeLoop"}</h2>
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
          Questions about the platform, your workspace or your data? Contact our
          team for product information, support and privacy enquiries.
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
          <a href="/contact">Contact the team</a> /{" "}
          <a href="/data-deletion">Request data deletion</a>
        </p>
      </div>
    </section>
  );
}
function About({ profile }: { profile: WebsiteProfile }) {
  return (
    <>
      <Intro
        eyebrow="About EvokeLoop"
        title="Powerful marketing should be within reach."
      >
        <p>
          We built EvokeLoop to give business owners and lean teams access to AI
          and the experience behind professional marketing, without needing to
          assemble a large department.
        </p>
      </Intro>
      <section className="container about-grid">
        <div>
          <h2>
            Technology with experience.
            <br />
            <em>Built around your business.</em>
          </h2>
          <p>
            EvokeLoop brings together AI and the practical experience of teams
            who understand creative, media buying, copywriting and analytics. We
            turn that experience into a connected workflow you and your team can
            use directly.
          </p>
          <p>
            Whether you're running marketing yourself or working with a small
            team, start with your brand and goals. Create, activate, measure and
            improve in one workspace, with less time spent coordinating people
            and tools.
          </p>
          <p>
            You bring the knowledge of your business. AI helps with the creative
            work, and connected reports help you understand the results. Your
            team chooses the direction, approves the work and decides what to do
            next.
          </p>
          <a className="text-link" href="/product">
            Explore the platform <Arrow />
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
          <option value="access">Sales &amp; plans</option>
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
        Our team will review your request. Keep the private status link provided
        after submission to follow its progress. Submitting this form does not
        subscribe you to marketing emails.
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
          Find a plan, arrange a product walkthrough, get help or make a privacy
          request. You can contact us without an EvokeLoop account.
        </p>
      </Intro>
      <section className="container contact-grid">
        <div>
          <p className="eyebrow">Sales, support &amp; privacy</p>
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
