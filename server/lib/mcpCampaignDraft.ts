import { z } from "zod";
import { googleChangeSchema } from "../../shared/googleCampaigns";
import { saveGoogleDraft } from "./googleCampaigns";
import { googleChangeAssets } from "./googleCampaignOperations";
import { readLibraryAsset } from "./assetLibrary";
import { stableHash } from "./policy";
import { withMcpDraftReceipt, type DraftTransaction } from "./mcpDraftReceipt";

export const mcpCampaignDraftInput = z
  .object({
    organizationId: z.number().int().positive(),
    requestId: z.string().uuid(),
    connectionId: z.string().uuid(),
    id: z.string().uuid().optional(),
    revision: z.number().int().positive().optional(),
    change: googleChangeSchema.refine(
      value => value.kind !== "asset_group_assets" || value.remove.length === 0,
      "MCP campaign drafts do not support asset removals."
    ),
  })
  .strict();
/** Stores a local Google draft only. No Google validation, upload or mutation. */
export function mcpCampaignDraft(
  userId: number,
  authorize: (tx: DraftTransaction, organizationId: number) => Promise<void>
) {
  return async (raw: unknown) => {
    const { requestId, ...input } = mcpCampaignDraftInput.parse(raw);
    return saveGoogleDraft(userId, input, (tx, save) =>
      withMcpDraftReceipt(
        tx,
        {
          actorUserId: userId,
          organizationId: input.organizationId,
          tool: "save_google_campaign_draft",
          requestId,
          payloadHash: stableHash(input),
          authorize,
        },
        async () => {
          for (const asset of googleChangeAssets(input.change)) {
            if (asset.source.kind === "library")
              await readLibraryAsset(
                tx,
                input.organizationId,
                asset.source.key
              );
          }
          const row = await save();
          return {
            id: row.id,
            revision: row.revision,
            state: row.state,
            updatedAtMs: row.updatedAtMs,
          };
        }
      )
    );
  };
}
