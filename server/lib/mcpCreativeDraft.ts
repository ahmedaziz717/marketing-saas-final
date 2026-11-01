import { z } from "zod";
import {
  creativeDraftSaveInput,
  saveCreativeSetup,
} from "../routers/creativeBuilder";
import { stableHash } from "./policy";
import { withMcpDraftReceipt, type DraftTransaction } from "./mcpDraftReceipt";

export const mcpCreativeDraftInput = creativeDraftSaveInput
  .extend({ requestId: z.string().uuid() })
  .strict();
/** Saves setup only; never generates, approves, queues, publishes or schedules. */
export function mcpCreativeDraft(
  userId: number,
  authorize: (tx: DraftTransaction, organizationId: number) => Promise<void>
) {
  return async (raw: unknown) => {
    const { requestId, ...input } = mcpCreativeDraftInput.parse(raw);
    return saveCreativeSetup(userId, input, (tx, save) =>
      withMcpDraftReceipt(
        tx,
        {
          actorUserId: userId,
          organizationId: input.organizationId,
          tool: "save_creative_setup_draft",
          requestId,
          payloadHash: stableHash(input),
          authorize,
          allowedRoles: ["owner", "admin", "creator"],
        },
        save
      )
    );
  };
}
