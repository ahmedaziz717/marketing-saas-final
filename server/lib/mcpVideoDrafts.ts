import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { studioRoles } from "../../shared/assetWorkflow";
import {
  videoImageReferenceKeys,
  videoReferenceCount,
  videoSetupSchema,
} from "../../shared/videoCreation";
import { saveVideoSetup, videoDraftSaveInput } from "../routers/video";
import { readLibraryAsset } from "./assetLibrary";
import { readVideoCatalogImage } from "./videoCatalog";
import { stableHash } from "./policy";
import { withMcpDraftReceipt, type DraftTransaction } from "./mcpDraftReceipt";

export const mcpVideoDraftInput = videoDraftSaveInput
  .extend({
    requestId: z.string().uuid(),
    setup: videoSetupSchema.strict(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (!!input.id !== !!input.revision)
      ctx.addIssue({
        code: "custom",
        path: ["revision"],
        message:
          "Updates require both the draft ID and current revision; new drafts require neither.",
      });
  });

/** Validate stored identities only. Resolving video references may download media,
 * so it is intentionally not used for draft saves. */
async function validateDraftReferences(
  tx: DraftTransaction,
  organizationId: number,
  setup: z.infer<typeof videoSetupSchema>
) {
  if (
    new Set(setup.imageKeys).size !== setup.imageKeys.length ||
    videoReferenceCount(setup) > 30
  )
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Choose distinct references, up to 30 including people and logo.",
    });
  const selectedProducts = new Set<number>();
  const keys = [
    ...videoImageReferenceKeys(setup),
    ...(setup.sourceVideoKey ? [setup.sourceVideoKey] : []),
  ];
  for (const key of keys) {
    if (key.startsWith("product_image:")) {
      const image = await readVideoCatalogImage(tx, organizationId, key);
      selectedProducts.add(image.facts.id);
      continue;
    }
    const asset = await readLibraryAsset(tx, organizationId, key);
    const video = key === setup.sourceVideoKey;
    if (
      video
        ? asset.mimeType !== "video/mp4"
        : asset.mediaType !== "image" || asset.mimeType === "image/gif"
    )
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: video
          ? "Choose an MP4 source video."
          : "Choose an image reference.",
      });
    if (["rejected", "changes_requested"].includes(asset.state))
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "Resolve reference review feedback before saving this video setup.",
      });
  }
  if (setup.productSelections?.some(p => !selectedProducts.has(p.productId)))
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Product details must belong to selected catalog references.",
    });
}

export async function saveMcpVideoDraft(
  userId: number,
  authorize: (tx: DraftTransaction, organizationId: number) => Promise<void>,
  raw: unknown
) {
  const { requestId, ...input } = mcpVideoDraftInput.parse(raw);
  return saveVideoSetup(userId, input, (tx, save) =>
    withMcpDraftReceipt(
      tx,
      {
        actorUserId: userId,
        organizationId: input.organizationId,
        tool: "save_video_draft",
        requestId,
        payloadHash: stableHash(input),
        authorize,
        allowedRoles: [...studioRoles],
      },
      async () => {
        await validateDraftReferences(tx, input.organizationId, input.setup);
        const saved = await save();
        return {
          id: saved.id,
          revision: saved.revision,
          status: "draft" as const,
          updatedAtMs: saved.updatedAtMs,
        };
      }
    )
  );
}
