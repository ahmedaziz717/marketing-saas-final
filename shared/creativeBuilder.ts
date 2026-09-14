import { z } from "zod";
import {
  CREATIVE_THEMES,
  DEFAULT_CREATIVE_BASE_PROMPT,
  getCreativeTheme,
  type CreativeThemeId,
} from "./creativeThemes";

export {
  CREATIVE_THEME_GROUPS,
  CREATIVE_THEME_LIST,
  CREATIVE_THEMES,
  DEFAULT_CREATIVE_BASE_PROMPT,
  getCreativeTheme,
  getCreativeThemeGroup,
} from "./creativeThemes";
export type { CreativeTheme, CreativeThemeIcon, CreativeThemeId } from "./creativeThemes";

export const CREATIVE_CHANNELS = [
  { id: "meta", name: "Meta" },
  { id: "google_display", name: "Google Display" },
  { id: "microsoft", name: "Microsoft Ads" },
] as const;
export type CreativeChannel = (typeof CREATIVE_CHANNELS)[number]["id"];

export const CREATIVE_MOODS = [
  { id: "clean", name: "Clean", icon: "sparkles", direction: "Use crisp visual hierarchy, balanced whitespace, restrained color, and a polished uncluttered finish." },
  { id: "vibrant", name: "Vibrant", icon: "zap", direction: "Use energetic color, lively contrast, and confident visual rhythm while keeping the product easy to read." },
  { id: "dark", name: "Dark", icon: "moon", direction: "Use deep controlled backgrounds, focused highlights, and premium contrast without losing product detail." },
  { id: "minimal", name: "Minimal", icon: "square", direction: "Use one dominant focal point, generous negative space, and only essential supporting elements." },
  { id: "bold", name: "Bold", icon: "flame", direction: "Use assertive scale, strong graphic contrast, and an immediate high-impact composition." },
  { id: "warm", name: "Warm", icon: "sun", direction: "Use inviting warm tones, soft natural light, and an approachable optimistic atmosphere." },
  { id: "playful", name: "Playful", icon: "party", direction: "Use expressive color, buoyant shapes, and light visual energy while retaining brand polish." },
  { id: "premium", name: "Premium", icon: "gem", direction: "Use refined materials, controlled highlights, elegant spacing, and quiet luxury restraint." },
] as const;
export type CreativeMood = (typeof CREATIVE_MOODS)[number]["id"];

export const CREATIVE_ART_STYLES = [
  { id: "realistic", name: "Realistic", icon: "camera", direction: "Create photorealistic commercial product photography with accurate materials, lighting, and physical proportions." },
  { id: "animation", name: "Animation", icon: "clapperboard", direction: "Use a polished animated-feature visual language for the environment while keeping the supplied product recognizable and physically accurate." },
  { id: "illustration", name: "Illustration", icon: "brush", direction: "Use sophisticated commercial illustration with clear product geometry and intentional graphic detail." },
  { id: "three_d", name: "3D Render", icon: "box", direction: "Use a high-end studio 3D-render aesthetic with accurate product geometry, materials, shadows, and reflections." },
  { id: "editorial", name: "Editorial", icon: "newspaper", direction: "Use art-directed magazine composition, refined typography, and a deliberate editorial crop." },
  { id: "cinematic", name: "Cinematic", icon: "film", direction: "Use cinematic lighting, depth, atmosphere, and visual storytelling while preserving clear product recognition." },
  { id: "collage", name: "Collage", icon: "layers", direction: "Use a layered editorial collage with controlled cut-paper depth, graphic framing, and readable hierarchy." },
  { id: "technical", name: "Technical", icon: "scan", direction: "Use a precise technical-visualization style with measured lines and structured information, without inventing internal parts or features." },
] as const;
export type CreativeArtStyle = (typeof CREATIVE_ART_STYLES)[number]["id"];

export function getCreativeMood(id: CreativeMood) {
  return CREATIVE_MOODS.find(option => option.id === id) ?? CREATIVE_MOODS[0];
}

export function getCreativeArtStyle(id: CreativeArtStyle) {
  return CREATIVE_ART_STYLES.find(option => option.id === id) ?? CREATIVE_ART_STYLES[0];
}

export const CREATIVE_FORMATS = [
  {
    id: "square_1_1",
    channel: "meta",
    name: "Square",
    width: 1080,
    height: 1080,
  },
  {
    id: "portrait_4_5",
    channel: "meta",
    name: "Portrait",
    width: 1080,
    height: 1350,
  },
  {
    id: "story_9_16",
    channel: "meta",
    name: "Stories",
    width: 1080,
    height: 1920,
  },
  {
    id: "google_rectangle",
    channel: "google_display",
    name: "Medium rectangle",
    width: 300,
    height: 250,
  },
  {
    id: "google_large_rectangle",
    channel: "google_display",
    name: "Large rectangle",
    width: 336,
    height: 280,
  },
  {
    id: "google_leaderboard",
    channel: "google_display",
    name: "Leaderboard",
    width: 728,
    height: 90,
  },
  {
    id: "google_skyscraper",
    channel: "google_display",
    name: "Wide skyscraper",
    width: 160,
    height: 600,
  },
  {
    id: "google_half_page",
    channel: "google_display",
    name: "Half page",
    width: 300,
    height: 600,
  },
  {
    id: "microsoft_landscape",
    channel: "microsoft",
    name: "Landscape",
    width: 1200,
    height: 628,
  },
  {
    id: "microsoft_square",
    channel: "microsoft",
    name: "Square",
    width: 1200,
    height: 1200,
  },
] as const;

export const SHOT_DIRECTIONS = {
  product: "Product only. No people.",
  female:
    "Lifestyle setting with an adult female model using the product naturally.",
  male: "Lifestyle setting with an adult male model using the product naturally.",
  lifestyle:
    "Lifestyle environment around the product with no people, hands, faces, silhouettes, or human figures. Show believable contextual use through the setting and surrounding objects only.",
} as const;

export const creativeCopySchema = z.object({
  headline: z.string().max(180),
  subheadline: z.string().max(400),
  cta: z.string().max(60),
});
export const creativeSetupSchema = z
  .object({
    version: z.literal(1),
    name: z.string().trim().min(1).max(180),
    theme: z.custom<CreativeThemeId>(
      value => typeof value === "string" && Boolean(CREATIVE_THEMES[value]),
      { message: "Choose a supported creative theme." }
    ),
    basePrompt: z.string().trim().min(20).max(8000).default(DEFAULT_CREATIVE_BASE_PROMPT),
    themePrompt: z.string().trim().min(10).max(4000).optional(),
    channels: z.array(z.enum(["meta", "google_display", "microsoft"])).max(3),
    formatIds: z.array(z.string()).max(CREATIVE_FORMATS.length),
    products: z
      .array(
        z.object({
          productId: z.number().int().positive(),
          imageId: z.number().int().positive(),
          featuredSpecKeys: z.array(z.string().min(1).max(500)).max(20),
          includePrice: z.boolean().default(false),
        })
      )
      .max(12),
    productMode: z.enum(["separate", "together"]),
    shot: z.enum(["product", "female", "male", "lifestyle"]),
    mood: z.enum(["clean", "vibrant", "dark", "minimal", "bold", "warm", "playful", "premium"]).default("clean"),
    artStyle: z.enum(["realistic", "animation", "illustration", "three_d", "editorial", "cinematic", "collage", "technical"]).default("realistic"),
    placement: z.enum(["auto", "left", "center", "right"]),
    logoAssetId: z.number().int().positive().nullable(),
    extraDirection: z.string().max(4000),
    copy: creativeCopySchema,
  })
  .superRefine((setup, ctx) => {
    if (!setup.themePrompt) setup.themePrompt = getCreativeTheme(setup.theme).direction;
    if (
      new Set(setup.channels).size !== setup.channels.length ||
      new Set(setup.formatIds).size !== setup.formatIds.length ||
      new Set(setup.products.map(p => p.productId)).size !==
        setup.products.length
    ) {
      ctx.addIssue({ code: "custom", message: "Selections must be unique." });
    }
    for (const id of setup.formatIds) {
      const format = CREATIVE_FORMATS.find(f => f.id === id);
      if (!format || !setup.channels.includes(format.channel))
        ctx.addIssue({
          code: "custom",
          path: ["formatIds"],
          message: "Choose a supported size for a selected channel.",
        });
    }
    if (setup.productMode === "together" && setup.products.length > 3)
      ctx.addIssue({
        code: "custom",
        path: ["products"],
        message:
          "Combine up to three products in one image, or create separate sets.",
      });
  });
export type CreativeSetup = z.infer<typeof creativeSetupSchema>;
export type CreativeCopy = z.infer<typeof creativeCopySchema>;

export function defaultCreativeSetup(): CreativeSetup {
  const theme = getCreativeTheme("spotlight");
  return {
    version: 1,
    name: "Product spotlight",
    theme: "spotlight",
    basePrompt: DEFAULT_CREATIVE_BASE_PROMPT,
    themePrompt: theme.direction,
    channels: ["meta"],
    formatIds: ["square_1_1", "portrait_4_5", "story_9_16"],
    products: [],
    productMode: "separate",
    shot: "product",
    mood: "clean",
    artStyle: "realistic",
    placement: "auto",
    logoAssetId: null,
    extraDirection: "",
    copy: {
      headline: theme.headline,
      subheadline: theme.subheadline,
      cta: theme.cta,
    },
  };
}
export function outputCount(setup: CreativeSetup) {
  return (
    setup.formatIds.length *
    (setup.productMode === "together"
      ? Math.min(1, setup.products.length)
      : setup.products.length)
  );
}
export function generationSetupIssues(setup: CreativeSetup) {
  const issues: string[] = [];
  if (!setup.products.length) issues.push("Select at least one product.");
  if (!setup.formatIds.length) issues.push("Select at least one size.");
  if (!setup.copy.headline.trim() || !setup.copy.cta.trim())
    issues.push("Add a headline and call to action.");
  if (outputCount(setup) > 24)
    issues.push(
      "Create up to 24 images per set. Reduce the selected products or sizes."
    );
  return issues;
}
export function formatDetails(id: string) {
  return CREATIVE_FORMATS.find(format => format.id === id);
}
export function metaCallToAction(label: string) {
  const text = label.trim().toLowerCase();
  if (/sign|register|join/.test(text)) return "SIGN_UP";
  if (/offer|deal/.test(text)) return "GET_OFFER";
  if (/shop|buy|order/.test(text)) return "SHOP_NOW";
  return "LEARN_MORE";
}
