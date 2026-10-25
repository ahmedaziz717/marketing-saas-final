import { systemPromptContract } from "../../shared/promptContracts";
import { productFactsDirection } from "../../shared/studioProductFacts";
import { creativeMessaging } from "../../shared/creativeMessaging";
import {
  getCreativeArtStyle,
  getCreativeMood,
  getCreativeTheme,
  promotionContext,
  type CreativeSetup,
} from "../../shared/creativeBuilder";
import type { Message } from "../_core/llm";
import type { BuilderBrandKit, ResolvedBuilderInputs } from "./creativeBuilder";

/** Keep the selected subject separate from background and visual styling. */
export function buildCreativeCopyMessages(
  setup: CreativeSetup,
  brand: BuilderBrandKit,
  products: ResolvedBuilderInputs["products"],
  defaults: Record<string, string> = {}
): Message[] {
  const themePrompt =
    setup.themePrompt ||
    defaults[`creative.theme.${setup.theme}`] ||
    getCreativeTheme(setup.theme).direction;
  const promotion =
    setup.promotionMode === "platform" ? setup.promotion : undefined;
  return [
    {
      role: "system",
      content:
        systemPromptContract("contract.creativeCopy.1") +
        systemPromptContract("contract.creativeCopy.2") +
        productFactsDirection,
    },
    {
      role: "user",
      content: JSON.stringify({
        subject: promotion
          ? { type: promotion.sourceUrl ? "page" : "promotion", ...promotion }
          : {
              type: "catalog",
              products: products.map(({ image, ...product }) => product),
            },
        categoryHandling: setup.categoryHandling ?? "require_mapping",
        subjectRules: promotionContext(setup),
        campaign: creativeMessaging(setup.theme, themePrompt),
        brandBackground: {
          businessProfile: brand.businessProfile,
          name: brand.name,
          voice: brand.voice,
          requiredClaims: brand.requiredClaims,
          prohibitedContent: brand.prohibitedContent,
        },
        styleOnly: {
          theme: {
            ...getCreativeTheme(setup.theme),
            prompt: themePrompt,
          },
          basePrompt: setup.basePrompt,
          mood: {
            ...getCreativeMood(setup.mood),
            direction:
              defaults[`creative.mood.${setup.mood}`] ??
              getCreativeMood(setup.mood).direction,
          },
          artStyle: {
            ...getCreativeArtStyle(setup.artStyle),
            direction:
              defaults[`creative.style.${setup.artStyle}`] ??
              getCreativeArtStyle(setup.artStyle).direction,
          },
          shot: setup.shot,
          placement: setup.placement,
          extraDirection: setup.extraDirection,
        },
        priorCopy: setup.copy,
        instruction:
          !promotion && setup.productMode === "separate" && products.length > 1
            ? "Write copy that works for every selected product individually. Avoid naming just one product or attributing one product's specs to all. Only include a price if includePrice is true."
            : "Write fresh wording for the selected subject. Prior copy may concern a previous selection: replace any unrelated subject or claim. Only include catalog prices if includePrice is true.",
      }),
    },
  ];
}
