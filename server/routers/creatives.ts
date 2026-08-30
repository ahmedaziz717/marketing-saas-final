import { and, desc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { brandAssets, brandKits, campaignBriefs, creativeJobs, creativeVariants, productImages, products, reviewComments } from "../../drizzle/schema";
import { generateImage, listImageModels } from "../_core/imageGeneration";
import { invokeLLM, listLLMModels } from "../_core/llm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { requireOrganizationRole } from "../lib/access";
import { appendActivity } from "../lib/activity";
import { generationBlockReason, stableHash } from "../lib/policy";
import { requireLatestGptImageModel, requireLatestGptTextModel } from "../lib/models";
import { storageGetBase64 } from "../storage";
import { importedProductCanBeUsed } from "../lib/brandImport";
import { categorizeGenerationError, selectGenerationSources } from "../lib/generation";

const conceptSchema = {
  type: "object",
  properties: {
    concepts: {
      type: "array",
      minItems: 2,
      maxItems: 4,
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          concept: { type: "string" },
          primaryText: { type: "string" },
          headline: { type: "string" },
          description: { type: "string" },
          callToAction: { type: "string", enum: ["SHOP_NOW", "LEARN_MORE", "SIGN_UP", "GET_OFFER"] },
          imagePrompt: { type: "string" },
        },
        required: ["name", "concept", "primaryText", "headline", "description", "callToAction", "imagePrompt"],
        additionalProperties: false,
      },
    },
  },
  required: ["concepts"],
  additionalProperties: false,
} as const;

type ConceptPlan = {
  concepts: Array<{ name: string; concept: string; primaryText: string; headline: string; description: string; callToAction: string; imagePrompt: string }>;
};

export const creativesRouter = router({
  overview: protectedProcedure.input(z.object({ organizationId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [briefs, jobs, variants, comments] = await Promise.all([
      db.select().from(campaignBriefs).where(and(eq(campaignBriefs.organizationId, input.organizationId), eq(campaignBriefs.status, "approved"))).orderBy(desc(campaignBriefs.updatedAtMs)),
      db.select().from(creativeJobs).where(eq(creativeJobs.organizationId, input.organizationId)).orderBy(desc(creativeJobs.createdAtMs)),
      db.select().from(creativeVariants).where(eq(creativeVariants.organizationId, input.organizationId)).orderBy(desc(creativeVariants.createdAtMs)),
      db.select().from(reviewComments).where(eq(reviewComments.organizationId, input.organizationId)).orderBy(desc(reviewComments.createdAtMs)),
    ]);
    return {
      briefs,
      jobs: jobs.map(job => ({
        ...job,
        errorMessage: job.errorMessage ? categorizeGenerationError(job.errorMessage).userMessage : null,
      })),
      variants,
      comments,
    };
  }),

  generate: protectedProcedure.input(z.object({ organizationId: z.number().int().positive(), briefId: z.number().int().positive(), count: z.number().int().min(2).max(4).default(3) })).mutation(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId, ["owner", "admin", "creator"]);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const brief = (await db.select().from(campaignBriefs).where(and(eq(campaignBriefs.id, input.briefId), eq(campaignBriefs.organizationId, input.organizationId))).limit(1))[0];
    const kit = (await db.select().from(brandKits).where(eq(brandKits.organizationId, input.organizationId)).limit(1))[0];
    if (!brief || !kit) throw new TRPCError({ code: "NOT_FOUND", message: "Brief or brand kit not found" });
    const assets = brief.assetIds.length ? await db.select().from(brandAssets).where(and(eq(brandAssets.organizationId, input.organizationId), inArray(brandAssets.id, brief.assetIds))) : [];
    const productIds = brief.productIds ?? [];
    const selectedProducts = productIds.length ? await db.select().from(products).where(and(eq(products.organizationId, input.organizationId), inArray(products.id, productIds))) : [];
    const selectedProductImages = selectedProducts.length ? await db.select().from(productImages).where(and(eq(productImages.organizationId, input.organizationId), inArray(productImages.productId, selectedProducts.map(product => product.id)))) : [];
    const block = generationBlockReason({ briefStatus: brief.status, brandKitStatus: kit.status, assetStatuses: assets.map(asset => asset.status) });
    if (block || assets.length !== brief.assetIds.length) throw new TRPCError({ code: "PRECONDITION_FAILED", message: block ?? "One or more source assets are unavailable" });
    if (selectedProducts.length !== productIds.length || selectedProducts.some(product => !importedProductCanBeUsed(product.status))) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Every selected product must remain approved before generation" });

    const productSnapshot = selectedProducts.map(product => ({ id: product.id, name: product.name, sku: product.sku, category: product.category, description: product.description, price: product.price, currency: product.currency, specifications: product.specifications, productUrl: product.productUrl, status: product.status, images: selectedProductImages.filter(image => image.productId === product.id).map(image => ({ storageKey: image.storageKey, url: image.url, isPrimary: image.isPrimary })) }));
    const briefSnapshot = { ...brief, brand: { name: kit.name, voice: kit.voice, colors: kit.colors, fonts: kit.fonts, requiredClaims: kit.requiredClaims, prohibitedContent: kit.prohibitedContent }, products: productSnapshot };
    const assetSnapshot = assets.map(asset => ({ id: asset.id, name: asset.name, type: asset.type, url: asset.url, mimeType: asset.mimeType, storageKey: asset.storageKey, status: asset.status }));
    const inputHash = stableHash({ briefSnapshot, assetSnapshot });
    const inserted = await db.insert(creativeJobs).values({ organizationId: input.organizationId, briefId: brief.id, status: "queued", inputHash, briefSnapshot, assetSnapshot, requestedByUserId: ctx.user.id, createdAtMs: Date.now() });
    const jobId = Number(inserted[0].insertId);
    await appendActivity({ organizationId: input.organizationId, actorUserId: ctx.user.id, action: "creative_generation.requested", entityType: "creative_job", entityId: jobId, payload: { briefId: brief.id, inputHash, count: input.count } });
    await db.update(creativeJobs).set({ status: "running" }).where(eq(creativeJobs.id, jobId));

    try {
      const { data: languageModels } = await listLLMModels();
      const languageModel = requireLatestGptTextModel(languageModels);
      const policyText = [kit.requiredClaims, brief.requiredClaims].filter(Boolean).join("\n");
      const prompt = `Create exactly ${input.count} distinct Meta image-ad concepts from this approved campaign brief.\n\nBRAND\nName: ${kit.name}\nVoice: ${kit.voice || "Clear and confident"}\nColors: ${kit.colors.join(", ")}\nFonts: ${kit.fonts.join(", ")}\nRequired claims (use only when relevant, reproduce accurately): ${policyText || "None"}\nProhibited content: ${kit.prohibitedContent || "None"}\n\nAPPROVED BRIEF\nAudience: ${brief.audience}\nOffer: ${brief.offer}\nPlacements: ${brief.placements.join(", ")}\nFormats: ${brief.formats.join(", ")}\nCreative direction: ${brief.creativeDirection}\nDestination: ${brief.destinationUrl || "Not provided"}\n\nAPPROVED BRAND ASSETS\n${assets.map(asset => `- ${asset.name} (${asset.type})`).join("\n")}\n\nAPPROVED CATALOG PRODUCTS\n${productSnapshot.length ? JSON.stringify(productSnapshot.map(product => ({ name: product.name, sku: product.sku, category: product.category, description: product.description, price: product.price, currency: product.currency, specifications: product.specifications, productUrl: product.productUrl }))) : "No catalog product selected"}\n\nWrite concise Meta-ready primary text and headlines. Use only the verified catalog specifications and approved claims above. Each imagePrompt must describe a polished advertising visual based only on approved assets, approved product imagery, and the direction. Do not invent products, certifications, prices, performance facts, logos, or claims. Ask the image model for no rendered text; the copy remains editable ad copy outside the image.`;
      const response = await invokeLLM({ model: languageModel, messages: [{ role: "system", content: "You are a senior performance creative director. Follow the brand and policy boundaries exactly and return only schema-valid JSON." }, { role: "user", content: prompt }], response_format: { type: "json_schema", json_schema: { name: "meta_creative_plan", strict: true, schema: conceptSchema } } });
      const rawContent = response.choices[0]?.message?.content;
      const plan = JSON.parse(typeof rawContent === "string" ? rawContent : "{}") as ConceptPlan;
      if (!Array.isArray(plan.concepts) || plan.concepts.length < 2) throw new Error("The creative plan did not contain enough concepts");
      const { models: imageModels } = await listImageModels();
      const imageModel = requireLatestGptImageModel(imageModels);
      const brandSources = assets.map(asset => ({ storageKey: asset.storageKey, mimeType: asset.mimeType, kind: "brand" as const }));
      const productSources = selectedProductImages.sort((a, b) => b.isPrimary - a.isPrimary).map(image => ({ storageKey: image.storageKey, mimeType: image.storageKey.endsWith(".png") ? "image/png" : image.storageKey.endsWith(".webp") ? "image/webp" : image.storageKey.endsWith(".gif") ? "image/gif" : "image/jpeg", kind: "product" as const }));
      const selectedSources = selectGenerationSources(brandSources, productSources);
      const sourceImages = (await Promise.all(selectedSources.supported.map(async source => {
        try {
          return { b64Json: await storageGetBase64(source.storageKey), mimeType: source.mimeType };
        } catch {
          return null;
        }
      }))).filter((source): source is { b64Json: string; mimeType: string } => source !== null);
      if (!sourceImages.length) throw new Error("No readable raster source images were available");
      const generated = await Promise.all(plan.concepts.slice(0, input.count).map(async (concept, index) => {
        const image = await generateImage({ model: imageModel, quality: "medium", originalImages: sourceImages, prompt: `${concept.imagePrompt}\n\nCreate a premium Meta advertising image for ${kit.name}. Preserve the supplied product and logo assets accurately. Use the approved palette ${kit.colors.join(", ")}. The intended output format is ${brief.formats[index % brief.formats.length]}. Render no words, letters, prices, badges, or invented marks in the image. No prohibited content: ${kit.prohibitedContent || "none specified"}.` });
        if (!image.url) throw new Error(`Image generation failed for ${concept.name}`);
        return { concept, imageUrl: image.url, format: brief.formats[index % brief.formats.length] ?? "square_1_1" };
      }));
      for (const item of generated) {
        await db.insert(creativeVariants).values({ organizationId: input.organizationId, jobId, briefId: brief.id, name: item.concept.name, concept: item.concept.concept, primaryText: item.concept.primaryText, headline: item.concept.headline, description: item.concept.description, callToAction: item.concept.callToAction, format: item.format, imageUrl: item.imageUrl, status: "pending", createdAtMs: Date.now() });
      }
      await db.update(creativeJobs).set({ status: "completed", completedAtMs: Date.now() }).where(eq(creativeJobs.id, jobId));
      await appendActivity({ organizationId: input.organizationId, actorUserId: ctx.user.id, action: "creative_generation.completed", entityType: "creative_job", entityId: jobId, payload: { variantCount: generated.length, languageModel, imageModel, rasterSourceCount: sourceImages.length, unsupportedSourceCount: selectedSources.unsupportedCount } });
      return { jobId, variantCount: generated.length };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Creative generation failed";
      const diagnostic = categorizeGenerationError(message);
      await db.update(creativeJobs).set({ status: "failed", errorMessage: message, completedAtMs: Date.now() }).where(eq(creativeJobs.id, jobId));
      await appendActivity({ organizationId: input.organizationId, actorUserId: ctx.user.id, action: "creative_generation.failed", entityType: "creative_job", entityId: jobId, outcome: "failure", payload: { category: diagnostic.category } });
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `${diagnostic.userMessage} No creative was approved or published.` });
    }
  }),

  reviewVariant: protectedProcedure.input(z.object({ organizationId: z.number().int().positive(), variantId: z.number().int().positive(), decision: z.enum(["approved", "rejected"]) })).mutation(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId, ["owner", "admin", "reviewer"]);
    const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const variant = (await db.select().from(creativeVariants).where(and(eq(creativeVariants.id, input.variantId), eq(creativeVariants.organizationId, input.organizationId))).limit(1))[0];
    if (!variant) throw new TRPCError({ code: "NOT_FOUND" });
    await db.update(creativeVariants).set({ status: input.decision, reviewedByUserId: ctx.user.id, reviewedAtMs: Date.now() }).where(eq(creativeVariants.id, input.variantId));
    await appendActivity({ organizationId: input.organizationId, actorUserId: ctx.user.id, action: `creative.${input.decision}`, entityType: "creative_variant", entityId: input.variantId, payload: { jobId: variant.jobId, briefId: variant.briefId } });
    return { success: true };
  }),

  addComment: protectedProcedure.input(z.object({ organizationId: z.number().int().positive(), variantId: z.number().int().positive(), body: z.string().min(1).max(3000) })).mutation(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId);
    const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const variant = (await db.select().from(creativeVariants).where(and(eq(creativeVariants.id, input.variantId), eq(creativeVariants.organizationId, input.organizationId))).limit(1))[0];
    if (!variant) throw new TRPCError({ code: "NOT_FOUND" });
    const inserted = await db.insert(reviewComments).values({ organizationId: input.organizationId, variantId: input.variantId, body: input.body, status: "open", authorUserId: ctx.user.id, createdAtMs: Date.now() });
    const commentId = Number(inserted[0].insertId);
    await appendActivity({ organizationId: input.organizationId, actorUserId: ctx.user.id, action: "creative.comment_added", entityType: "review_comment", entityId: commentId, payload: { variantId: input.variantId } });
    return { commentId };
  }),
});
