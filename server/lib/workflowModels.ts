import { eq } from "drizzle-orm";
import { aiModelSettings, providerRates } from "../../drizzle/platformSchema";
import {
  DEFAULT_TEXT_MODEL,
  workflowTextModels,
} from "../../shared/workflowModelCatalog";
import type { LibraryDatabase, LibraryTransaction } from "./assetLibrary";
import { effectiveRate } from "./creditPricing";
import { ENV } from "../_core/env";
type Database = LibraryDatabase | LibraryTransaction;

export async function publicWorkflowTextModels(db: Database) {
  const [settings, rates] = await Promise.all([
    db.select().from(aiModelSettings),
    db.select().from(providerRates),
  ]);
  return workflowTextModels.map(model => {
    const setting = settings.find(s => s.id === model.id);
    const rate = rates.find(
      r => r.provider === "openai" && r.kind === "text" && r.model === model.id
    );
    const reason =
      setting?.enabled === 0
        ? "Disabled by administrator"
        : !ENV.openAiApiKey
          ? "Provider setup required"
          : setting?.availability === "unavailable"
            ? "Not available on this OpenAI account"
            : model.id !== DEFAULT_TEXT_MODEL &&
                setting?.availability !== "available"
              ? "Awaiting account verification"
              : !rate
                ? "Pricing configuration required"
                : null;
    return {
      ...model,
      kind: "text" as const,
      available: !reason,
      enabled: setting?.enabled !== 0,
      reason,
    };
  });
}

export async function resolveWorkflowTextModel(
  db: Database,
  id = DEFAULT_TEXT_MODEL
) {
  if (!workflowTextModels.some(m => m.id === id))
    throw new Error("Choose a supported text model.");
  const [setting] = await db
    .select()
    .from(aiModelSettings)
    .where(eq(aiModelSettings.id, id));
  if (setting?.enabled === 0 || setting?.availability === "unavailable")
    throw new Error("This text model is unavailable. Choose another model.");
  if (id !== DEFAULT_TEXT_MODEL && setting?.availability !== "available")
    throw new Error(
      "This text model is awaiting account availability verification."
    );
  // Never quote or bill a different model's rate.
  await effectiveRate(db, "openai", id, "text");
  return id;
}
