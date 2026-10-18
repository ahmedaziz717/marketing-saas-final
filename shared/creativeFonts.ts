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

export function creativeTypographyDirection(
  font: string | undefined,
  preserve: boolean | undefined,
  brandFonts: string[]
) {
  const family = font?.trim() || brandFonts.find(value => value.trim())?.trim();
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
    return `TYPOGRAPHY LOCK — preserve the selected font family ${JSON.stringify(family)}. Font preservation is ON. Use this ONE family for every newly generated headline, body line, CTA, price and specification; do not introduce a second family. ${traits[family] ? `Recognizable letterforms: ${traits[family]}. ` : group ? `The selected family belongs to ${group}; preserve its characteristic letterforms. ` : ""}This explicit font choice takes priority over any typography or font-family suggestion in the brand fonts, theme, art style, editable prompts or master composition. Keep existing product markings and the supplied logo untouched. Keep the full creative styling, composition, imagery, lighting and background. Vary only size, supported weight, tracking, color, layout, shadow and effects; do not replace the chosen letterforms or flatten the artwork into a plain text card. Preserve the selected copy verbatim. Before finishing, check every generated text element against this font-family instruction. Font rendering is part of the generated image.`;
  }
  return `Typography: ${family ? `use ${JSON.stringify(family)} as the preferred starting point, with freedom to choose complementary fonts` : "choose expressive, complementary fonts"}. Art-direct the lettering, hierarchy, line breaks, emphasis and effects to suit the theme. Font preservation is OFF; do not flatten creative styling into a rigid template.`;
}
