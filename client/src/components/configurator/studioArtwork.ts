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
export function studioModelArtwork(id: string, kind: "image" | "video") {
  const images =
    kind === "image"
      ? [
          "spotlight",
          "style-editorial",
          "style-illustration",
          "style-three-d",
          "neon-cyber",
          "style-animation",
        ]
      : [
          "video",
          "people",
          "dark-cinematic",
          "lifestyle",
          "desert-heat",
          "launch",
        ];
  const index =
    Array.from(id).reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 0) %
    images.length;
  return `/studio-art/${images[index]}.webp`;
}
