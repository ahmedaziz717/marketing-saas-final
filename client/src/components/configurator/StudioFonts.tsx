import { useEffect, useRef, useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { CREATIVE_FONT_GROUPS, brandFontFamilies } from "@shared/creativeFonts";

const knownFonts: string[] = Object.values(CREATIVE_FONT_GROUPS).flat();
const sample = "Make it yours";

export function StudioFonts({
  font,
  preserve,
  brandFonts: rawBrandFonts,
  search,
  onChange,
}: {
  font?: string;
  preserve: boolean;
  brandFonts: string[];
  search: string;
  onChange: (value: { fontFamily?: string; preserveFont?: boolean }) => void;
}) {
  const brandFonts = brandFontFamilies(rawBrandFonts);
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
  return (
    <section aria-label="Creative font choices" className="cfg-fonts">
      <div className="cfg-preserve-setting">
        <label>
          <input
            type="checkbox"
            checked={preserve}
            disabled={!font && !brandFonts.length}
            onChange={e =>
              onChange({
                preserveFont: e.target.checked,
                ...(e.target.checked && !font
                  ? { fontFamily: brandFonts[0] }
                  : {}),
              })
            }
          />
          Preserve selected font
        </label>
        <p className="cfg-help">
          {preserve
            ? `Ask AI to use ${font || brandFonts[0] || "your selected font"} throughout the creative, while keeping the visual styling. Generated letterforms can vary; review the result.`
            : "Off by default. Automatic typography follows your brand fonts and visual guidance. Turn this on to keep one selected family throughout the creative."}
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
        Selected: {font || "Automatic · brand-led typography"}
      </p>
      <div className="cfg-font-grid">
        <button
          type="button"
          className={`cfg-font-tile${!font ? " is-selected" : ""}`}
          aria-label="Select Automatic typography"
          aria-pressed={!font}
          onClick={() => onChange({ fontFamily: "", preserveFont: false })}
        >
          <span className="cfg-font-sample">
            <Sparkles size={26} aria-hidden="true" />
          </span>
          <strong>Automatic</strong>
          <span>Brand fonts & balanced hierarchy</span>
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
              <FontSample name={name} fallback={fallback} />
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

// Isolate each request: a failed family must not replace every tile with a fallback.
const fontLoads = new Map<string, Promise<boolean>>();
function loadPreviewFont(name: string) {
  if (!fontLoads.has(name)) {
    fontLoads.set(
      name,
      new Promise<boolean>(resolve => {
        const link = document.createElement("link");
        const timer = window.setTimeout(() => finish(false), 10000);
        const finish = (loaded: boolean) => {
          window.clearTimeout(timer);
          if (!loaded) link.remove();
          resolve(loaded);
        };
        link.rel = "stylesheet";
        const params = new URLSearchParams({
          family: name,
          display: "swap",
          text: sample,
        });
        link.href = `https://fonts.googleapis.com/css2?${params}`;
        link.onerror = () => finish(false);
        link.onload = () => {
          if (!document.fonts) {
            finish(false);
            return;
          }
          document.fonts.load(`25px ${JSON.stringify(name)}`, sample).then(
            faces => finish(faces.length > 0),
            () => finish(false)
          );
        };
        document.head.appendChild(link);
      })
    );
  }
  return fontLoads.get(name)!;
}
function FontSample({ name, fallback }: { name: string; fallback: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [state, setState] = useState<
    "loading" | "loaded" | "unavailable" | "local"
  >("loading");
  useEffect(() => {
    let mounted = true;
    const load = () => {
      if (!knownFonts.includes(name)) {
        // A local family may fall back; FontFaceSet.check cannot verify an installed font.
        setState("local");
        return;
      }
      loadPreviewFont(name).then(ok => {
        if (mounted) setState(ok ? "loaded" : "unavailable");
      });
    };
    if (typeof IntersectionObserver === "undefined" || !ref.current) load();
    const observer =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(
            entries => {
              if (entries.some(entry => entry.isIntersecting)) {
                observer?.disconnect();
                load();
              }
            },
            { rootMargin: "160px" }
          )
        : null;
    if (ref.current) observer?.observe(ref.current);
    return () => {
      mounted = false;
      observer?.disconnect();
    };
  }, [name]);
  return (
    <span ref={ref} className="cfg-font-sample-wrap">
      <span
        className="cfg-font-sample"
        style={{ fontFamily: `${JSON.stringify(name)}, ${fallback}` }}
      >
        {sample}
      </span>
      {state !== "loaded" && state !== "local" && (
        <small className="cfg-font-preview-status">
          {state === "loading"
            ? "Loading font preview…"
            : "Preview unavailable · font choice saved"}
        </small>
      )}
    </span>
  );
}
