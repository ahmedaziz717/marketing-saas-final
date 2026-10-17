const colors: Record<string, string> = {
  shopify: "#5E8E3E",
  bigcommerce: "#121118",
  woocommerce: "#96588A",
  meta: "#0866FF",
  googleads: "#4285F4",
  microsoftbing: "#008373",
  tiktok: "#111111",
  linkedin: "#0A66C2",
  pinterest: "#E60023",
  klaviyo: "#111111",
  mailchimp: "#111111",
  hubspot: "#FF7A59",
  brevo: "#0B996E",
  activecampaign: "#004CFF",
  omnisend: "#176652",
  googleanalytics: "#E37400",
};
export function PartnerLogo({ slug, name }: { slug: string; name: string }) {
  return (
    <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border bg-white p-2.5">
      {["activecampaign", "klaviyo", "omnisend"].includes(slug) ? (
        <img
          src={`/integrations/${slug}.svg`}
          alt={`${name} logo`}
          className="h-full w-full object-contain"
        />
      ) : (
        <span
          role="img"
          aria-label={`${name} logo`}
          className="block h-full w-full"
          style={{
            backgroundColor: colors[slug] || "#222",
            mask: `url(/integrations/${slug}.svg) center / contain no-repeat`,
            WebkitMask: `url(/integrations/${slug}.svg) center / contain no-repeat`,
          }}
        />
      )}
    </span>
  );
}
