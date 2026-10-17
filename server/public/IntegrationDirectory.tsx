import React from "react";
import { ArrowRight, Globe2 } from "lucide-react";

/** Customer-facing workflows. Connection readiness remains in the workspace. */
export const integrationGroups = [
  {
    id: "advertising",
    name: "Advertising",
    description: "Give your campaign creative a destination.",
    providers: [
      {
        id: "meta",
        name: "Meta Ads",
        description:
          "Connect your ad account, review campaign performance, and prepare image ads for Facebook and Instagram.",
        detail: "Ad accounts, creative & reporting",
      },
      {
        id: "googleads",
        name: "Google Ads",
        description:
          "Create and export branded display creative in the Google Ads sizes you need for your campaigns.",
        detail: "Display creative & exports",
      },
      {
        id: "microsoftbing",
        name: "Microsoft Advertising",
        description:
          "Prepare and export campaign images for Bing and the Microsoft Advertising Network.",
        detail: "Campaign creative & exports",
      },
    ],
  },
  {
    id: "social-media",
    name: "Social Media",
    description:
      "Keep your brand consistent wherever the conversation happens.",
    providers: [
      {
        id: "facebook",
        name: "Facebook",
        description:
          "Connect your Page, prepare and schedule approved posts, and review available engagement insights.",
        detail: "Page posts & engagement",
      },
      {
        id: "instagram",
        name: "Instagram",
        description:
          "Create branded images and organize content for your Instagram presence, ready for review and export.",
        detail: "Social creative & exports",
      },
      {
        id: "tiktok",
        name: "TikTok",
        description:
          "Keep video and creator uploads together. Review your team's content and download approved assets for TikTok.",
        detail: "Video library & content review",
      },
    ],
  },
  {
    id: "catalog",
    name: "Product & Services Catalog",
    description:
      "Bring store products into the same catalog as the services your business offers.",
    providers: [
      {
        id: "shopify",
        name: "Shopify",
        description:
          "Import product details, variants, prices and images from your Shopify store into your creative workflow.",
        detail: "Store catalog import",
      },
      {
        id: "bigcommerce",
        name: "BigCommerce",
        description:
          "Bring your BigCommerce product catalog into EvokeLoop so your team can create with the right product information.",
        detail: "Store catalog import",
      },
      {
        id: "woocommerce",
        name: "WooCommerce",
        description:
          "Import products and imagery from your WooCommerce store and use them alongside your brand assets.",
        detail: "Store catalog import",
      },
    ],
  },
] as const;

export function ProviderLogo({ id }: { id: string }) {
  return (
    <span className={`provider-logo provider-logo-${id}`} aria-hidden="true">
      <img src={`/integrations/${id}.svg`} alt="" width={40} height={40} />
    </span>
  );
}

export function IntegrationDirectory() {
  return (
    <>
      <nav
        className="container integration-categories"
        aria-label="Integration categories"
      >
        {integrationGroups.map(group => (
          <a key={group.id} href={`#${group.id}`}>
            {group.name}
          </a>
        ))}
        <a href="#website-scan">Website Scan</a>
      </nav>
      <div className="container integration-directory">
        {integrationGroups.map((group, index) => (
          <section
            className="integration-group"
            key={group.id}
            id={group.id}
            aria-labelledby={`${group.id}-title`}
          >
            <div className="integration-group-heading">
              <span className="integration-index" aria-hidden="true">
                0{index + 1}
              </span>
              <div>
                <h2 id={`${group.id}-title`}>{group.name}</h2>
                <p>{group.description}</p>
              </div>
            </div>
            <div className="provider-grid">
              {group.providers.map(provider => (
                <article className="provider-card" key={provider.id}>
                  <ProviderLogo id={provider.id} />
                  <h3>{provider.name}</h3>
                  <p>{provider.description}</p>
                  <span className="provider-detail">{provider.detail}</span>
                </article>
              ))}
            </div>
          </section>
        ))}
        <section
          className="website-scan-section"
          id="website-scan"
          aria-labelledby="website-scan-title"
        >
          <div className="scan-symbol" aria-hidden="true">
            <Globe2 size={42} strokeWidth={1.5} />
          </div>
          <div>
            <p className="eyebrow">START WITH YOUR WEBSITE</p>
            <h2 id="website-scan-title">Website Scan</h2>
            <p>
              Bring product pages and brand material from your website into
              EvokeLoop. Review the imported details and images, then make them
              part of your catalog and creative process.
            </p>
          </div>
          <a className="button secondary" href="/contact?topic=demo">
            Explore website import <ArrowRight size={17} />
          </a>
        </section>
      </div>
    </>
  );
}
