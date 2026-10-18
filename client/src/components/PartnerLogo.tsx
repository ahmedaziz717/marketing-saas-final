import { partnerLogoSrc } from "@shared/partnerLogos";

/** The plate may be styled; the provider's original mark must remain unchanged. */
export function PartnerLogo({
  slug,
  name,
  size = 48,
}: {
  slug: string;
  name: string;
  size?: number;
}) {
  return (
    <span
      className="partner-logo inline-flex shrink-0 items-center justify-center rounded-xl border bg-white"
      style={{ width: size, height: size, padding: Math.max(5, size * 0.16) }}
    >
      <img
        src={partnerLogoSrc(slug)}
        alt={`${name} logo`}
        className="h-full w-full object-contain"
        style={{ filter: "none" }}
      />
    </span>
  );
}
