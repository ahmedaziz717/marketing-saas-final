import { z } from "zod";
import { publicationDraftSchema } from "../../shared/channels";
import { savePublicationDraft } from "../routers/channels";
import { stableHash } from "./policy";
import { withMcpDraftReceipt, type DraftTransaction } from "./mcpDraftReceipt";

export const mcpPublicationDraftInput = publicationDraftSchema
  .extend({
    requestId: z.string().uuid(),
    scheduledAtMs: z.null().default(null),
    content: publicationDraftSchema.shape.content.strict(),
  })
  .strict();

/** Local draft-only save. Shared save performs asset/tenant/revision validation;
 * the MCP receipt and live grant check are inside that same transaction. */
export async function saveMcpPublicationDraft(
  userId: number,
  authorize: (tx: DraftTransaction, organizationId: number) => Promise<void>,
  raw: unknown
) {
  const { requestId, ...input } = mcpPublicationDraftInput.parse(raw);
  return savePublicationDraft(userId, input, (tx, save) =>
    withMcpDraftReceipt(
      tx,
      {
        actorUserId: userId,
        organizationId: input.organizationId,
        tool: "save_publication_draft",
        requestId,
        payloadHash: stableHash(input),
        authorize,
        allowedRoles: ["owner", "admin", "creator", "publisher"],
      },
      async () => {
        const saved = await save();
        return {
          id: saved.id,
          revision: saved.revision,
          state: "draft" as const,
          updatedAtMs: saved.updatedAtMs,
        };
      }
    )
  );
}
