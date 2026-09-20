import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import sharp from "sharp";
import {
  brandAssets,
  creativeVariants,
  organizationMemberships,
} from "../../drizzle/schema";
import {
  channelConnections,
  publications,
  type Publication,
} from "../../drizzle/channelSchema";
import type { Channel, PublicationState } from "../../shared/channels";
import {
  readLibraryAsset,
  type LibraryDatabase,
  type LibraryTransaction,
} from "./assetLibrary";
import { appendActivity, withOrganizationTransaction } from "./activity";
import { stableHash } from "./policy";
import { connectionToken } from "./channelConnections";
import {
  ChannelGraphError,
  graphPost,
  graphRequest,
  remoteId,
} from "./channelGraph";
import { normalizeStorageKey, storageGetBase64 } from "../storage";
type Runner = LibraryDatabase | LibraryTransaction;
export const liveDeliveryEnabled = (channel: Channel) =>
  process.env[
    channel === "facebook"
      ? "LIVE_SOCIAL_ACTIONS_ENABLED"
      : "LIVE_AD_ACTIONS_ENABLED"
  ] === "true";
export async function publicationById(
  db: Runner,
  organizationId: number,
  id: string
) {
  const row = (
    await db
      .select()
      .from(publications)
      .where(
        and(
          eq(publications.organizationId, organizationId),
          eq(publications.id, id)
        )
      )
      .limit(1)
  )[0];
  if (!row)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Publication not found in this workspace.",
    });
  return row;
}
export function assertRevision(item: Publication, revision: number) {
  if (item.revision !== revision)
    throw new TRPCError({
      code: "CONFLICT",
      message: "This item changed. Refresh before continuing.",
    });
}
export async function dependencies(db: Runner, item: Publication) {
  if (!item.connectionId)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Select a connected destination.",
    });
  const connection = (
    await db
      .select()
      .from(channelConnections)
      .where(
        and(
          eq(channelConnections.id, item.connectionId),
          eq(channelConnections.organizationId, item.organizationId)
        )
      )
      .limit(1)
  )[0];
  if (!connection || connection.channel !== item.channel)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "The destination does not belong to this channel and workspace.",
    });
  connectionToken(connection);
  if (!connection.details.capabilities.includes("publish"))
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "This connection has no publishing permission. Reconnect with the required access.",
    });
  const asset = item.assetKey
    ? await readLibraryAsset(db, item.organizationId, item.assetKey)
    : null;
  if (
    asset &&
    (asset.state !== "approved" ||
      asset.purpose !== "finished" ||
      !["image", "video"].includes(asset.mediaType))
  )
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Choose an approved finished image or video from Asset Library.",
    });
  if (item.channel === "facebook") {
    if (!item.content.message && !item.content.link && !asset)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Add text, a link or an approved asset.",
      });
    if (asset && item.content.link)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "For photo/video posts, put the link in the caption. The separate link field is for link posts without media.",
      });
  } else {
    if (!asset || asset.mediaType !== "image")
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Select an approved finished image for this Meta ad.",
      });
    if (
      !item.content.adSetId ||
      !item.content.link ||
      !item.content.headline ||
      !item.content.message ||
      !connection.details.pageId
    )
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "Meta ads require an ad set, destination URL, headline, primary text and a connection with a Facebook Page.",
      });
  }
  const hash = stableHash({
    channel: item.channel,
    connection: {
      id: connection.id,
      accountId: connection.accountId,
      pageId: connection.details.pageId ?? null,
      version: connection.version,
    },
    content: item.content,
    assetKey: item.assetKey,
    assetRevision: asset?.revision ?? null,
    scheduledAtMs: item.scheduledAtMs,
    timezone: item.timezone,
  });
  return { connection, asset, hash };
}
export async function approvedDependencies(db: Runner, item: Publication) {
  const d = await dependencies(db, item);
  if (
    !item.approvalHash ||
    d.hash !== item.approvalHash ||
    !item.approvedByUserId
  )
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "The content, asset or destination changed. Submit the current publication for review again.",
    });
  const reviewer = (
    await db
      .select()
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.organizationId, item.organizationId),
          eq(organizationMemberships.userId, item.approvedByUserId),
          eq(organizationMemberships.status, "active")
        )
      )
      .limit(1)
  )[0];
  if (!reviewer || !["owner", "admin", "publisher"].includes(reviewer.role))
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "The publishing approver no longer has permission. Request a new approval.",
    });
  return d;
}
async function assetBytes(db: LibraryDatabase, item: Publication) {
  const [kind, rawId] = item.assetKey!.split(":");
  const row =
    kind === "asset"
      ? (
          await db
            .select({ key: brandAssets.storageKey })
            .from(brandAssets)
            .where(
              and(
                eq(brandAssets.organizationId, item.organizationId),
                eq(brandAssets.id, Number(rawId))
              )
            )
            .limit(1)
        )[0]
      : (
          await db
            .select({ key: creativeVariants.imageStorageKey })
            .from(creativeVariants)
            .where(
              and(
                eq(creativeVariants.organizationId, item.organizationId),
                eq(creativeVariants.id, Number(rawId))
              )
            )
            .limit(1)
        )[0];
  if (
    !row?.key ||
    !normalizeStorageKey(row.key).startsWith(`org-${item.organizationId}/`)
  )
    throw new Error(
      "This asset has no usable workspace media. Upload a new version."
    );
  return Buffer.from(
    await storageGetBase64(row.key, 20 * 1024 * 1024),
    "base64"
  );
}
async function checkpoint(
  db: LibraryDatabase,
  item: Publication,
  result: Record<string, unknown>
) {
  const changed = await db
    .update(publications)
    .set({ result, updatedAtMs: Date.now(), leaseUntilMs: Date.now() + 600000 })
    .where(
      and(
        eq(publications.id, item.id),
        eq(publications.organizationId, item.organizationId),
        eq(publications.claimId, item.claimId!),
        eq(publications.state, "publishing")
      )
    )
    .returning({ id: publications.id });
  if (!changed.length)
    throw new Error("This delivery is no longer owned by this publisher.");
}
async function finish(
  db: LibraryDatabase,
  item: Publication,
  state: PublicationState,
  result: Record<string, unknown>,
  externalId: string | null,
  error: string | null
) {
  await withOrganizationTransaction(db, item.organizationId, async tx => {
    const changed = await tx
      .update(publications)
      .set({
        state,
        result,
        externalId,
        error,
        leaseUntilMs: null,
        updatedAtMs: Date.now(),
        revision: item.revision + 1,
      })
      .where(
        and(
          eq(publications.id, item.id),
          eq(publications.organizationId, item.organizationId),
          eq(publications.claimId, item.claimId!),
          eq(publications.state, "publishing")
        )
      )
      .returning({ id: publications.id });
    if (changed.length)
      await appendActivity(
        {
          organizationId: item.organizationId,
          actorUserId: item.approvedByUserId ?? item.createdByUserId,
          action: `publication.${state}`,
          entityType: "publication",
          entityId: item.id,
          outcome: ["failed", "delivery_unknown"].includes(state)
            ? "failure"
            : "success",
          payload: { channel: item.channel, externalId, error },
        },
        tx
      );
  });
}
/** Claims are committed before external writes. Uncertain final writes are NEVER automatically retried. */
export async function executePublication(
  db: LibraryDatabase,
  organizationId: number,
  id: string
) {
  const claim = await withOrganizationTransaction(
    db,
    organizationId,
    async tx => {
      const item = await publicationById(tx, organizationId, id);
      if (
        item.state !== "scheduled" ||
        (item.scheduledAtMs !== null && item.scheduledAtMs > Date.now()) ||
        !liveDeliveryEnabled(item.channel) ||
        item.result?.deliveryMode !== "live"
      )
        return null;
      let d;
      try {
        if (item.scheduledAtMs && Date.now() - item.scheduledAtMs > 3600000)
          throw new Error(
            "The scheduled time was missed by more than an hour. Choose a new time and approve again."
          );
        d = await approvedDependencies(tx, item);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Publishing dependencies changed.";
        await tx
          .update(publications)
          .set({
            state: "changes_requested",
            approvalHash: null,
            error: message,
            revision: item.revision + 1,
            updatedAtMs: Date.now(),
          })
          .where(eq(publications.id, id));
        await appendActivity(
          {
            organizationId,
            actorUserId: item.createdByUserId,
            action: "publication.blocked",
            entityType: "publication",
            entityId: id,
            outcome: "failure",
            payload: { message },
          },
          tx
        );
        return null;
      }
      const [claimed] = await tx
        .update(publications)
        .set({
          state: "publishing",
          error: null,
          leaseUntilMs: Date.now() + 600000,
          claimId: randomUUID(),
          revision: item.revision + 1,
          updatedAtMs: Date.now(),
        })
        .where(eq(publications.id, id))
        .returning();
      await appendActivity(
        {
          organizationId,
          actorUserId: item.approvedByUserId!,
          action: "publication.delivery_started",
          entityType: "publication",
          entityId: id,
          payload: { channel: item.channel },
        },
        tx
      );
      return { item: claimed, d };
    }
  );
  if (!claim) return false;
  const { item, d } = claim;
  const { connection, asset } = d;
  const token = connectionToken(connection);
  const result: Record<string, unknown> = {
    ...(item.result ?? {}),
    retrySafe: false,
  };
  let finalWriteStarted = false;
  try {
    if (item.channel === "facebook") {
      const raw = asset ? await assetBytes(db, item) : null;
      let form: FormData | undefined;
      if (asset) {
        const isImage = asset.mediaType === "image";
        const bytes = isImage
          ? await sharp(raw!, { limitInputPixels: 40000000 })
              .rotate()
              .png()
              .toBuffer()
          : raw!;
        form = new FormData();
        form.set(
          "source",
          new Blob([new Uint8Array(bytes)], {
            type: isImage ? "image/png" : asset.mimeType,
          }),
          isImage
            ? "image.png"
            : "video." + (asset.mimeType === "video/webm" ? "webm" : "mp4")
        );
        form.set(isImage ? "message" : "description", item.content.message);
        form.set("published", "true");
        if (!isImage) form.set("title", item.content.title);
      }
      await approvedDependencies(db, item);
      finalWriteStarted = true;
      const response = form
        ? await graphRequest(
            `${remoteId(connection.accountId)}/${asset!.mediaType === "image" ? "photos" : "videos"}`,
            token,
            {},
            form,
            asset!.mediaType === "video"
          )
        : await graphPost(`${remoteId(connection.accountId)}/feed`, token, {
            message: item.content.message,
            ...(item.content.link ? { link: item.content.link } : {}),
          });
      const externalId = String(response.post_id || response.id || "");
      if (!externalId)
        throw new ChannelGraphError(
          "Meta did not return a usable delivery ID. Check the Page before retrying.",
          false
        );
      result.mediaId = response.id;
      result.remoteStatus =
        asset?.mediaType === "video" ? "PROCESSING" : "PUBLISHED";
      await finish(
        db,
        item,
        asset?.mediaType === "video" ? "processing" : "published",
        result,
        externalId,
        null
      );
    } else {
      const adSet = await graphRequest<{ id: string; account_id: string }>(
        remoteId(item.content.adSetId),
        token,
        { fields: "id,account_id" }
      );
      if (adSet.account_id !== connection.accountId)
        throw new Error(
          "The selected ad set belongs to a different ad account."
        );
      if (!result.imageHash) {
        const bytes = await sharp(await assetBytes(db, item), {
          limitInputPixels: 40000000,
        })
          .rotate()
          .png()
          .toBuffer();
        const uploaded = await graphPost(
          `act_${remoteId(connection.accountId)}/adimages`,
          token,
          { bytes: bytes.toString("base64") }
        );
        const image = Object.values(uploaded.images ?? {})[0] as
          | { hash?: string }
          | undefined;
        if (!image?.hash) throw new Error("Meta did not confirm the ad image.");
        result.imageHash = image.hash;
        await checkpoint(db, item, result);
      }
      if (!result.creativeId) {
        const creative = await graphPost(
          `act_${remoteId(connection.accountId)}/adcreatives`,
          token,
          {
            name: item.content.title + " - Frame",
            object_story_spec: JSON.stringify({
              page_id: connection.details.pageId,
              link_data: {
                image_hash: result.imageHash,
                link: item.content.link,
                message: item.content.message,
                name: item.content.headline,
                description: item.content.description,
                call_to_action: {
                  type: item.content.callToAction,
                  value: { link: item.content.link },
                },
              },
            }),
          }
        );
        if (!creative.id)
          throw new Error("Meta did not confirm the ad creative.");
        result.creativeId = String(creative.id);
        await checkpoint(db, item, result);
      }
      await approvedDependencies(db, item);
      finalWriteStarted = true;
      const ad = await graphPost(
        `act_${remoteId(connection.accountId)}/ads`,
        token,
        {
          name: item.content.title,
          adset_id: item.content.adSetId,
          creative: JSON.stringify({ creative_id: result.creativeId }),
          status: "PAUSED",
        }
      );
      if (!ad.id)
        throw new ChannelGraphError(
          "Meta did not return an ad ID. Check Ads Manager before retrying.",
          false
        );
      result.remoteStatus = "PAUSED";
      await finish(db, item, "published", result, String(ad.id), null);
    }
  } catch (error) {
    const safeToRetry =
      !finalWriteStarted ||
      (error instanceof ChannelGraphError && error.definitive);
    const message = error instanceof Error ? error.message : "Delivery failed.";
    result.retrySafe = safeToRetry;
    await finish(
      db,
      item,
      safeToRetry ? "failed" : "delivery_unknown",
      result,
      null,
      safeToRetry
        ? message
        : "Delivery was not confirmed. Check Meta before taking another action. Automatic retries are blocked."
    );
  }
  return true;
}
export async function publicationTick(db: LibraryDatabase) {
  const stale = await db
    .select()
    .from(publications)
    .where(
      and(
        eq(publications.state, "publishing"),
        lt(publications.leaseUntilMs, Date.now())
      )
    )
    .limit(20);
  for (const item of stale)
    await finish(
      db,
      item,
      "delivery_unknown",
      { ...(item.result ?? {}), retrySafe: false },
      item.externalId,
      "The worker stopped before delivery was confirmed. Check Meta; this item will not be retried automatically."
    );
  const enabled = (["facebook", "meta_ads"] as const).filter(
    liveDeliveryEnabled
  );
  if (enabled.length) {
    const due = await db
      .select()
      .from(publications)
      .where(
        and(
          eq(publications.state, "scheduled"),
          inArray(publications.channel, enabled),
          sql`${publications.result}->>'deliveryMode' = 'live'`,
          or(
            isNull(publications.scheduledAtMs),
            lte(publications.scheduledAtMs, Date.now())
          )
        )
      )
      .orderBy(asc(publications.scheduledAtMs))
      .limit(5);
    for (const item of due) {
      try {
        await executePublication(db, item.organizationId, item.id);
      } catch {
        /* Persisted state + recovery handles uncertain deliveries. */
      }
    }
  }
  const processing = await db
    .select()
    .from(publications)
    .where(
      and(
        eq(publications.state, "processing"),
        lt(publications.updatedAtMs, Date.now() - 60000)
      )
    )
    .limit(10);
  for (const item of processing) {
    try {
      const c = (
        await db
          .select()
          .from(channelConnections)
          .where(
            and(
              eq(channelConnections.id, item.connectionId!),
              eq(channelConnections.organizationId, item.organizationId)
            )
          )
          .limit(1)
      )[0];
      if (!c || !item.externalId) continue;
      const response = await graphRequest<{
        status?: { video_status?: string };
      }>(
        remoteId(String(item.result?.mediaId || item.externalId)),
        connectionToken(c),
        { fields: "status" }
      );
      const ready = response.status?.video_status === "ready",
        failed = response.status?.video_status === "error";
      await withOrganizationTransaction(db, item.organizationId, async tx => {
        const state = ready ? "published" : failed ? "failed" : "processing";
        const changed = await tx
          .update(publications)
          .set({
            state,
            updatedAtMs: Date.now(),
            ...(ready || failed
              ? {
                  revision: item.revision + 1,
                  result: {
                    ...(item.result ?? {}),
                    remoteStatus: ready ? "PUBLISHED" : "PROCESSING_FAILED",
                    retrySafe: false,
                  },
                  error: failed
                    ? "Facebook could not process the video. Check the uploaded video in Facebook."
                    : null,
                }
              : {}),
          })
          .where(
            and(
              eq(publications.id, item.id),
              eq(publications.state, "processing")
            )
          )
          .returning({ id: publications.id });
        if (changed.length && (ready || failed))
          await appendActivity(
            {
              organizationId: item.organizationId,
              actorUserId: item.approvedByUserId!,
              action: `publication.${state}`,
              entityType: "publication",
              entityId: item.id,
              payload: { externalId: item.externalId },
            },
            tx
          );
      });
    } catch {
      await db
        .update(publications)
        .set({
          updatedAtMs: Date.now(),
          error:
            "Video status could not be checked. Revalidate the connection or check Facebook.",
        })
        .where(
          and(
            eq(publications.id, item.id),
            eq(publications.state, "processing")
          )
        );
    }
  }
}
