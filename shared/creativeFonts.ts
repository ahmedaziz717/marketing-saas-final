export const CREATIVE_FONT_GROUPS = {
  "Sans serif": [
    "Rubik",
    "Inter",
    "Roboto",
    "Open Sans",
    "Lato",
    "Montserrat",
    "Poppins",
    "Nunito Sans",
    "DM Sans",
    "Manrope",
    "Work Sans",
    "Source Sans 3",
    "Noto Sans",
    "Outfit",
    "Plus Jakarta Sans",
    "Urbanist",
    "Figtree",
    "Raleway",
    "Barlow",
    "Archivo",
  ],
  Display: [
    "Bebas Neue",
    "Anton",
    "Oswald",
    "League Spartan",
    "Space Grotesk",
    "Syne",
    "Sora",
    "Orbitron",
    "Rajdhani",
    "Russo One",
    "Audiowide",
    "Bungee",
    "Righteous",
  ],
  Serif: [
    "Playfair Display",
    "Merriweather",
    "Lora",
    "Libre Baskerville",
    "Cormorant Garamond",
    "DM Serif Display",
    "Bodoni Moda",
    "Fraunces",
    "Crimson Pro",
  ],
  "Script & mono": [
    "Dancing Script",
    "Pacifico",
    "Caveat",
    "Satisfy",
    "IBM Plex Mono",
    "Space Mono",
    "JetBrains Mono",
  ],
} as const;

export function brandFontFamilies(values: string[]) {
  return Array.from(new Set(values.map(value => value
    .replace(/\s+Fallback\b.*$/i, "")
    .replace(/^["']|["']$/g, "")
    .trim()).filter(Boolean)));
}

export const creativeTypeHierarchy = "TYPE SCALE AND HIERARCHY: Follow the brand's visual standards and supplied creative examples for weight, width, tracking and relative text size. A bold brand voice does not mean oversized, extra-heavy lettering. Keep the product or subject as the visual hero. Use a compact headline, clearly smaller supporting copy and one proportionate CTA, with breathing room. On square/portrait ads, aim for a headline block around 10–18% of canvas height; adapt naturally for other aspect ratios and explicit text-led directions. Do not default to giant rounded block capitals, heavy outlines or full-width text that overwhelms the product. Keep all selected text readable without stripping lighting, depth, texture or creative styling.";

export function creativeTypographyDirection(
  font: string | undefined,
  preserve: boolean | undefined,
  brandFonts: string[]
) {
  const families = brandFontFamilies(brandFonts);
  const family = brandFontFamilies([font || ""])[0] || families[0];
  const group = Object.entries(CREATIVE_FONT_GROUPS).find(([, names]) =>
    (names as readonly string[]).includes(family || "")
  )?.[0];
  const traits: Record<string, string> = {
    Bungee:
      "heavy, tightly packed, sign-painter block capitals with squared shapes, softly rounded corners and compact counters; never a thin geometric sans serif",
    Rubik:
      "sturdy, softly rounded geometric sans-serif letterforms with subtly rounded corners; never a serif or handwritten substitute",
    "Bebas Neue": "tall, tightly condensed uppercase sans-serif letterforms",
    Anton: "very heavy condensed sans-serif display letterforms",
    "Playfair Display":
      "high-contrast editorial serif letterforms with fine hairlines and distinctive serifs",
    Orbitron: "angular, squared futuristic geometric letterforms",
    "Dancing Script": "connected, lively handwritten script letterforms",
    "IBM Plex Mono": "monospaced letterforms with equal character widths",
  };
  if (preserve && family) {
    return `TYPOGRAPHY LOCK — preserve the selected font family ${JSON.stringify(family)}. Font preservation is ON. Use this ONE family for every newly generated headline, body line, CTA, price and specification; do not introduce a second family. ${traits[family] ? `Recognizable letterforms: ${traits[family]}. ` : group ? `The selected family belongs to ${group}; preserve its characteristic letterforms. ` : ""}This explicit font choice takes priority over any typography or font-family suggestion in the brand fonts, theme, art style, editable prompts or master composition. Keep existing product markings and the supplied logo untouched. Keep the full creative styling, composition, imagery, lighting and background. Vary only size, supported weight, tracking, color, layout, shadow and effects; do not replace the chosen letterforms or flatten the artwork into a plain text card. Preserve the selected copy verbatim. Before finishing, check every generated text element against this font-family instruction. Font rendering is part of the generated image.\n${creativeTypeHierarchy}`;
  }
  return `BRAND-LED TYPOGRAPHY: ${family ? `Use ${JSON.stringify(family)} as the primary family. ${families.length ? `The approved brand palette is ${families.map(f => JSON.stringify(f)).join(", ")}; use those families for complementary headline/body roles according to the brand guidance.` : "Choose a complementary family only if the composition needs one."}` : "Choose a restrained, coherent font pairing consistent with the brand's written standards and visual references."} Font preservation is OFF; this allows complementary roles and expressive layout, not abandoning the brand for generic display lettering. Selected family choices take priority over automatic suggestions. Theme and art style may guide color, effects and arrangement without replacing brand letterforms.\n${creativeTypeHierarchy}`;
}
