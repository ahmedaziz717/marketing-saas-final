import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { requireOrganizationRole } from "../lib/access";
import { libraryDatabase } from "../lib/assetLibrary";
import {
  aiModelSettings,
  aiPricingPolicy,
  platformAudit,
  platformTiers,
  providerRates,
} from "../../drizzle/platformSchema";
import {
  creditPolicySchema,
  estimatedActionCredits,
} from "../../shared/aiCredits";
import {
  generationModel,
  generationModels,
  modelOptionsSchema,
} from "../../shared/modelCatalog";
import {
  compatibleRoutes,
  adminModelActionQuote,
  defaultModelRate,
  imageModelQuote,
  imageBatchQuote,
  initializeModelCatalog,
  modelRate,
  publicModelCatalog,
  syncOpenAIModelAvailability,
} from "../lib/modelCatalog";
import { creditState } from "../lib/aiMetering";
import { getCreditPolicy, effectiveRate } from "../lib/creditPricing";
import { syncPublishedPricing } from "../lib/publishedPricing";
import { workflowNodeSchema } from "../../shared/creativeWorkflow";
import { workflowNodeCredits } from "../lib/creativeWorkflows";
import {
  imageActionAssumptionsSchema,
  imageOutputSizeSchema,
} from "../../shared/imageActionEstimate";
import { videoActionAssumptionsSchema } from "../../shared/videoActionEstimate";
import { providerDiscount } from "../lib/seedancePricing";
import {
  textActionBudgets,
  textActionRate,
  type TextAction,
} from "../../shared/textActionEstimate";
const scope = z.object({ organizationId: z.number().int().positive() });
async function authorized(userId: number, organizationId: number) {
  await requireOrganizationRole(userId, organizationId, [
    "owner",
    "admin",
    "creator",
    "reviewer",
    "publisher",
  ]);
  return libraryDatabase();
}
export const modelsRouter = router({
  nodeQuote: protectedProcedure
    .input(scope.extend({ node: workflowNodeSchema }))
    .query(async ({ ctx, input }) => ({
      credits: await workflowNodeCredits(
        await authorized(ctx.user.id, input.organizationId),
        input.node,
        input.organizationId
      ),
      estimated: true,
    })),
  catalog: protectedProcedure.input(scope).query(async ({ ctx, input }) => {
    const catalog = await publicModelCatalog(
      await authorized(ctx.user.id, input.organizationId)
    );
    return catalog.filter(model => model.enabled);
  }),
  credits: protectedProcedure.input(scope).query(async ({ ctx, input }) => {
    const db = await authorized(ctx.user.id, input.organizationId),
      state = await creditState(db, input.organizationId),
      policy = await getCreditPolicy(db);
    const textRate = await effectiveRate(db, "openai", "gpt-5.5", "text");
    return {
      period: state.period,
      packageName: state.tier?.name ?? "No package assigned",
      allowance: state.allowance,
      remaining: state.remaining,
      enforced: !!state.account?.enforceCredits,
      paused: !!state.account?.aiPaused,
      creditValueMicros: policy.creditValueMicros,
      textEstimate: estimatedActionCredits(
        textActionRate(textRate, "standard")
      ),
      textEstimates: Object.fromEntries(
        (Object.keys(textActionBudgets) as TextAction[]).map(action => [
          action,
          estimatedActionCredits(textActionRate(textRate, action)),
        ])
      ) as Record<TextAction, number>,
    };
  }),
  packages: protectedProcedure.input(scope).query(async ({ ctx, input }) => {
    const db = await authorized(ctx.user.id, input.organizationId);
    return db
      .select({
        id: platformTiers.id,
        name: platformTiers.name,
        monthlyCredits: platformTiers.monthlyCredits,
      })
      .from(platformTiers);
  }),
  imageQuote: protectedProcedure
    .input(
      scope.extend({
        modelId: z.string().max(240).optional(),
        options: modelOptionsSchema.optional(),
        count: z.number().int().min(1).max(144).default(1),
        outputs: z.array(imageOutputSizeSchema).min(1).max(144).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await authorized(ctx.user.id, input.organizationId);
      if (input.outputs) {
        const quote = await imageBatchQuote(
          db,
          input.modelId,
          input.options,
          input.outputs
        );
        return {
          credits: quote.credits,
          perImage: null,
          estimated: true,
          routeId: quote.model.id,
        };
      }
      const quote = await imageModelQuote(db, input.modelId, input.options);
      return {
        credits: quote.credits * input.count,
        perImage: quote.credits,
        estimated: true,
        routeId: quote.model.id,
      };
    }),
  adminCatalog: adminProcedure
    .input(
      z
        .object({
          imageEstimate: imageActionAssumptionsSchema.optional(),
          videoEstimate: videoActionAssumptionsSchema.optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const db = await libraryDatabase();
      await initializeModelCatalog(db);
      const policy = await getCreditPolicy(db),
        settings = await db.select().from(aiModelSettings),
        rates = await db.select().from(providerRates);
      const models = (await publicModelCatalog(db)).map(model => {
        const definition = generationModel(model.routeId)!;
        const base =
          rates.find(
            r =>
              r.provider === definition.provider &&
              r.model === definition.providerModel
          )?.config ?? defaultModelRate(definition);
        let actionEstimate: ReturnType<typeof adminModelActionQuote> | null =
          null;
        let estimateProblem: string | null = null;
        try {
          actionEstimate = adminModelActionQuote(
            definition,
            {
              ...base,
              billingMode: "cost",
              markupPercent: base.markupPercent ?? policy.markupPercent,
              creditValueMicros: policy.creditValueMicros,
            },
            input?.imageEstimate,
            input?.videoEstimate
          );
          if (
            definition.provider === "higgsfield" &&
            actionEstimate.costMicros != null
          ) {
            const discount = providerDiscount(base);
            const costMicros = Math.round(
              actionEstimate.costMicros * (1 - discount / 100)
            );
            actionEstimate = {
              ...actionEstimate,
              costMicros,
              credits: Math.ceil(
                (costMicros *
                  (1 + (base.markupPercent ?? policy.markupPercent) / 100)) /
                  policy.creditValueMicros
              ),
              basis: discount
                ? `Reference estimate · verified ${discount}% account discount`
                : "Reference estimate · account discount not configured",
            };
          }
        } catch (error) {
          actionEstimate = null;
          estimateProblem =
            error instanceof Error
              ? error.message
              : "Estimate unavailable for these settings.";
        }
        return { ...model, actionEstimate, estimateProblem };
      });
      return { policy, models, settings, rates };
    }),
  savePolicy: adminProcedure
    .input(creditPolicySchema)
    .mutation(async ({ ctx, input }) => {
      const db = await libraryDatabase();
      await db.transaction(async tx => {
        await tx
          .insert(aiPricingPolicy)
          .values({ id: "global", config: input, updatedAtMs: Date.now() })
          .onConflictDoUpdate({
            target: aiPricingPolicy.id,
            set: { config: input, updatedAtMs: Date.now() },
          });
        await tx.insert(platformAudit).values({
          actorUserId: ctx.user.id,
          action: "ai.pricing_policy.updated",
          payload: input,
          createdAtMs: Date.now(),
        });
      });
      return { ok: true };
    }),
  setEnabled: adminProcedure
    .input(z.object({ id: z.string().max(240), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (!generationModel(input.id))
        throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown model." });
      const db = await libraryDatabase();
      await db.transaction(async tx => {
        await tx
          .insert(aiModelSettings)
          .values({
            id: input.id,
            enabled: input.enabled ? 1 : 0,
            updatedAtMs: Date.now(),
          })
          .onConflictDoUpdate({
            target: aiModelSettings.id,
            set: {
              enabled: input.enabled ? 1 : 0,
              updatedAtMs: Date.now(),
            },
          });
        await tx.insert(platformAudit).values({
          actorUserId: ctx.user.id,
          action: "ai.model.offering.updated",
          payload: input,
          createdAtMs: Date.now(),
        });
      });
      return input;
    }),
  saveModel: adminProcedure
    .input(
      z.object({
        id: z.string().max(240),
        routeId: z.string().max(240),
        markupPercent: z.number().min(0).max(1000).nullable(),
        estimatedCostUsd: z.number().min(0).max(1000).nullable(),
        perRequestUsd: z.number().min(0).max(1000).nullable(),
        perSecondUsd: z.number().min(0).max(1000).nullable(),
        providerDiscountPercent: z
          .number()
          .min(0)
          .max(99.99)
          .nullable()
          .optional(),
        providerDiscountEvidence: z.string().trim().max(500).optional(),
        providerDiscountValidUntil: z
          .number()
          .int()
          .positive()
          .nullable()
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.providerDiscountPercent) {
        if (
          !input.providerDiscountEvidence ||
          !input.providerDiscountValidUntil ||
          input.providerDiscountValidUntil <= Date.now()
        )
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Record the account discount source and a future review date.",
          });
      }
      if (!compatibleRoutes(input.id).includes(input.routeId))
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Select a supported route for the same model.",
        });
      const db = await libraryDatabase(),
        model = generationModel(input.routeId)!;
      if (model.kind === "image" && input.perSecondUsd != null)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Image models use per-request or token prices, not per-second prices.",
        });
      await db.transaction(async tx => {
        await tx
          .insert(aiModelSettings)
          .values({
            id: input.id,
            routeId: input.routeId,
            updatedAtMs: Date.now(),
          })
          .onConflictDoUpdate({
            target: aiModelSettings.id,
            set: {
              routeId: input.routeId,
              updatedAtMs: Date.now(),
            },
          });
        const [row] = await tx
          .select()
          .from(providerRates)
          .where(
            and(
              eq(providerRates.provider, model.provider),
              eq(providerRates.model, model.providerModel),
              eq(providerRates.kind, model.kind)
            )
          );
        if (!row)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Model pricing not initialized.",
          });
        await tx
          .update(providerRates)
          .set({
            config: {
              ...row.config,
              automaticPricing:
                input.perRequestUsd != null
                  ? false
                  : row.config.automaticPricing,
              markupPercent: input.markupPercent,
              estimatedCostMicros:
                input.estimatedCostUsd == null
                  ? undefined
                  : Math.round(input.estimatedCostUsd * 1e6),
              perRequestUsd: input.perRequestUsd,
              perSecondUsd: input.perSecondUsd,
              ...(input.providerDiscountPercent !== undefined
                ? {
                    providerDiscountPercent: input.providerDiscountPercent,
                    providerDiscountEvidence:
                      input.providerDiscountEvidence ?? "",
                    providerDiscountValidUntil:
                      input.providerDiscountValidUntil ?? null,
                    providerDiscountVerifiedAt: Date.now(),
                  }
                : {}),
            },
            updatedAtMs: Date.now(),
          })
          .where(eq(providerRates.id, row.id));
        await tx.insert(platformAudit).values({
          actorUserId: ctx.user.id,
          action: "ai.model.updated",
          payload: input,
          createdAtMs: Date.now(),
        });
      });
      return { ok: true };
    }),
  syncAvailability: adminProcedure.mutation(async () => {
    const db = await libraryDatabase();
    await initializeModelCatalog(db);
    const result = await syncOpenAIModelAvailability(db);
    await syncPublishedPricing(true);
    return result;
  }),
});
