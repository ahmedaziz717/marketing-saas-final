import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { organizationMemberships } from "../../drizzle/schema";
import { categorySettingsSchema } from "../../shared/catalogCategories";
import { workflowRoles } from "../../shared/creativeWorkflow";
import { getDb } from "../db";
import { membershipAuthorization } from "./access";
import { withOrganizationTransaction } from "./activity";
import {
  readCategorySettings,
  saveCategorySettings,
  setProductCategoryOverride,
} from "./catalogCategories";
import { withMcpDraftReceipt, type DraftTransaction } from "./mcpDraftReceipt";
import { stableHash } from "./policy";
import { changePrompt, resolvedPrompts } from "./promptRegistry";

type Authorize = (
  tx: DraftTransaction,
  organizationId: number
) => Promise<void>;
export const mcpConfigurationReadInput = z
  .object({ organizationId: z.number().int().positive() })
  .strict();
export const mcpPromptReadInput = mcpConfigurationReadInput
  .extend({
    promptIds: z.array(z.string().min(1).max(180)).min(1).max(20).optional(),
    offset: z.number().int().min(0).max(10000).default(0),
    limit: z.number().int().min(1).max(20).default(20),
  })
  .strict();
const write = mcpConfigurationReadInput.extend({
  requestId: z.string().uuid(),
});
export const mcpPromptChangeInput = write
  .extend({
    promptId: z.string().min(1).max(180),
    expectedRevision: z.number().int().nonnegative(),
    value: z.string().trim().min(1).max(12000),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();
export const mcpCategorySaveInput = write
  .extend({
    revision: z.number().int().nonnegative(),
    settings: categorySettingsSchema,
    confirm: z.literal(true),
  })
  .strict();
export const mcpCategoryOverrideInput = write
  .extend({
    productId: z.number().int().positive(),
    updatedAtMs: z.number().finite(),
    categoryRevision: z.number().int().nonnegative(),
    categoryId: z.string().uuid(),
  })
  .strict();

function receipt<T>(
  tx: DraftTransaction,
  userId: number,
  authorize: Authorize,
  tool: string,
  requestId: string,
  input: { organizationId: number },
  save: () => Promise<T>
) {
  return withMcpDraftReceipt(
    tx,
    {
      actorUserId: userId,
      organizationId: input.organizationId,
      tool,
      requestId,
      payloadHash: stableHash(input),
      authorize,
      allowedRoles: ["owner", "admin"],
    },
    save
  );
}
export async function saveMcpPromptDefault(
  userId: number,
  authorize: Authorize,
  raw: unknown
) {
  const { requestId, ...input } = mcpPromptChangeInput.parse(raw);
  return changePrompt(
    { ...input, actorUserId: userId, action: "save" },
    (tx, save) =>
      receipt(
        tx,
        userId,
        authorize,
        "save_prompt_default",
        requestId,
        input,
        async () => ({ promptId: input.promptId, ...(await save()) })
      )
  );
}
export async function saveMcpCategorySettings(
  userId: number,
  authorize: Authorize,
  raw: unknown
) {
  const { requestId, ...input } = mcpCategorySaveInput.parse(raw);
  return saveCategorySettings(userId, input, (tx, save) =>
    receipt(
      tx,
      userId,
      authorize,
      "save_category_settings",
      requestId,
      input,
      async () => {
        const current = await readCategorySettings(tx, input.organizationId);
        const categoryIds = new Set(input.settings.categories.map(c => c.id));
        const mappingKeys = new Set(
          input.settings.mappings.map(m =>
            JSON.stringify([m.sourceId, m.sourceCategory])
          )
        );
        if (
          current.settings.categories.some(c => !categoryIds.has(c.id)) ||
          current.settings.mappings.some(
            m =>
              !mappingKeys.has(JSON.stringify([m.sourceId, m.sourceCategory]))
          )
        )
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "Deleting categories or source mappings is not permitted through this connection. Preserve existing entries.",
          });
        const saved = await save();
        return { revision: saved.revision, updatedAtMs: saved.updatedAtMs };
      }
    )
  );
}
export async function saveMcpCategoryOverride(
  userId: number,
  authorize: Authorize,
  raw: unknown
) {
  const { requestId, ...input } = mcpCategoryOverrideInput.parse(raw);
  return setProductCategoryOverride(userId, input, (tx, save) =>
    receipt(
      tx,
      userId,
      authorize,
      "assign_product_category",
      requestId,
      input,
      async () => {
        const saved = await save();
        return {
          productId: saved.id,
          updatedAtMs: saved.updatedAtMs,
          categoryRevision: input.categoryRevision,
          categoryId: input.categoryId,
        };
      }
    )
  );
}
async function read<T>(
  userId: number,
  authorize: Authorize,
  organizationId: number,
  run: (tx: DraftTransaction) => Promise<T>
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return withOrganizationTransaction(db, organizationId, async tx => {
    const [membership] = await tx
      .select()
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.organizationId, organizationId),
          eq(organizationMemberships.userId, userId)
        )
      )
      .for("share");
    if (
      !membershipAuthorization({
        membership,
        userId,
        organizationId,
        allowedRoles: [...workflowRoles],
      }).allowed
    )
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Active workspace membership required.",
      });
    await authorize(tx, organizationId);
    return run(tx);
  });
}
export async function readMcpPromptDefaults(
  userId: number,
  authorize: Authorize,
  raw: unknown
) {
  const input = mcpPromptReadInput.parse(raw);
  return read(userId, authorize, input.organizationId, async tx => {
    const all = (await resolvedPrompts(input.organizationId, tx)).filter(
      p => p.editable && (!input.promptIds || input.promptIds.includes(p.id))
    );
    const rows = input.promptIds
      ? all
      : all.slice(input.offset, input.offset + input.limit);
    return {
      prompts: rows.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        ...(input.promptIds ? { value: p.value } : {}),
        revision: p.revision,
        maxLength: p.maxLength,
        source: p.source,
      })),
      nextOffset:
        !input.promptIds && input.offset + rows.length < all.length
          ? input.offset + rows.length
          : null,
    };
  });
}
export async function readMcpCategorySettings(
  userId: number,
  authorize: Authorize,
  raw: unknown
) {
  const input = mcpConfigurationReadInput.parse(raw);
  return read(userId, authorize, input.organizationId, async tx => {
    const current = await readCategorySettings(tx, input.organizationId);
    return {
      revision: current.revision,
      settings: current.settings,
      updatedAtMs: current.updatedAtMs,
    };
  });
}
