import { CREATIVE_THEME_LIST } from "@shared/creativeThemes";

/** Art-directed inspiration, never represented as a particular model's output. */
const coreThemes = new Set([
  "spotlight",
  "launch",
  "flash-sale",
  "bundle-value",
  "limited-drop",
  "feature-focus",
  "weekend",
  "holiday",
  "dark-cinematic",
  "neon-cyber",
  "studio-clean",
  "premium-dark",
  "tech-blue",
  "fire-energy",
  "smoke-fog",
  "space-galaxy",
  "abstract-geometry",
  "purple-gradient",
  "blue-gradient",
  "gold-luxury",
  "ice-frost",
  "matrix-code",
  "retro-wave",
  "carbon-fiber",
  "lightning-storm",
  "desert-heat",
  "dark-forest",
  "minimal-white",
]);
const named: Record<string, string> = {
  Image: "spotlight",
  Video: "video",
  "Subject only": "spotlight",
  "Lifestyle · no people": "lifestyle",
  "Lifestyle · with people": "people",
  People: "people",
  Realistic: "spotlight",
  Animation: "style-animation",
  Illustration: "style-illustration",
  "3D Render": "style-three-d",
  Editorial: "style-editorial",
  Cinematic: "dark-cinematic",
  Collage: "style-collage",
  Technical: "style-technical",
  Clean: "studio-clean",
  Vibrant: "neon-cyber",
  Dark: "premium-dark",
  Minimal: "minimal-white",
  Bold: "flash-sale",
  Warm: "lifestyle",
  Playful: "style-animation",
  Premium: "gold-luxury",
  ...Object.fromEntries(
    CREATIVE_THEME_LIST.filter(t => coreThemes.has(t.id)).map(t => [
      t.name,
      t.id,
    ])
  ),
};
export const studioArtwork = (name: string) =>
  named[name] ? `/studio-art/${named[name]}.webp` : undefined;
/** Dedicated model covers, separate from theme/style previews. Variants share family art. */
export function studioModelArtwork(id: string, kind: "image" | "video") {
  const key = id.toLowerCase();
  const families =
    kind === "image"
      ? [
          "sunburst",
          "flare",
          "marketing-studio",
          "recraft",
          "soul",
          "ideogram",
          "qwen",
          "z-image",
        ]
      : ["seedance", "kling", "wan", "ltx", "minimax", "happy-horse"];
  let family = families.find(name => key.includes(name));
  if (key.includes("grok")) family = `grok-${kind}`;
  if (key.includes("gpt-image") && !family)
    family = key.includes("mini") ? "gpt-mini" : "gpt-image";
  // Covers for other cinematic routes use dedicated video artwork, never theme previews.
  if (!family && key.includes("genjutsu")) family = "minimax";
  return `/studio-art/models/${family ?? (kind === "image" ? "gpt-image" : "kling")}.webp`;
}
