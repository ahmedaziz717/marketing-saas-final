import { createHash } from "node:crypto";
import { promptGroup } from "../../shared/promptPresentation";
import { and, asc, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { promptRevisions } from "../../drizzle/schema";
import {
  PROMPT_REGISTRY,
  promptDefinition,
  type ResolvedPrompt,
} from "../../shared/promptRegistry";
import { getDb } from "../db";
import { appendActivity, withOrganizationTransaction } from "./activity";
import { aiScope } from "./aiMetering";
import type { CreativeSetup } from "../../shared/creativeBuilder";

export async function creativePromptDefaults(
  organizationId: number,
  setup: CreativeSetup
) {
  const ids = [
    "creative.image",
    "creative.enhancement",
    `creative.theme.${setup.theme}`,
    `creative.mood.${setup.mood}`,
    `creative.style.${setup.artStyle}`,
    `creative.shot.${setup.shot}`,
  ];
  const rows = await Promise.all(
    ids
      .filter(id => promptDefinition(id))
      .map(id => applicationPrompt(id, organizationId))
  );
  return Object.fromEntries(rows.map(row => [row.id, row.value]));
}

export async function resolvedPrompts(
  organizationId: number
): Promise<ResolvedPrompt[]> {
  const db = await getDb();
  if (!db) throw new Error("Prompt defaults are unavailable. Please retry.");
  const rows = await db
    .selectDistinctOn([promptRevisions.promptId])
    .from(promptRevisions)
    .where(eq(promptRevisions.organizationId, organizationId))
    .orderBy(promptRevisions.promptId, desc(promptRevisions.revision));
  const [originals, brands] = await Promise.all([
    db.selectDistinctOn([promptRevisions.promptId]).from(promptRevisions)
      .where(eq(promptRevisions.organizationId, organizationId))
      .orderBy(promptRevisions.promptId, asc(promptRevisions.revision)),
    db.selectDistinctOn([promptRevisions.promptId]).from(promptRevisions)
      .where(and(eq(promptRevisions.organizationId, organizationId), eq(promptRevisions.action, "personalize_brand")))
      .orderBy(promptRevisions.promptId, asc(promptRevisions.revision)),
  ]);
  return PROMPT_REGISTRY.map(item => {
    const current = item.editable
      ? rows.find(row => row.promptId === item.id)
      : undefined;
    return {
      ...item,
      value: current?.value ?? item.baseline,
      revision: current?.revision ?? 0,
      source: current?.value != null ? "workspace" : "system",
      updatedAtMs: current?.createdAtMs ?? null,
      restorePoints: {
        original: { value: originals.find(row => row.promptId === item.id)?.baselineValue ?? item.baseline, baselineVersion: originals.find(row => row.promptId === item.id)?.baselineVersion ?? item.version },
        brand: brands.find(row => row.promptId === item.id)?.value != null
          ? { value: brands.find(row => row.promptId === item.id)!.value!, revision: brands.find(row => row.promptId === item.id)!.revision } : null,
      },
    };
  });
}

export async function visualDirectionDefaults(
  organizationId: number,
  direction:
    | { theme: string; mood: string; artStyle: string }
    | null
    | undefined
) {
  if (!direction) return {};
  const ids = [
    `creative.theme.${direction.theme}`,
    `creative.mood.${direction.mood}`,
    `creative.style.${direction.artStyle}`,
  ];
  const rows = await Promise.all(
    ids
      .filter(id => promptDefinition(id))
      .map(id => applicationPrompt(id, organizationId))
  );
  return Object.fromEntries(rows.map(row => [row.id, row.value]));
}

export async function applicationPrompt(
  id: string,
  organizationId = aiScope.getStore()?.organizationId
) {
  const definition = promptDefinition(id);
  if (!definition) throw new Error("Unknown application prompt");
  if (!organizationId) {
    if (process.env.NODE_ENV === "test")
      return {
        ...definition,
        value: definition.baseline,
        revision: 0,
        source: "system" as const,
        updatedAtMs: null,
      };
    throw new Error("Workspace context is required for prompt defaults");
  }
  const scope = aiScope.getStore();
  const prompts =
    scope?.organizationId === organizationId
      ? await (scope.resolvedPromptDefaults ??= resolvedPrompts(organizationId))
      : await resolvedPrompts(organizationId);
  const prompt = prompts.find(row => row.id === id)!;
  if (scope?.organizationId === organizationId)
    (scope.promptVersions ??= {})[id] = {
      revision: prompt.revision,
      baselineVersion: prompt.version,
      source: prompt.source,
    };
  return prompt;
}

export async function changePrompt(input: {
  organizationId: number;
  actorUserId: number;
  promptId: string;
  expectedRevision: number;
  action: "save" | "restore_system" | "restore_revision" | "restore_original" | "restore_brand_initial";
  value?: string;
  restoreRevision?: number;
  reason: string;
}) {
  const definition = promptDefinition(input.promptId);
  if (!definition?.editable)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This prompt is protected or unavailable.",
    });
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return withOrganizationTransaction(db, input.organizationId, async tx => {
    const scope = and(
      eq(promptRevisions.organizationId, input.organizationId),
      eq(promptRevisions.promptId, input.promptId)
    );
    const [current] = await tx
      .select()
      .from(promptRevisions)
      .where(scope)
      .orderBy(desc(promptRevisions.revision))
      .limit(1);
    if ((current?.revision ?? 0) !== input.expectedRevision)
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "This default changed while you were editing. Review the latest version before saving.",
      });
    let value: string | null = null;
    let restoredFromRevision: number | null = null;
    if (input.action === "save") {
      value = input.value?.trim() ?? "";
      if (!value || value.length > definition.maxLength)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Enter a prompt between 1 and ${definition.maxLength.toLocaleString("en-US")} characters.`,
        });
    } else if (input.action === "restore_original" || input.action === "restore_brand_initial") {
      const [first] = await tx.select().from(promptRevisions)
        .where(input.action === "restore_brand_initial" ? and(scope, eq(promptRevisions.action, "personalize_brand")) : scope)
        .orderBy(asc(promptRevisions.revision)).limit(1);
      if (input.action === "restore_brand_initial" && !first?.value)
        throw new TRPCError({ code: "NOT_FOUND", message: "No initial brand-personalized default exists for this workspace prompt." });
      value = input.action === "restore_original" ? (first?.baselineValue ?? definition.baseline) : first!.value;
      restoredFromRevision = input.action === "restore_original" ? 0 : first!.revision;
    } else if (input.action === "restore_revision") {
      const [previous] = await tx
        .select()
        .from(promptRevisions)
        .where(
          and(scope, eq(promptRevisions.revision, input.restoreRevision ?? -1))
        )
        .limit(1);
      if (!previous)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That workspace revision was not found.",
        });
      restoredFromRevision = previous.revision;
      value =
        previous.value ??
        (previous.baselineVersion === definition.version
          ? null
          : previous.baselineValue);
    }
    const revision = (current?.revision ?? 0) + 1;
    await tx.insert(promptRevisions).values({
      organizationId: input.organizationId,
      promptId: input.promptId,
      revision,
      value,
      baselineVersion: definition.version,
      baselineValue: definition.baseline,
      action: input.action,
      restoredFromRevision,
      actorUserId: input.actorUserId,
      reason: input.reason,
      createdAtMs: Date.now(),
    });
    await appendActivity(
      {
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        action: `prompt.${input.action}`,
        entityType: "prompt",
        entityId: input.promptId,
        payload: {
          revision,
          baselineVersion: definition.version,
          restoredFromRevision,
        },
      },
      tx
    );
    return { revision };
  });
}

/** Per-run instructions replace only the editable task default, never protected contracts. */
export async function applicationPromptForRun(id: string, override?: string, organizationId?: number) {
  const prompt = await applicationPrompt(id, organizationId);
  if (override === undefined) return prompt;
  const value = override.trim();
  if (!prompt.editable || promptGroup(id) === "technical" || !value || value.length > prompt.maxLength)
    throw new Error("Invalid per-run task instructions.");
  const scope = aiScope.getStore();
  if (scope?.promptVersions?.[id]) scope.promptVersions[id] = { ...scope.promptVersions[id], source: "run", overrideHash: createHash("sha256").update(value).digest("hex") };
  return { ...prompt, value };
}
