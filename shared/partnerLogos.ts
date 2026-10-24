/** Original provider assets, served locally without recoloring or CSS masks. */
export const partnerLogoFiles: Record<string, string> = {
  meta: "meta.svg",
  facebook: "facebook.png",
  instagram: "instagram.webp",
  googleads: "googleads.svg",
  googleanalytics: "googleanalytics.svg",
  microsoftbing: "microsoftbing.ico",
  shopify: "shopify.svg",
  bigcommerce: "bigcommerce.svg",
  woocommerce: "woocommerce.svg",
  tiktok: "tiktok.ico",
  linkedin: "linkedin.ico",
  pinterest: "pinterest.svg",
  mailchimp: "mailchimp.svg",
  hubspot: "hubspot.png",
  brevo: "brevo.svg",
  activecampaign: "activecampaign.png",
  klaviyo: "klaviyo.png",
  omnisend: "omnisend.svg",
};
export const partnerLogoSrc = (slug: string) =>
  `/integrations/${partnerLogoFiles[slug] ?? slug + ".svg"}`;
