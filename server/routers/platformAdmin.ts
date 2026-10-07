import { sendAccountInvitation } from "../lib/accountInvitations";
import { syncPublishedPricing } from "../lib/publishedPricing";
import { videoReadiness } from "../lib/videoJobs";
import { higgsfieldConfigured } from "../lib/higgsfield";
import { randomBytes, createHash } from "node:crypto";
import { and, eq, desc, sql, gte, lt, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import {
  organizations,
  organizationMemberships,
  brandKits,
  users,
} from "../../drizzle/schema";
import {
  platformAccounts,
  platformTiers,
  providerRates,
  aiUsage,
  creditLedger,
  platformFinancialEntries,
  platformAudit,
} from "../../drizzle/platformSchema";
import {
  tierInput,
  rateInput,
  utcCreditMonth,
  moneyMicros,
} from "../../shared/platformAdmin";
import { rangeSchema } from "../../shared/channels";
import { libraryDatabase } from "../lib/assetLibrary";
import { withOrganizationTransaction } from "../lib/activity";
import { creditState } from "../lib/aiMetering";
import { requireOrganizationRole } from "../lib/access";
import { openAICosts, BillingError } from "../lib/openaiCosts";
const org = z.number().int().positive(),
  reason = z.string().trim().min(3).max(1000);
const period = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/);
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
async function audit(
  tx: any,
  actorUserId: number,
  action: string,
  payload: Record<string, unknown>,
  organizationId?: number
) {
  await tx.insert(platformAudit).values({
    actorUserId,
    action,
    payload,
    organizationId: organizationId ?? null,
    createdAtMs: Date.now(),
  });
}
async function requireOrg(tx: any, id: number) {
  if (
    !(
      await tx
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.id, id))
        .limit(1)
    )[0]
  )
    throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });
}
export const platformAdminRouter = router({
  openaiCosts: adminProcedure
    .input(z.object({ range: rangeSchema }))
    .query(async ({ input }) => {
      try {
        return await openAICosts(input.range);
      } catch (error) {
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message:
            error instanceof BillingError
              ? error.message
              : "OpenAI billing is temporarily unavailable.",
        });
      }
    }),
  syncOpenaiCosts: adminProcedure
    .input(z.object({ range: rangeSchema }))
    .mutation(async ({ input }) => {
      try {
        return await openAICosts(input.range, true);
      } catch (error) {
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message:
            error instanceof BillingError
              ? error.message
              : "OpenAI billing is temporarily unavailable.",
        });
      }
    }),
  syncPublishedPricing: adminProcedure.mutation(async () => {
    await syncPublishedPricing(true);
    return { ok: true };
  }),
  config: adminProcedure.query(async () => {
    const db = await libraryDatabase();
    return {
      video: {
        configured: higgsfieldConfigured(),
        ...(await videoReadiness(db)),
      },
      tiers: await db
        .select()
        .from(platformTiers)
        .orderBy(platformTiers.monthlyCredits),
      rates: await db
        .select()
        .from(providerRates)
        .orderBy(providerRates.provider, providerRates.model),
    };
  }),
  accounts: adminProcedure
    .input(
      z
        .object({
          search: z.string().max(160).default(""),
          after: org.optional(),
          tierId: z.string().optional(),
          status: z.enum(["all", "paused", "enabled", "invited"]).optional(),
        })
        .default({ search: "" })
    )
    .query(async ({ input }) => {
      const db = await libraryDatabase();
      const filters = and(
        input.search
          ? or(
              ilike(organizations.name, `%${input.search}%`),
              ilike(platformAccounts.ownerEmail, `%${input.search}%`)
            )
          : undefined,
        input.tierId ? eq(platformAccounts.tierId, input.tierId) : undefined,
        input.status === "paused"
          ? eq(platformAccounts.aiPaused, 1)
          : undefined,
        input.status === "enabled"
          ? sql`coalesce(${platformAccounts.aiPaused},0)=0`
          : undefined,
        input.status === "invited"
          ? sql`${platformAccounts.inviteHash} is not null`
          : undefined
      );
      const [count] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(organizations)
        .leftJoin(
          platformAccounts,
          eq(platformAccounts.organizationId, organizations.id)
        )
        .where(filters);
      const rows = await db
        .select({
          organization: organizations,
          account: platformAccounts,
          tier: platformTiers,
        })
        .from(organizations)
        .leftJoin(
          platformAccounts,
          eq(platformAccounts.organizationId, organizations.id)
        )
        .leftJoin(platformTiers, eq(platformTiers.id, platformAccounts.tierId))
        .where(
          and(
            filters,
            input.after ? sql`${organizations.id}>${input.after}` : undefined
          )
        )
        .orderBy(organizations.id)
        .limit(51);
      return {
        total: count.total,
        items: rows.slice(0, 50).map(({ account, ...r }) => ({
          ...r,
          account: account
            ? {
                tierId: account.tierId,
                enforceCredits: account.enforceCredits,
                aiPaused: account.aiPaused,
                ownerEmail: account.ownerEmail,
                notes: account.notes,
                invitationPending: !!account.inviteHash,
              }
            : null,
        })),
        next: rows.length > 50 ? rows[49].organization.id : undefined,
      };
    }),
  account: adminProcedure
    .input(z.object({ organizationId: org }))
    .query(async ({ input }) => {
      const db = await libraryDatabase();
      const state = await creditState(db, input.organizationId);
      return {
        period: state.period,
        allowance: state.allowance,
        remaining: state.remaining,
        ledger: await db
          .select()
          .from(creditLedger)
          .where(eq(creditLedger.organizationId, input.organizationId))
          .orderBy(desc(creditLedger.createdAtMs))
          .limit(100),
        members: await db
          .select({
            email: users.email,
            name: users.name,
            role: organizationMemberships.role,
            status: organizationMemberships.status,
          })
          .from(organizationMemberships)
          .innerJoin(users, eq(users.id, organizationMemberships.userId))
          .where(
            eq(organizationMemberships.organizationId, input.organizationId)
          ),
      };
    }),
  createAccount: adminProcedure
    .input(
      z.object({
        name: z.string().trim().min(2).max(160),
        ownerEmail: z.string().email().max(320),
        tierId: z.string().min(1),
        enforceCredits: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await libraryDatabase(),
        now = Date.now(),
        token = randomBytes(32).toString("hex"),
        email = input.ownerEmail.toLowerCase().trim();
      const result = await db.transaction(async tx => {
        if (
          !(
            await tx
              .select()
              .from(platformTiers)
              .where(eq(platformTiers.id, input.tierId))
          )[0]
        )
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Choose a valid tier",
          });
        const [owner] = await tx
          .select()
          .from(users)
          .where(sql`lower(${users.email})=${email}`)
          .limit(1);
        const [workspace] = await tx
          .insert(organizations)
          .values({
            name: input.name,
            slug: `${input.name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .slice(0, 100)}-${randomBytes(6).toString("hex")}`,
            createdByUserId: ctx.user.id,
            createdAtMs: now,
          })
          .returning();
        if (owner)
          await tx.insert(organizationMemberships).values({
            organizationId: workspace.id,
            userId: owner.id,
            role: "owner",
            status: "active",
            createdAtMs: now,
          });
        await tx.insert(brandKits).values({
          organizationId: workspace.id,
          name: `${input.name} Brand`,
          colors: ["#15141A", "#F4F1EA"],
          fonts: ["Manrope"],
          status: "draft",
          updatedByUserId: ctx.user.id,
          updatedAtMs: now,
        });
        await tx.insert(platformAccounts).values({
          organizationId: workspace.id,
          tierId: input.tierId,
          enforceCredits: input.enforceCredits ? 1 : 0,
          ownerEmail: email,
          inviteHash: owner ? null : hash(token),
          inviteExpiresAtMs: owner ? null : now + 7 * 86400000,
          updatedAtMs: now,
        });
        await audit(
          tx,
          ctx.user.id,
          "account.created",
          { ...input },
          workspace.id
        );
        return {
          organizationId: workspace.id,
          invitePath: owner ? null : `/account-invite/${token}`,
        };
      });
      const delivery = result.invitePath
        ? await sendAccountInvitation(email, input.name, result.invitePath)
        : { status: "not_needed" as const };
      await audit(
        db,
        ctx.user.id,
        "account.invitation_email",
        delivery,
        result.organizationId
      );
      return { ...result, delivery };
    }),
  renewInvite: adminProcedure
    .input(z.object({ organizationId: org }))
    .mutation(async ({ ctx, input }) => {
      const db = await libraryDatabase(),
        token = randomBytes(32).toString("hex");
      const result = await withOrganizationTransaction(
        db,
        input.organizationId,
        async tx => {
          const [a] = await tx
            .select()
            .from(platformAccounts)
            .where(eq(platformAccounts.organizationId, input.organizationId));
          if (!a?.inviteHash)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "No pending owner invitation",
            });
          await tx
            .update(platformAccounts)
            .set({
              inviteHash: hash(token),
              inviteExpiresAtMs: Date.now() + 7 * 86400000,
              updatedAtMs: Date.now(),
            })
            .where(eq(platformAccounts.organizationId, input.organizationId));
          await audit(
            tx,
            ctx.user.id,
            "account.invite_renewed",
            {},
            input.organizationId
          );
          return {
            invitePath: `/account-invite/${token}`,
            email: a.ownerEmail,
          };
        }
      );
      const [workspace] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, input.organizationId));
      const delivery = await sendAccountInvitation(
        result.email!,
        workspace.name,
        result.invitePath
      );
      await audit(
        db,
        ctx.user.id,
        "account.invitation_email",
        delivery,
        input.organizationId
      );
      return { invitePath: result.invitePath, delivery };
    }),
  acceptAccount: protectedProcedure
    .input(z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }))
    .mutation(async ({ ctx, input }) => {
      const db = await libraryDatabase();
      const [account] = await db
        .select()
        .from(platformAccounts)
        .where(eq(platformAccounts.inviteHash, hash(input.token)));
      if (!account)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invitation unavailable",
        });
      return withOrganizationTransaction(
        db,
        account.organizationId,
        async tx => {
          const [a] = await tx
            .select()
            .from(platformAccounts)
            .where(eq(platformAccounts.organizationId, account.organizationId));
          if (
            a.inviteHash !== hash(input.token) ||
            !a.inviteExpiresAtMs ||
            a.inviteExpiresAtMs < Date.now() ||
            a.ownerEmail !== ctx.user.email?.toLowerCase()
          )
            throw new TRPCError({
              code: "FORBIDDEN",
              message:
                "Use the invited verified email address and an unexpired invitation.",
            });
          await tx
            .insert(organizationMemberships)
            .values({
              organizationId: a.organizationId,
              userId: ctx.user.id,
              role: "owner",
              status: "active",
              createdAtMs: Date.now(),
            })
            .onConflictDoUpdate({
              target: [
                organizationMemberships.organizationId,
                organizationMemberships.userId,
              ],
              set: { role: "owner", status: "active" },
            });
          await tx
            .update(platformAccounts)
            .set({
              inviteHash: null,
              inviteExpiresAtMs: null,
              updatedAtMs: Date.now(),
            })
            .where(eq(platformAccounts.organizationId, a.organizationId));
          await audit(
            tx,
            ctx.user.id,
            "account.invite_accepted",
            {},
            a.organizationId
          );
          return { organizationId: a.organizationId };
        }
      );
    }),
  saveAccount: adminProcedure
    .input(
      z.object({
        organizationId: org,
        tierId: z.string().nullable(),
        enforceCredits: z.boolean(),
        aiPaused: z.boolean(),
        notes: z.string().max(4000),
        reason,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await libraryDatabase();
      return withOrganizationTransaction(db, input.organizationId, async tx => {
        await requireOrg(tx, input.organizationId);
        if (input.enforceCredits && !input.tierId)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Assign a tier before enabling limits",
          });
        if (
          input.tierId &&
          !(
            await tx
              .select()
              .from(platformTiers)
              .where(eq(platformTiers.id, input.tierId))
          )[0]
        )
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Tier unavailable",
          });
        const values = {
          tierId: input.tierId,
          enforceCredits: input.enforceCredits ? 1 : 0,
          aiPaused: input.aiPaused ? 1 : 0,
          notes: input.notes,
          updatedAtMs: Date.now(),
        };
        await tx
          .insert(platformAccounts)
          .values({ organizationId: input.organizationId, ...values })
          .onConflictDoUpdate({
            target: platformAccounts.organizationId,
            set: values,
          });
        await audit(
          tx,
          ctx.user.id,
          "account.updated",
          input,
          input.organizationId
        );
        return { ok: true };
      });
    }),
  saveTier: adminProcedure
    .input(tierInput.extend({ reason }))
    .mutation(async ({ ctx, input }) => {
      const db = await libraryDatabase();
      return db.transaction(async tx => {
        const values = {
          name: input.name,
          monthlyCredits: input.monthlyCredits,
          monthlyPriceMicros: moneyMicros(input.monthlyPriceUsd),
          updatedAtMs: Date.now(),
        };
        await tx
          .insert(platformTiers)
          .values({ id: input.id, ...values })
          .onConflictDoUpdate({ target: platformTiers.id, set: values });
        await audit(tx, ctx.user.id, "tier.updated", input);
        return { ok: true };
      });
    }),
  adjustCredits: adminProcedure
    .input(
      z.object({
        organizationId: org,
        period,
        amount: z
          .number()
          .int()
          .min(-100000000)
          .max(100000000)
          .refine(v => v !== 0),
        reason,
        requestId: z.string().uuid(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await libraryDatabase();
      return withOrganizationTransaction(db, input.organizationId, async tx => {
        await requireOrg(tx, input.organizationId);
        const result = await tx
          .insert(creditLedger)
          .values({
            id: input.requestId,
            organizationId: input.organizationId,
            period: input.period,
            amount: input.amount,
            reason: input.reason,
            actorUserId: ctx.user.id,
            createdAtMs: Date.now(),
          })
          .onConflictDoNothing()
          .returning();
        if (result.length)
          await audit(
            tx,
            ctx.user.id,
            "credits.adjusted",
            input,
            input.organizationId
          );
        return { ok: true };
      });
    }),
  saveRate: adminProcedure.input(rateInput).mutation(async ({ ctx, input }) => {
    const db = await libraryDatabase();
    return db.transaction(async tx => {
      await tx
        .insert(providerRates)
        .values({
          provider: input.provider,
          model: input.model,
          kind: input.kind,
          config: {
            ...input,
            automaticPricing: input.automaticPricing ?? false,
            pricingVerifiedAt: undefined,
            pricingError: undefined,
          },
          updatedAtMs: Date.now(),
        })
        .onConflictDoUpdate({
          target: [
            providerRates.provider,
            providerRates.model,
            providerRates.kind,
          ],
          set: {
            config: {
              ...input,
              automaticPricing: input.automaticPricing ?? false,
              pricingVerifiedAt: undefined,
              pricingError: undefined,
            },
            updatedAtMs: Date.now(),
          },
        });
      await audit(tx, ctx.user.id, "provider_rate.updated", input);
      return { ok: true };
    });
  }),
  addFinancial: adminProcedure
    .input(
      z.object({
        requestId: z.string().uuid(),
        organizationId: org.nullable(),
        kind: z.enum(["revenue", "cost"]),
        amountUsd: z
          .number()
          .min(-100000000)
          .max(100000000)
          .refine(v => v !== 0),
        date: z.string().date(),
        description: reason,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await libraryDatabase();
      return db.transaction(async tx => {
        if (input.organizationId) await requireOrg(tx, input.organizationId);
        const rows = await tx
          .insert(platformFinancialEntries)
          .values({
            id: input.requestId,
            organizationId: input.organizationId,
            kind: input.kind,
            amountMicros: moneyMicros(input.amountUsd),
            description: input.description,
            occurredAtMs: Date.parse(input.date + "T12:00:00Z"),
            actorUserId: ctx.user.id,
          })
          .onConflictDoNothing()
          .returning();
        if (rows.length)
          await audit(
            tx,
            ctx.user.id,
            "financial_entry.recorded",
            input,
            input.organizationId ?? undefined
          );
        return { ok: true };
      });
    }),
  report: adminProcedure
    .input(z.object({ range: rangeSchema, organizationId: org.optional() }))
    .query(async ({ input }) => {
      const db = await libraryDatabase(),
        start = Date.parse(input.range.since + "T00:00:00Z"),
        end = Date.parse(input.range.until + "T00:00:00Z") + 86400000;
      const where = and(
        gte(aiUsage.createdAtMs, start),
        lt(aiUsage.createdAtMs, end),
        input.organizationId
          ? eq(aiUsage.organizationId, input.organizationId)
          : undefined
      );
      const groups = await db
        .select({
          organizationId: aiUsage.organizationId,
          organizationName: organizations.name,
          provider: aiUsage.provider,
          model: aiUsage.model,
          kind: aiUsage.kind,
          status: aiUsage.status,
          requests: sql<number>`count(*)`.mapWith(Number),
          inputTokens:
            sql<number>`coalesce(sum(${aiUsage.inputTokens}),0)`.mapWith(
              Number
            ),
          outputTokens:
            sql<number>`coalesce(sum(${aiUsage.outputTokens}),0)`.mapWith(
              Number
            ),
          costMicros:
            sql<number>`coalesce(sum(${aiUsage.costMicros}),0)`.mapWith(Number),
          unpriced:
            sql<number>`count(*) filter(where ${aiUsage.costMicros} is null)`.mapWith(
              Number
            ),
          credits:
            sql<number>`coalesce(sum(case when ${aiUsage.status} != 'failed' then ${aiUsage.credits} else 0 end),0)`.mapWith(
              Number
            ),
        })
        .from(aiUsage)
        .leftJoin(organizations, eq(organizations.id, aiUsage.organizationId))
        .where(where)
        .groupBy(
          organizations.name,
          aiUsage.organizationId,
          aiUsage.provider,
          aiUsage.model,
          aiUsage.kind,
          aiUsage.status
        );
      const financial = await db
        .select({
          organizationId: platformFinancialEntries.organizationId,
          kind: platformFinancialEntries.kind,
          amountMicros:
            sql<number>`sum(${platformFinancialEntries.amountMicros})`.mapWith(
              Number
            ),
        })
        .from(platformFinancialEntries)
        .where(
          and(
            gte(platformFinancialEntries.occurredAtMs, start),
            lt(platformFinancialEntries.occurredAtMs, end),
            input.organizationId
              ? eq(
                  platformFinancialEntries.organizationId,
                  input.organizationId
                )
              : undefined
          )
        )
        .groupBy(
          platformFinancialEntries.organizationId,
          platformFinancialEntries.kind
        );
      const recent = await db
        .select()
        .from(aiUsage)
        .where(where)
        .orderBy(desc(aiUsage.createdAtMs))
        .limit(50);
      const entries = await db
        .select()
        .from(platformFinancialEntries)
        .where(
          and(
            gte(platformFinancialEntries.occurredAtMs, start),
            lt(platformFinancialEntries.occurredAtMs, end),
            input.organizationId
              ? eq(
                  platformFinancialEntries.organizationId,
                  input.organizationId
                )
              : undefined
          )
        )
        .orderBy(desc(platformFinancialEntries.occurredAtMs))
        .limit(50);
      return {
        groups,
        financial,
        recent,
        entries,
        coverage:
          "Account costs are calculated from recorded request tokens and each request's pricing snapshot. Image estimates include text input, image input and image output separately. Historical requests with complete usage were backfilled using verified standard pricing, with an audit record. Provider discounts and billing adjustments may differ. Older assets without token records cannot be priced reliably. Unpriced and failed requests may have additional costs. Revenue and overhead are manually recorded; Stripe is not connected.",
      };
    }),
  audit: adminProcedure.query(async () =>
    (await libraryDatabase())
      .select()
      .from(platformAudit)
      .orderBy(desc(platformAudit.createdAtMs))
      .limit(100)
  ),
  customerCredits: protectedProcedure
    .input(z.object({ organizationId: org }))
    .query(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId);
      const s = await creditState(
        await libraryDatabase(),
        input.organizationId
      );
      return {
        tier: s.tier?.name ?? "Not assigned",
        period: s.period,
        allowance: s.allowance,
        remaining: s.remaining,
        enforced: !!s.account?.enforceCredits,
        paused: !!s.account?.aiPaused,
      };
    }),
});
