import { and, eq } from "drizzle-orm";
import { aiPricingPolicy, providerRates } from "../../drizzle/platformSchema";
import { defaultCreditPolicy } from "../../shared/aiCredits";
import type { ProviderRate } from "../../shared/platformAdmin";
import type { LibraryDatabase, LibraryTransaction } from "./assetLibrary";
type Database = LibraryDatabase | LibraryTransaction;
export async function getCreditPolicy(db: Database) {
  const [row] = await db
    .select()
    .from(aiPricingPolicy)
    .where(eq(aiPricingPolicy.id, "global"));
  return row?.config ?? defaultCreditPolicy;
}
export async function effectiveRate(
  db: Database,
  provider: string,
  model: string,
  kind: ProviderRate["kind"],
  fallback?: ProviderRate
): Promise<ProviderRate> {
  const [row] = await db
    .select()
    .from(providerRates)
    .where(
      and(
        eq(providerRates.provider, provider),
        eq(providerRates.model, model),
        eq(providerRates.kind, kind)
      )
    );
  const rate = row?.config ?? fallback;
  if (!rate)
    throw new Error(
      "Model pricing is not configured. Contact your administrator."
    );
  const policy = await getCreditPolicy(db);
  return {
    ...rate,
    billingMode: "cost",
    markupPercent: rate.markupPercent ?? policy.markupPercent,
    creditValueMicros: policy.creditValueMicros,
    estimatedCostMicros:
      rate.estimatedCostMicros ??
      (kind === "image" ? 200000 : kind === "text" ? 50000 : undefined),
  };
}
