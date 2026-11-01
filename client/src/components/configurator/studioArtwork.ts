import { CREATIVE_THEME_LIST } from "@shared/creativeThemes";

/** Art-directed inspiration, never represented as a particular model's output. */
const named: Record<string, string> = {
  Image: "type-image",
  Video: "video",
  "Subject only": "scene-subject",
  "Lifestyle · no people": "lifestyle",
  "Lifestyle · with people": "people",
  People: "people",
  Realistic: "style-realistic",
  Animation: "style-animation",
  Illustration: "style-illustration",
  "3D Render": "style-three-d",
  Editorial: "style-editorial",
  Cinematic: "style-cinematic",
  Collage: "style-collage",
  Technical: "style-technical",
  Clean: "mood-clean",
  Vibrant: "mood-vibrant",
  Dark: "mood-dark",
  Minimal: "mood-minimal",
  Bold: "mood-bold",
  Warm: "mood-warm",
  Playful: "mood-playful",
  Premium: "mood-premium",
  ...Object.fromEntries(CREATIVE_THEME_LIST.map(t => [t.name, t.id])),
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
      : [
          "seedance",
          "kling",
          "wan",
          "ltx",
          "minimax",
          "happy-horse",
          "cinema-studio",
          "genjutsu",
        ];
  let family = families.find(name => key.includes(name));
  if (key.includes("grok")) family = `grok-${kind}`;
  if (key.includes("gpt-image") && !family)
    family = key.includes("mini") ? "gpt-mini" : "gpt-image";
  return `/studio-art/models/${family ?? (kind === "image" ? "gpt-image" : "kling")}.webp`;
}
