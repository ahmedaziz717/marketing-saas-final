import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  activityEvents,
  organizationMemberships,
  products,
} from "../../drizzle/schema";
import { channelConnections } from "../../drizzle/channelSchema";
import {
  PLAN_IDS,
  PRODUCT_FEATURES,
  PROPOSED_PLANS,
  resolveFeatureAccess,
  USAGE_METERS,
  usageMonthRange,
} from "../../shared/frameProduct";
import { protectedProcedure, router } from "../_core/trpc";
import { requireOrganizationRole } from "../lib/access";
import { appendActivity, withOrganizationTransaction } from "../lib/activity";
import { libraryDatabase } from "../lib/assetLibrary";
const scope = z.object({ organizationId: z.number().int().positive() });
const monthSchema = z.string().refine(value => {
  try {
    usageMonthRange(value);
    return true;
  } catch {
    return false;
  }
}, "Choose a valid month.");
const managers = ["owner", "admin"] as const;
const planAction = "billing.preview_plan_selected";

export const billingRouter = router({
  entitlements: protectedProcedure
    .input(scope)
    .query(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId);
      return {
        mode: "preview" as const,
        enforcement: false,
        features: PRODUCT_FEATURES.map(feature =>
          resolveFeatureAccess(feature.id, { mode: "preview" })
        ),
      };
    }),
  summary: protectedProcedure
    .input(scope.extend({ month: monthSchema }))
    .query(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId, [
        ...managers,
      ]);
      const db = await libraryDatabase();
      const range = usageMonthRange(input.month);
      const plan = (
        await db
          .select({ id: activityEvents.id, payload: activityEvents.payload })
          .from(activityEvents)
          .where(
            and(
              eq(activityEvents.organizationId, input.organizationId),
              eq(activityEvents.action, planAction)
            )
          )
          .orderBy(desc(activityEvents.id))
          .limit(1)
      )[0];
      const selectedPlan = z.enum(PLAN_IDS).safeParse(plan?.payload?.planId);
      // The existing append-only audit ledger records successful outputs transactionally.
      // Collapse replays by action/entity before applying the month window, so a repeated
      // completion event cannot be charged/counted in a second month. Never infer token
      // costs, image-request counts or credits from output counts.
      const measured = db
        .select({
          action: activityEvents.action,
          entityType: activityEvents.entityType,
          at: sql<number>`min(${activityEvents.createdAtMs})`.as("first_at"),
          quantity:
            sql<number>`max(case when ${activityEvents.action} = 'creative_generation.completed' then case when (${activityEvents.payload}->>'variantCount') ~ '^[1-9][0-9]{0,5}$' then (${activityEvents.payload}->>'variantCount')::integer else 0 end else 1 end)`.as(
              "quantity"
            ),
        })
        .from(activityEvents)
        .where(
          and(
            eq(activityEvents.organizationId, input.organizationId),
            eq(activityEvents.outcome, "success"),
            inArray(
              activityEvents.action,
              USAGE_METERS.map(m => m.action)
            )
          )
        )
        .groupBy(
          activityEvents.action,
          activityEvents.entityType,
          activityEvents.entityId
        )
        .as("measured");
      const [counts, seats, catalog, connected] = await Promise.all([
        db
          .select({
            action: measured.action,
            entityType: measured.entityType,
            quantity: sql<number>`sum(${measured.quantity})`.mapWith(Number),
          })
          .from(measured)
          .where(and(gte(measured.at, range.start), lt(measured.at, range.end)))
          .groupBy(measured.action, measured.entityType),
        db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(organizationMemberships)
          .where(
            and(
              eq(organizationMemberships.organizationId, input.organizationId),
              eq(organizationMemberships.status, "active")
            )
          ),
        db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(products)
          .where(eq(products.organizationId, input.organizationId)),
        db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(channelConnections)
          .where(
            and(
              eq(channelConnections.organizationId, input.organizationId),
              eq(channelConnections.status, "connected")
            )
          ),
      ]);
      return {
        mode: "preview" as const,
        commercialStatus: "proposal" as const,
        chargesEnabled: false,
        enforcement: false,
        selectedPreviewPlanId: selectedPlan.success ? selectedPlan.data : null,
        revision: plan?.id ?? 0,
        plans: PROPOSED_PLANS,
        month: input.month,
        period: { ...range, timezone: "UTC" as const },
        creditsUsed: null,
        creditRatesStatus: "not_configured" as const,
        usage: USAGE_METERS.map(meter => ({
          id: meter.id,
          label: meter.label,
          unit: meter.unit,
          quantity:
            counts.find(
              row =>
                row.action === meter.action && row.entityType === meter.entity
            )?.quantity ?? 0,
        })),
        inventory: {
          activeSeats: seats[0].count,
          catalogItems: catalog[0].count,
          connectedAccounts: connected[0].count,
        },
        coverage:
          "Successful outputs retained in the audit ledger. Includes historical completion events; excludes failed jobs, provider token costs and unmetered AI operations. Counts are not billable credits.",
      };
    }),
  selectPreviewPlan: protectedProcedure
    .input(
      scope.extend({
        planId: z.enum(PLAN_IDS),
        revision: z.number().int().nonnegative(),
        previewOnly: z.literal(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId, [
        ...managers,
      ]);
      return withOrganizationTransaction(
        await libraryDatabase(),
        input.organizationId,
        async tx => {
          // Recheck membership under the workspace lock used by membership writes.
          const member = (
            await tx
              .select({ role: organizationMemberships.role })
              .from(organizationMemberships)
              .where(
                and(
                  eq(
                    organizationMemberships.organizationId,
                    input.organizationId
                  ),
                  eq(organizationMemberships.userId, ctx.user.id),
                  eq(organizationMemberships.status, "active")
                )
              )
              .limit(1)
          )[0];
          if (!member || (member.role !== "owner" && member.role !== "admin"))
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Your workspace role does not permit billing changes.",
            });
          const last = (
            await tx
              .select({
                id: activityEvents.id,
                payload: activityEvents.payload,
              })
              .from(activityEvents)
              .where(
                and(
                  eq(activityEvents.organizationId, input.organizationId),
                  eq(activityEvents.action, planAction)
                )
              )
              .orderBy(desc(activityEvents.id))
              .limit(1)
          )[0];
          if (last?.payload?.planId === input.planId)
            return { success: true, previewOnly: true };
          if ((last?.id ?? 0) !== input.revision)
            throw new TRPCError({
              code: "CONFLICT",
              message:
                "The plan preview changed. Refresh before choosing another preview.",
            });
          await appendActivity(
            {
              organizationId: input.organizationId,
              actorUserId: ctx.user.id,
              action: planAction,
              entityType: "billing_preview",
              entityId: input.organizationId,
              payload: {
                planId: input.planId,
                previewOnly: true,
                chargesEnabled: false,
              },
            },
            tx
          );
          return { success: true, previewOnly: true };
        }
      );
    }),
});
