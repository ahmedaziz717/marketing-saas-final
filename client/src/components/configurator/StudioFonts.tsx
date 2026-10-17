import { useEffect, useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { CREATIVE_FONT_GROUPS } from "@shared/creativeFonts";

const knownFonts: string[] = Object.values(CREATIVE_FONT_GROUPS).flat();
const sample = "Make it yours";

export function StudioFonts({
  font,
  preserve,
  brandFonts,
  search,
  onChange,
}: {
  font?: string;
  preserve: boolean;
  brandFonts: string[];
  search: string;
  onChange: (value: { fontFamily?: string; preserveFont?: boolean }) => void;
}) {
  const [group, setGroup] = useState("All fonts");
  const groups = {
    ...CREATIVE_FONT_GROUPS,
    ...(brandFonts.length ? { "Brand fonts": brandFonts } : {}),
  };
  const fonts = Array.from(
    new Set(
      group === "All fonts"
        ? [...knownFonts, ...brandFonts, ...(font ? [font] : [])]
        : (groups[group as keyof typeof groups] ?? [])
    )
  ).filter(name => name.toLowerCase().includes(search.toLowerCase()));
  // Fetch only the fixed preview text. Never send campaign copy or custom brand fonts.
  const families = fonts
    .filter(name => knownFonts.includes(name))
    .sort()
    .join("|");
  useEffect(() => {
    if (!families) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    const params = new URLSearchParams();
    families.split("|").forEach(name => params.append("family", name));
    params.set("display", "swap");
    params.set("text", sample);
    link.href = `https://fonts.googleapis.com/css2?${params}`;
    document.head.appendChild(link);
    return () => link.remove();
  }, [families]);
  return (
    <section aria-label="Creative font choices" className="cfg-fonts">
      <div className="cfg-preserve-setting">
        <label>
          <input
            type="checkbox"
            checked={preserve}
            onChange={e => onChange({ preserveFont: e.target.checked })}
          />
          Preserve selected font
        </label>
        <p className="cfg-help">
          Off by default. Let the creative mix complementary fonts, or turn on
          to keep your chosen family consistent. Review generated lettering.
        </p>
      </div>
      <div className="cfg-family-tabs" aria-label="Font categories">
        {["All fonts", ...Object.keys(groups)].map(name => (
          <button
            key={name}
            type="button"
            aria-pressed={group === name}
            onClick={() => setGroup(name)}
          >
            {name}
          </button>
        ))}
      </div>
      <p className="cfg-help">
        Selected: {font || "Automatic · art-directed typography"}
      </p>
      <div className="cfg-font-grid">
        <button
          type="button"
          className={`cfg-font-tile${!font ? " is-selected" : ""}`}
          aria-label="Select Automatic typography"
          aria-pressed={!font}
          onClick={() => onChange({ fontFamily: "" })}
        >
          <span className="cfg-font-sample">
            <Sparkles size={26} aria-hidden="true" />
          </span>
          <strong>Automatic</strong>
          <span>Art-directed typography</span>
          {!font && (
            <Check className="cfg-font-check" size={16} aria-hidden="true" />
          )}
        </button>
        {fonts.map(name => {
          const category = Object.entries(CREATIVE_FONT_GROUPS).find(
            ([, names]) => (names as readonly string[]).includes(name)
          )?.[0];
          const fallback =
            category === "Serif"
              ? "serif"
              : /Mono/.test(name)
                ? "monospace"
                : "sans-serif";
          return (
            <button
              key={name}
              type="button"
              className={`cfg-font-tile${font === name ? " is-selected" : ""}`}
              aria-label={`Select ${name}`}
              aria-pressed={font === name}
              onClick={() => onChange({ fontFamily: name })}
            >
              <span
                className="cfg-font-sample"
                style={{ fontFamily: `${JSON.stringify(name)}, ${fallback}` }}
              >
                {sample}
              </span>
              <strong>{name}</strong>
              <span>{category || "Brand font · local preview"}</span>
              {font === name && (
                <Check
                  className="cfg-font-check"
                  size={16}
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>
      {!fonts.length && <p className="cfg-help">No fonts match this search.</p>}
    </section>
  );
}
