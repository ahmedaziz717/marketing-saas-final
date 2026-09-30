import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import {
  aiUsage,
  creditLedger,
  platformAccounts,
  platformTiers,
  providerRates,
} from "../../drizzle/platformSchema";
import { withOrganizationTransaction } from "./activity";
import {
  estimateCostMicros,
  utcCreditMonth,
  type ProviderRate,
} from "../../shared/platformAdmin";
export const aiScope = new AsyncLocalStorage<{
  organizationId: number;
  actorUserId: number;
  operation: string;
}>();
export async function creditState(
  db: any,
  organizationId: number,
  period = utcCreditMonth()
) {
  const [account] = await db
    .select()
    .from(platformAccounts)
    .where(eq(platformAccounts.organizationId, organizationId));
  const [tier] = account?.tierId
    ? await db
        .select()
        .from(platformTiers)
        .where(eq(platformTiers.id, account.tierId))
    : [];
  const [balance] = await db
    .select({
      value: sql<number>`coalesce(sum(${creditLedger.amount}),0)`.mapWith(
        Number
      ),
    })
    .from(creditLedger)
    .where(
      and(
        eq(creditLedger.organizationId, organizationId),
        eq(creditLedger.period, period)
      )
    );
  return {
    account,
    tier,
    period,
    allowance: tier?.monthlyCredits ?? 0,
    adjustments: balance?.value ?? 0,
    remaining: (tier?.monthlyCredits ?? 0) + (balance?.value ?? 0),
  };
}
function token(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}
export async function meteredCall<T>(
  provider: string,
  model: string,
  kind: "text" | "image" | "other",
  call: () => Promise<{ value: T; usage?: Record<string, unknown> }>
): Promise<T> {
  const scope = aiScope.getStore();
  // Unit tests without a request context do not access production persistence.
  if (process.env.NODE_ENV === "test" && !scope) return (await call()).value;
  const db = await getDb();
  if (!db) throw new Error("AI usage accounting is unavailable. Please retry.");
  const [pricing] = await db
    .select()
    .from(providerRates)
    .where(
      and(
        eq(providerRates.provider, provider),
        eq(providerRates.model, model),
        eq(providerRates.kind, kind)
      )
    );
  const rate = pricing?.config as ProviderRate | undefined,
    credits = rate?.credits ?? (kind === "image" ? 10 : 1),
    id = randomUUID(),
    period = utcCreditMonth(),
    createdAtMs = Date.now();
  const start = async (tx: any) => {
    if (scope) {
      const state = await creditState(tx, scope.organizationId, period);
      if (state.account?.aiPaused)
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "AI generation is paused for this account. Contact your administrator.",
        });
      if (state.account?.enforceCredits && state.remaining < credits)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Insufficient AI credits. This request needs ${credits} credits; ${Math.max(0, state.remaining)} remain.`,
        });
      await tx
        .insert(creditLedger)
        .values({
          id,
          organizationId: scope.organizationId,
          period,
          amount: -credits,
          reason: `Reserved: ${kind} generation`,
          actorUserId: scope.actorUserId,
          createdAtMs,
        });
    }
    await tx
      .insert(aiUsage)
      .values({
        id,
        organizationId: scope?.organizationId ?? null,
        actorUserId: scope?.actorUserId ?? null,
        operation: scope?.operation ?? "unattributed",
        provider,
        model,
        kind,
        status: "pending",
        credits,
        period,
        createdAtMs,
        rateSnapshot: rate ?? null,
      });
  };
  if (scope) await withOrganizationTransaction(db, scope.organizationId, start);
  else await db.transaction(start);
  let result: Awaited<ReturnType<typeof call>>;
  try {
    result = await call();
  } catch (error) {
    const failed = async (tx: any) => {
      await tx
        .update(aiUsage)
        .set({ status: "failed", finishedAtMs: Date.now() })
        .where(eq(aiUsage.id, id));
      if (scope)
        await tx
          .insert(creditLedger)
          .values({
            id: `refund:${id}`,
            organizationId: scope.organizationId,
            period,
            amount: credits,
            reason: "Automatic credit refund: provider request failed",
            actorUserId: scope.actorUserId,
            createdAtMs: Date.now(),
          })
          .onConflictDoNothing();
    };
    if (scope)
      await withOrganizationTransaction(db, scope.organizationId, failed);
    else await db.transaction(failed);
    throw error;
  }
  const usage = result.usage ?? {},
    input = token(usage.prompt_tokens ?? usage.input_tokens),
    output = token(usage.completion_tokens ?? usage.output_tokens);
  const detail = (usage.prompt_tokens_details ?? usage.input_tokens_details) as
    | Record<string, unknown>
    | undefined;
  const cached = Math.min(input ?? 0, token(detail?.cached_tokens) ?? 0);
  // Image token categories have different prices. Require a configured per-request
  // estimate for images rather than multiplying blended tokens by a text rate.
  const cost =
    kind === "image" && rate?.perRequestUsd == null
      ? null
      : estimateCostMicros(rate, input, output, cached);
  await db
    .update(aiUsage)
    .set({
      status: "succeeded",
      usage,
      inputTokens: input,
      outputTokens: output,
      cachedTokens: cached,
      costMicros: cost,
      finishedAtMs: Date.now(),
    })
    .where(eq(aiUsage.id, id));
  return result.value;
}
