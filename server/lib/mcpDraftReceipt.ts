import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  activityEvents,
  organizationMemberships,
  type OrganizationRole,
} from "../../drizzle/schema";
import { workflowRoles } from "../../shared/creativeWorkflow";
import { getDb } from "../db";
import { membershipAuthorization } from "./access";
import { appendActivity } from "./activity";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export type DraftTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];
export type DraftSaveHook<Row, Result = Row> = (
  tx: DraftTransaction,
  save: () => Promise<Row>
) => Promise<Result>;
export type McpDraftReceiptOptions = {
  actorUserId: number;
  organizationId: number;
  tool: string;
  requestId: string;
  payloadHash: string;
  authorize: (tx: DraftTransaction, organizationId: number) => Promise<void>;
  allowedRoles?: OrganizationRole[];
};
const identity = z.object({
  actorUserId: z.number().int().positive(),
  organizationId: z.number().int().positive(),
  tool: z.string().regex(/^[a-z][a-z0-9_]{0,79}$/),
  requestId: z.string().uuid(),
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
});

/** Caller MUST hold the existing organization transaction lock. No network work belongs in save. */
export async function withMcpDraftReceipt<T>(
  tx: DraftTransaction,
  options: McpDraftReceiptOptions,
  save: () => Promise<T>
): Promise<T> {
  const key = identity.parse(options);
  const [membership] = await tx
    .select()
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, key.organizationId),
        eq(organizationMemberships.userId, key.actorUserId)
      )
    )
    .for("share");
  if (
    !membershipAuthorization({
      membership,
      userId: key.actorUserId,
      organizationId: key.organizationId,
      allowedRoles: options.allowedRoles ?? [...workflowRoles],
    }).allowed
  )
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Your active workspace membership does not permit this draft save.",
    });
  await options.authorize(tx, key.organizationId);
  const [receipt] = await tx
    .select({ payload: activityEvents.payload })
    .from(activityEvents)
    .where(
      and(
        eq(activityEvents.organizationId, key.organizationId),
        eq(activityEvents.actorUserId, key.actorUserId),
        eq(activityEvents.entityType, key.tool),
        eq(activityEvents.correlationId, key.requestId),
        eq(activityEvents.action, "mcp.draft_saved")
      )
    )
    .limit(1);
  if (receipt) {
    if (receipt.payload?.payloadHash !== key.payloadHash)
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "This request ID already saved different input. Check the original result before creating a new request.",
      });
    return receipt.payload!.result as T;
  }
  const result = await save();
  if (JSON.stringify(result).length > 4096)
    throw new Error("Draft receipt exceeds the bounded result contract.");
  await appendActivity(
    {
      organizationId: key.organizationId,
      actorUserId: key.actorUserId,
      action: "mcp.draft_saved",
      entityType: key.tool,
      entityId: key.requestId,
      correlationId: key.requestId,
      payload: { payloadHash: key.payloadHash, result },
    },
    tx
  );
  return result;
}
