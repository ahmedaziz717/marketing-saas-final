import { z } from "zod";

export const artStyleInfluenceSchema = z.enum(["subtle", "balanced", "strong"]);
export type ArtStyleInfluence = z.infer<typeof artStyleInfluenceSchema>;
export const ART_STYLE_INFLUENCES = [
  {
    id: "subtle",
    name: "Subtle",
    direction:
      "Use light stylistic touches while retaining the scene's natural appearance.",
  },
  {
    id: "balanced",
    name: "Balanced",
    direction:
      "Make the selected style visibly unmistakable while balancing the theme and brand presentation.",
  },
  {
    id: "strong",
    name: "Strong",
    direction:
      "Let the selected style dominate the surrounding scene, even when other directions ask for photography.",
  },
] as const;
export const STYLE_INFLUENCE_HELP =
  "Controls prompt emphasis, not a guaranteed percentage. Product identity, proportions, facts and brand marks stay protected.";

/** Shared prompt policy, not a provider strength/quality parameter. */
export function artStyleInfluenceDirection(
  influence: ArtStyleInfluence = "balanced",
  artStyle?: string
) {
  const selected = ART_STYLE_INFLUENCES.find(item => item.id === influence)!;
  return [
    `ART STYLE INFLUENCE — ${selected.name}: ${selected.direction}`,
    "STYLE PRIORITY: The explicitly selected art style controls the rendering language of non-product scenery. Interpret theme, mood, brand and editable prompts within that style, not as permission to switch styles. Conflicting photographic or realistic-scene instructions in those prompts do not override the selected non-photographic style.",
    influence === "strong" && artStyle === "animation"
      ? "STRONG ANIMATION: Render all non-product scenery as an unmistakably animated-film world: stylized shapes, simplified forms, expressive color, illustrated textures and animation-style shading. Do not produce a photographic backdrop with only a color filter. Keep the real product accurate within the animated environment."
      : influence === "strong"
        ? "Make the selected style dominant throughout the background, environment, supporting graphics and surface treatment, not just a subtle color grade."
        : "",
    "This aesthetic priority never overrides factual accuracy, product shape, proportions, colors, markings or features, selected copy, logo and font preservation, person identity, prohibited content or safety constraints. An explicitly preserved original product photo remains unchanged; style its surroundings instead. Do not invent product parts, claims or offers.",
  ]
    .filter(Boolean)
    .join("\n");
}
