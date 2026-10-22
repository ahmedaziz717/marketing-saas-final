import { channelConnections } from "../../drizzle/channelSchema";
import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { activityEvents, brandAssets } from "../../drizzle/schema";
import { libraryDatabase, readLibraryAsset } from "./assetLibrary";
import { requireOrganizationRole } from "./access";
import { appendActivity, withOrganizationTransaction } from "./activity";
import { withGoogleAdsAccess } from "./googleAdsConnections";
import { googleAdsRows } from "./googleAdsApi";
import { uploadGoogleVideo } from "./googleVideoUploadApi";
import { GoogleMutationError } from "./googleAdsMutate";
import { normalizeStorageKey, storageGetBase64 } from "../storage";
import { stableHash } from "./policy";

type Input = {
  organizationId: number;
  connectionId: string;
  key: string;
  revision: string;
  generated?: boolean;
};
type UploadState = {
  state: "STARTING" | "PROCESSING" | "PROCESSED" | "FAILED" | "UNCERTAIN";
  resource?: string;
  videoId?: string;
  message?: string;
};
const eventType = "google_video_upload";
const fail = (message: string): never => {
  throw new TRPCError({ code: "PRECONDITION_FAILED", message });
};

export async function googleLibraryVideo(
  userId: number,
  input: Input,
  start = false
): Promise<UploadState | null> {
  await requireOrganizationRole(
    userId,
    input.organizationId,
    start ? ["owner", "admin", "publisher"] : undefined
  );
  if (start && process.env.LIVE_AD_ACTIONS_ENABLED !== "true")
    fail("Google asset uploads are disabled in this environment.");
  const db = await libraryDatabase();
  const asset = await readLibraryAsset(db, input.organizationId, input.key);
  if (
    asset.state !== "approved" ||
    asset.mediaType !== "video" ||
    asset.revision !== input.revision
  )
    fail("Select the current approved version of a library video.");
  const entityId = stableHash({
    connectionId: input.connectionId,
    key: input.key,
    revision: input.revision,
  });
  const where = and(
    eq(activityEvents.organizationId, input.organizationId),
    eq(activityEvents.entityType, eventType),
    eq(activityEvents.entityId, entityId)
  );
  const record = (state: UploadState) =>
    appendActivity({
      organizationId: input.organizationId,
      actorUserId: userId,
      action: "google.video_upload",
      entityType: eventType,
      entityId,
      payload: {
        ...state,
        connectionId: input.connectionId,
        assetKey: input.key,
      },
    });
  return withGoogleAdsAccess(
    db,
    input.organizationId,
    input.connectionId,
    async (connection, token) => {
      let existing = (
        await db
          .select()
          .from(activityEvents)
          .where(where)
          .orderBy(desc(activityEvents.id))
          .limit(1)
      )[0]?.payload as UploadState | undefined;
      if (existing?.resource) {
        if (
          !new RegExp(
            `^customers/${connection.accountId}/youTubeVideoUploads/[0-9]+$`
          ).test(existing.resource)
        )
          fail("This upload belongs to another Google account.");
        const rows = await googleAdsRows(
          token,
          connection.accountId,
          `SELECT you_tube_video_upload.resource_name, you_tube_video_upload.video_id, you_tube_video_upload.state FROM you_tube_video_upload WHERE you_tube_video_upload.resource_name = '${existing.resource}'`,
          connection.details.google?.loginCustomerId
        );
        const video = rows[0]?.youTubeVideoUpload;
        if (
          video?.state === "PROCESSED" &&
          /^[\w-]{11}$/.test(video.videoId ?? "")
        )
          return {
            state: "PROCESSED",
            resource: existing.resource,
            videoId: video.videoId,
          };
        if (["FAILED", "REJECTED", "UNAVAILABLE"].includes(video?.state))
          return {
            state: "FAILED",
            resource: existing.resource,
            message:
              "Google could not process this video. Check the upload in Google Ads.",
          };
        return { state: "PROCESSING", resource: existing.resource };
      }
      if (existing && existing.state !== "FAILED")
        return {
          ...existing,
          message:
            "The upload is in progress or unconfirmed. Check Google Ads before starting another upload.",
        };
      if (!start) return existing ?? null;
      const id = Number(input.key.split(":")[1]);
      if (!input.key.startsWith("asset:"))
        fail("This library video has no uploadable file.");
      const row = (
        await db
          .select({ key: brandAssets.storageKey })
          .from(brandAssets)
          .where(
            and(
              eq(brandAssets.id, id),
              eq(brandAssets.organizationId, input.organizationId)
            )
          )
          .limit(1)
      )[0];
      if (
        !row?.key ||
        !normalizeStorageKey(row.key).startsWith(`org-${input.organizationId}/`)
      )
        fail("This video has no usable workspace file.");
      const bytes = Buffer.from(
        await storageGetBase64(row.key, 20 * 1024 * 1024),
        "base64"
      );
      const reserved = await withOrganizationTransaction(
        db,
        input.organizationId,
        async tx => {
          const currentAsset = await readLibraryAsset(
            tx,
            input.organizationId,
            input.key
          );
          if (
            currentAsset.state !== "approved" ||
            currentAsset.revision !== input.revision
          )
            fail("The video approval changed. Reload this library video.");
          const currentConnection = (
            await tx
              .select()
              .from(channelConnections)
              .where(
                and(
                  eq(channelConnections.id, input.connectionId),
                  eq(channelConnections.organizationId, input.organizationId)
                )
              )
              .limit(1)
          )[0];
          if (
            !currentConnection ||
            currentConnection.status !== "connected" ||
            currentConnection.version !== connection.version
          )
            fail("The Google connection changed. Reconnect before uploading.");
          const last = (
            await tx
              .select()
              .from(activityEvents)
              .where(where)
              .orderBy(desc(activityEvents.id))
              .limit(1)
          )[0]?.payload as UploadState | undefined;
          if (last && last.state !== "FAILED") return false;
          await appendActivity(
            {
              organizationId: input.organizationId,
              actorUserId: userId,
              action: "google.video_upload",
              entityType: eventType,
              entityId,
              payload: {
                state: "STARTING",
                connectionId: input.connectionId,
                assetKey: input.key,
              },
            },
            tx
          );
          return true;
        }
      );
      if (!reserved)
        return {
          state: "STARTING",
          message: "This video is already being uploaded. Check its status.",
        };
      try {
        const resource = await uploadGoogleVideo(
          token,
          connection.accountId,
          asset.name,
          bytes,
          input.generated ?? asset.origin === "generated",
          connection.details.google?.loginCustomerId
        );
        const result: UploadState = { state: "PROCESSING", resource };
        await record(result);
        return result;
      } catch (error) {
        const result: UploadState = {
          state:
            error instanceof GoogleMutationError && !error.uncertain
              ? "FAILED"
              : "UNCERTAIN",
          message:
            error instanceof GoogleMutationError
              ? error.message
              : "Google did not confirm this upload. Check the account before retrying.",
        };
        await record(result);
        return result;
      }
    }
  );
}
