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
  const family = font?.trim() || brandFonts.join(", ");
  return preserve
    ? `Typography: preserve the selected font family ${JSON.stringify(family || "the supplied brand/reference typeface")} consistently. Keep its recognizable letterforms; vary size, weight, spacing, color and effects to suit the creative. Do not replace the composition with a plain text card. Font rendering is part of the generated image.`
    : `Typography: ${family ? `use ${JSON.stringify(family)} as the preferred starting point, with freedom to choose complementary fonts` : "choose expressive, complementary fonts"}. Art-direct the lettering, hierarchy, line breaks, emphasis and effects to suit the theme. Font preservation is OFF; do not flatten creative styling into a rigid template.`;
}
