import { imageCategoryHandling } from "../../shared/catalogCategories";
import { systemPromptContract } from "../../shared/promptContracts";
import { readLifestylePortrait } from "./lifestylePeople";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { brandKits } from "../../drizzle/schema";
import { videoPrompt, type VideoSetup } from "../../shared/videoCreation";
import { invokeLLM, listLLMModels, type MessageContent } from "../_core/llm";
import { requireLatestGptTextModel } from "./models";
import { readGenerationSource } from "./creativeImages";
import { resolveVideoReferences, validateVideoReferences } from "./videoJobs";
import { productFactsDirection } from "../../shared/studioProductFacts";
import type { LibraryDatabase } from "./assetLibrary";
import { previewStudioPage } from "./studioProductPage";
import {
  applicationPromptForRun,
  visualDirectionDefaults,
} from "./promptRegistry";

export async function draftVideoPrompt(
  db: LibraryDatabase,
  organizationId: number,
  setup: VideoSetup
) {
  // Draft from optional images or text; an edit/extend draft need not have a source clip yet.
  const references = await resolveVideoReferences(
    db,
    organizationId,
    {
      ...setup,
      mode: "create",
      sourceVideoKey: null,
      prompt: "Draft from selected images",
    },
    "prompt"
  );
  const [brand] = await db
    .select()
    .from(brandKits)
    .where(eq(brandKits.organizationId, organizationId))
    .limit(1);
  if (
    !references.length &&
    !setup.prompt.trim() &&
    !setup.promotion?.description.trim() &&
    !brand?.businessProfile?.summary?.trim()
  )
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Describe your video idea, add a page, or complete your brand description first. Reference images are optional.",
    });
  if (setup.promotion?.sourceUrl && setup.promotion.pageContent === undefined) {
    try {
      const page = await previewStudioPage(setup.promotion.sourceUrl);
      setup = {
        ...setup,
        promotion: { ...setup.promotion, pageContent: page.pageContent },
      };
    } catch {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "The source page could not be read. Refresh its details in Page URL or describe the promotion manually.",
      });
    }
  }
  const content: MessageContent[] = [
    {
      type: "text",
      text: JSON.stringify({
        task: "Draft one editable video-generation prompt from the selected page or written idea, with any supplied numbered reference images. A selected page is the primary subject; brand information is background, not a replacement subject. With zero images, develop the stated subject and creative direction without referring to nonexistent images. Suggest a coherent opening, camera motion, subject action, and ending appropriate to the duration. Mention Image 1, Image 2, etc. only for supplied references. Describe visual motion, not a static advertising layout. Return a fresh variation if priorDescription is present.",
        subject: setup.promotion ?? null,
        mode: setup.mode,
        category: setup.category,
        duration: setup.duration,
        aspectRatio: setup.aspectRatio,
        sound: setup.sound,
        creativeDirection: videoPrompt(
          { ...setup, prompt: "" },
          {
            ...(await visualDirectionDefaults(organizationId, setup.direction)),
            "video.direction": (
              await applicationPromptForRun(
                "video.direction",
                setup.defaultInstructions,
                organizationId
              )
            ).value,
          }
        ),
        priorDescription: setup.prompt,
        categoryHandling: imageCategoryHandling(
          references.flatMap(ref =>
            ref.productFacts ? [ref.productFacts] : []
          ),
          setup.categoryHandling
        ),
        productFactRules: productFactsDirection,
        brand: brand
          ? {
              name: brand.name,
              voice: brand.voice,
              businessProfile: brand.businessProfile,
              requiredClaims: brand.requiredClaims,
              prohibitedContent: brand.prohibitedContent,
            }
          : null,
      }),
    },
  ];
  for (let index = 0; index < references.length; index++) {
    const reference = references[index];
    const source = reference.key.startsWith("person_library:")
      ? await readLifestylePortrait(
          reference.key.slice("person_library:".length)
        )
      : await readGenerationSource(reference.storageKey);
    const facts = reference.productFacts
      ? reference.productFacts
      : {
          name: reference.name,
          ...(reference.role === "logo"
            ? { role: "Brand logo artwork, not the subject or product" }
            : {}),
        };
    content.push(
      { type: "text", text: `Image ${index + 1}: ${JSON.stringify(facts)}` },
      {
        type: "image_url",
        image_url: {
          url: `data:${source.mimeType};base64,${source.b64Json}`,
          detail: "high",
        },
      }
    );
  }
  await validateVideoReferences(db, { organizationId, references });
  const model = requireLatestGptTextModel((await listLLMModels()).data);
  const response = await invokeLLM({
    promptTemplateId: "video.planner",
    promptTemplateOverride: setup.plannerInstructions,
    model,
    maxTokens: 6000,
    reasoning: { effort: "low" },
    messages: [
      {
        role: "system",
        content:
          systemPromptContract("contract.videoPrompt.1") +
          "\n" +
          productFactsDirection,
      },
      { role: "user", content },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "video_prompt",
        strict: true,
        schema: {
          type: "object",
          properties: { prompt: { type: "string" } },
          required: ["prompt"],
          additionalProperties: false,
        },
      },
    },
  });
  const text = response.choices[0]?.message?.content;
  return z
    .object({ prompt: z.string().trim().min(20).max(10000) })
    .parse(JSON.parse(typeof text === "string" ? text : "{}"));
}
