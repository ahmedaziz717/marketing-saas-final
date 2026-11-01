import {
  CREATIVE_THEME_LIST,
  DEFAULT_CREATIVE_BASE_PROMPT,
} from "./creativeThemes";
import { PROMPT_CONTRACTS } from "./promptContracts";
import {
  CREATIVE_ART_STYLES,
  CREATIVE_MOODS,
  SHOT_DIRECTIONS,
  type CreativeSetup,
} from "./creativeBuilder";

export type PromptDefinition = {
  id: string;
  name: string;
  area: string;
  baseline: string;
  version: number;
  editable: boolean;
  description: string;
  maxLength: number;
};
const definition = (
  id: string,
  name: string,
  area: string,
  baseline: string,
  description = "Workspace default for new work. Existing saved work keeps its explicit instructions."
): PromptDefinition => ({
  id,
  name,
  area,
  baseline,
  version: 1,
  editable: true,
  description,
  maxLength:
    id === "google.pmax.copy" ? 6000 : id === "creative.base"
      ? 8000
      : id.startsWith("creative.theme.")
        ? 4000
        : 12000,
});

export const PROMPT_REGISTRY: readonly PromptDefinition[] = [
  ...PROMPT_CONTRACTS,
  definition(
    "creative.base",
    "Creative direction",
    "Creative Studio",
    DEFAULT_CREATIVE_BASE_PROMPT,
    "Your reusable creative instructions, added to the current Brand Kit voice and selected subject. This is not the complete generation prompt."
  ),
  ...CREATIVE_THEME_LIST.map(theme =>
    definition(
      `creative.theme.${theme.id}`,
      `${theme.name} theme`,
      "Creative themes",
      theme.direction
    )
  ),
  ...CREATIVE_MOODS.map(mood =>
    definition(
      `creative.mood.${mood.id}`,
      `${mood.name} mood`,
      "Creative direction",
      mood.direction
    )
  ),
  ...CREATIVE_ART_STYLES.map(style =>
    definition(
      `creative.style.${style.id}`,
      `${style.name} style`,
      "Creative direction",
      style.direction
    )
  ),
  ...Object.entries(SHOT_DIRECTIONS).map(([id, value]) =>
    definition(`creative.shot.${id}`, `${id} shot`, "Creative direction", value)
  ),
  definition(
    "creative.copy",
    "Creative copy writer",
    "Creative Studio",
    "Write one fresh set of advertising copy for the selected subject. Use the selected campaign occasion, audience and brand voice. Keep the subject specific and use a suitable call to action."
  ),
  definition(
    "google.pmax.copy",
    "Performance Max copy writer",
    "Google Ads",
    "Draft Google Performance Max headlines, long headlines and descriptions from supplied brand, product facts and confirmed category guidance. Use specific truthful benefits and varied natural copy. Never invent offers, specifications or claims. Return draft suggestions for human review."
  ),
  definition(
    "creative.image",
    "Image art direction",
    "Creative Studio",
    "Create a polished advertising image with clear hierarchy, deliberate composition and readable selected copy."
  ),
  definition(
    "creative.enhancement",
    "Image enhancement",
    "Creative Studio",
    "Improve resolution, material detail, lighting, depth, edge quality, color harmony and professional finishing while preserving the original composition."
  ),
  definition(
    "creative.plan",
    "Creative concept planner",
    "Creative Studio",
    "Act as a senior performance creative director and develop distinct, grounded creative concepts."
  ),
  definition(
    "workflow.assistant",
    "Workflow text assistant",
    "Workflows & Apps",
    "Write useful creative text following the supplied brief. Return the requested text without a preamble."
  ),
  definition(
    "workflow.optimizeCopy",
    "Workflow copy improvement",
    "Workflows & Apps",
    "Propose evidence-grounded creative improvements. Separate observations from test hypotheses."
  ),
  definition(
    "workflow.image",
    "Workflow image direction",
    "Workflows & Apps",
    "Create an intentional, polished composition following the supplied creative direction."
  ),
  definition(
    "video.planner",
    "Video prompt planner",
    "Video Studio",
    "Write a concise, specific video-generation prompt grounded in supplied images and approved facts. Follow the chosen visual setting and style."
  ),
  definition(
    "video.direction",
    "Video generation direction",
    "Video Studio",
    "Adapt the selected visual direction into coherent motion with deliberate camera movement and a clear beginning and ending."
  ),
  definition(
    "legacy.image",
    "Campaign image direction",
    "Campaign concepts",
    "Create a premium advertising image with polished composition and restrained branding."
  ),
  definition(
    "publishing.copy",
    "Social caption writer",
    "Publishing",
    "Write distinct, platform-appropriate captions for the requested slots using the selected brand voice and campaign direction."
  ),
  definition(
    "brand.summary",
    "Brand voice summarizer",
    "Brand",
    "Create a concise semantic brand-voice summary for creative generation. Preserve identity, audience, tone, messaging priorities and important do/don't rules. Consolidate repetition and examples into their underlying principles."
  ),
  definition(
    "crawl.extract",
    "Website evidence extraction",
    "Imports",
    "Extract brand facts and genuine commerce products from the supplied website evidence."
  ),
  definition(
    "catalog.api",
    "API catalog mapping",
    "Imports",
    "Configure a read-only product catalog from its response structure and API documentation."
  ),
  definition(
    "brand.profile",
    "Business profile suggestion",
    "Brand",
    "Suggest a business profile for human review, grounded in the supplied website evidence."
  ),
  definition(
    "brand.website",
    "Website brand identity",
    "Brand",
    "Suggest the website operator's brand identity and a concise voice guide covering tone, audience, vocabulary and wording to avoid."
  ),
  definition(
    "catalog.offerings",
    "Owned offerings discovery",
    "Imports",
    "Identify the website operator's own platform and subscription or membership offerings from supplied evidence."
  ),
  definition(
    "copy.asset",
    "Asset caption and ad copy",
    "Activation Studio",
    "Write fresh, distinct alternatives using the supplied setup, brand and selected copy direction. Match the channel, audience and intended call to action."
  ),
  definition(
    "workflow.choices",
    "Workflow choice suggestions",
    "Workflows & Apps",
    "Generate distinct, useful creative options with specific generation directions, rather than names alone."
  ),
  definition(
    "marketing.general",
    "Marketing draft guidance",
    "Marketing",
    "Create useful marketing drafts grounded in the supplied brief, selected audience and brand voice."
  ),
];

export function promptDefinition(id: string) {
  return PROMPT_REGISTRY.find(item => item.id === id);
}
export type ResolvedPrompt = PromptDefinition & {
  value: string;
  revision: number;
  source: "system" | "workspace";
  updatedAtMs: number | null;
  restorePoints?: { original: { value: string; baselineVersion: number }; brand: { value: string; revision: number } | null };
};

export function newCreativeDefaults(
  setup: CreativeSetup,
  prompts: readonly ResolvedPrompt[]
): CreativeSetup {
  return {
    ...setup,
    basePrompt:
      prompts.find(p => p.id === "creative.base")?.value ?? setup.basePrompt,
    themePrompt:
      prompts.find(p => p.id === `creative.theme.${setup.theme}`)?.value ??
      setup.themePrompt,
  };
}
