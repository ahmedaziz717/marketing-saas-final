import { useState } from "react";
import { AccountIdentity } from "../AccountIdentity";
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  CirclePause,
  FileText,
  FolderKanban,
  Globe2,
  Layers3,
  LayoutGrid,
  Megaphone,
  Music2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  Users,
  Video,
  Wallet,
} from "lucide-react";
import { partnerLogoFiles, partnerLogoSrc } from "@shared/partnerLogos";
import { studioArtwork } from "../configurator/studioArtwork";

const hairSwatches: Record<string, string> = {
  any: "conic-gradient(#262220 0 20%, #68432e 20% 40%, #d6b56e 40% 60%, #ad583b 60% 80%, #bcbcc5 80%)",
  black: "linear-gradient(135deg, #49433f, #181615)",
  brown: "linear-gradient(135deg, #966d4c, #483025)",
  blonde: "linear-gradient(135deg, #f1d99e, #bc914d)",
  auburn: "linear-gradient(135deg, #ce7950, #843c2e)",
  silver: "linear-gradient(135deg, #e3e2e8, #9695a1)",
};

/** Decorative context, not a claimed preview of a campaign or generated result. */
export function ChoiceVisual({
  label,
  context = "",
  image,
  visual,
}: {
  label: string;
  context?: string;
  image?: string;
  visual?: string;
}) {
  const [failed, setFailed] = useState<string>();
  if (visual === "account")
    return <AccountIdentity name={label} imageUrl={image} />;
  const hair = visual?.startsWith("hair:")
    ? hairSwatches[visual.slice(5)]
    : undefined;
  if (hair)
    return (
      <span className="choice-hair-swatch" aria-hidden="true">
        <span style={{ background: hair }} />
      </span>
    );
  const text = `${visual ?? ""} ${label} ${context}`.toLowerCase();
  const partner =
    visual && partnerLogoFiles[visual]
      ? visual
      : /facebook/.test(text)
        ? "facebook"
        : /instagram/.test(text)
          ? "instagram"
          : /meta|ad account/.test(text)
            ? "meta"
            : /google ads/.test(text)
              ? "googleads"
              : /shopify/.test(text)
                ? "shopify"
                : undefined;
  const src =
    image || (partner ? partnerLogoSrc(partner) : studioArtwork(label));
  if (src && failed !== src)
    return (
      <img
        className={
          partner && !image ? "choice-visual-logo" : "choice-visual-image"
        }
        src={src}
        alt=""
        loading="lazy"
        onError={() => setFailed(src)}
      />
    );
  const Icon = /campaign/.test(text)
    ? Megaphone
    : /ad set|audience|people|gender|age|person/.test(text)
      ? Users
      : /chart|metric|insight|performance|trend|analytics/.test(text)
        ? BarChart3
        : /date|period|week|month|day|schedule|time/.test(text)
          ? CalendarDays
          : /budget|price|cost|currency|credit|billing/.test(text)
            ? Wallet
            : /objective|goal|conversion|optimi/.test(text)
              ? Target
              : /role|admin|permission|reviewer|security/.test(text)
                ? ShieldCheck
                : /video|motion|duration/.test(text)
                  ? Video
                  : /audio|sound|music/.test(text)
                    ? Music2
                    : /report|copy|text|font|document|pdf/.test(text)
                      ? FileText
                      : /workflow|app|step|node/.test(text)
                        ? FolderKanban
                        : /url|page|website|source|language|country/.test(text)
                          ? Globe2
                          : /active|approved|enabled|on$|yes$/.test(
                                label.toLowerCase()
                              )
                            ? CheckCircle2
                            : /paused|off|no$|disabled/.test(
                                  label.toLowerCase()
                                )
                              ? CirclePause
                              : /model|quality|creative|style/.test(text)
                                ? Sparkles
                                : /size|format|layout|placement/.test(text)
                                  ? LayoutGrid
                                  : /all|category|collection/.test(text)
                                    ? Layers3
                                    : SlidersHorizontal;
  const tone = Array.from(label).reduce((n, c) => n + c.charCodeAt(0), 0) % 4;
  return (
    <span className="choice-illustration" data-tone={tone} aria-hidden="true">
      <span className="choice-illustration-orbit" />
      <span className="choice-illustration-sheet">
        <i />
        <i />
        <i />
      </span>
      <Icon strokeWidth={1.6} />
    </span>
  );
}
