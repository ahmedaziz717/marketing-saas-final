import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import sharp from "sharp";
import {
  channelConnections,
  googleCampaignDrafts,
  type ChannelConnection,
  type GoogleCampaignDraft,
} from "../../drizzle/channelSchema";
import { brandAssets, creativeVariants } from "../../drizzle/schema";
import {
  googleChangeSchema,
  type GoogleChange,
} from "../../shared/googleCampaigns";
import { parseAssetKey } from "../../shared/assetLibrary";
import {
  libraryDatabase,
  readLibraryAsset,
  type LibraryDatabase,
} from "./assetLibrary";
import { requireOrganizationRole } from "./access";
import { appendActivity, withOrganizationTransaction } from "./activity";
import { googleAdsRows } from "./googleAdsApi";
import { withGoogleAdsAccess } from "./googleAdsConnections";
import { mutateGoogleAds, GoogleMutationError } from "./googleAdsMutate";
import {
  compileGoogleChange,
  googleChangeAssets,
  type GoogleCampaignSnapshot,
  type PreparedGoogleAsset,
} from "./googleCampaignOperations";
import { stableHash } from "./policy";
import { normalizeStorageKey, storageGetBase64 } from "../storage";

const campaignFields =
  "campaign.id, campaign.resource_name, campaign.name, campaign.status, campaign.advertising_channel_type, campaign.campaign_budget, campaign.brand_guidelines_enabled, campaign.shopping_setting.merchant_id, campaign_budget.resource_name, campaign_budget.amount_micros, campaign_budget.period, campaign_budget.explicitly_shared";
const fail = (
  message: string,
  code: "BAD_REQUEST" | "CONFLICT" | "NOT_FOUND" = "BAD_REQUEST"
): never => {
  throw new TRPCError({ code, message });
};
const reader =
  (connection: ChannelConnection, token: string) => (query: string) =>
    googleAdsRows(
      token,
      connection.accountId,
      query,
      connection.details.google?.loginCustomerId
    );
export async function googleCampaignInventory(
  db: LibraryDatabase,
  organizationId: number,
  connectionId: string,
  includeInactive: boolean,
  campaignId?: string
) {
  return withGoogleAdsAccess(
    db,
    organizationId,
    connectionId,
    async (c, token) => {
      const read = reader(c, token);
      if (!campaignId) {
        const rows = await read(
          `SELECT ${campaignFields} FROM campaign WHERE campaign.status ${includeInactive ? "!= 'REMOVED'" : "= 'ENABLED'"} ORDER BY campaign.name LIMIT 1000`
        );
        return {
          campaigns: rows as GoogleCampaignSnapshot[],
          groups: [] as any[],
          assets: [] as any[],
          ads: [] as any[],
          limited: rows.length === 1000,
          currency: c.details.currency,
          timezone: c.details.timezone,
        };
      }
      if (!/^\d{1,20}$/.test(campaignId)) fail("Invalid campaign.");
      const rows = await read(
        `SELECT ${campaignFields} FROM campaign WHERE campaign.id = ${campaignId} AND campaign.status != 'REMOVED'`
      );
      if (!rows.length)
        fail("Campaign not found in this account.", "NOT_FOUND");
      const pmax =
        rows[0].campaign.advertisingChannelType === "PERFORMANCE_MAX";
      const [groups, assets, ads] = await Promise.all([
        read(
          pmax
            ? `SELECT asset_group.id, asset_group.resource_name, asset_group.name, asset_group.status, asset_group.final_urls, asset_group.ad_strength FROM asset_group WHERE campaign.id = ${campaignId} AND asset_group.status != 'REMOVED' LIMIT 1000`
            : `SELECT ad_group.id, ad_group.resource_name, ad_group.name, ad_group.status, ad_group.type FROM ad_group WHERE campaign.id = ${campaignId} AND ad_group.status != 'REMOVED' LIMIT 1000`
        ),
        pmax
          ? read(
              `SELECT asset_group.id, asset_group_asset.resource_name, asset_group_asset.field_type, asset_group_asset.status, asset.id, asset.name, asset.type, asset.text_asset.text, asset.image_asset.full_size.url, asset.youtube_video_asset.youtube_video_id FROM asset_group_asset WHERE campaign.id = ${campaignId} AND asset_group_asset.status != 'REMOVED' LIMIT 1000`
            )
          : Promise.resolve([]),
        pmax
          ? Promise.resolve([])
          : read(
              `SELECT ad_group.id, ad_group_ad.resource_name, ad_group_ad.status, ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.ad.type, ad_group_ad.policy_summary.approval_status FROM ad_group_ad WHERE campaign.id = ${campaignId} AND ad_group_ad.status != 'REMOVED' LIMIT 1000`
            ),
      ]);
      return {
        campaigns: rows as GoogleCampaignSnapshot[],
        groups,
        assets,
        ads,
        limited: [groups, assets, ads].some(r => r.length === 1000),
        currency: c.details.currency,
        timezone: c.details.timezone,
      };
    }
  );
}
export async function googleCampaignResources(
  db: LibraryDatabase,
  organizationId: number,
  connectionId: string,
  kind: "assets" | "audiences" | "merchants" | "locations" | "languages",
  search = ""
) {
  return withGoogleAdsAccess(
    db,
    organizationId,
    connectionId,
    async (c, token) => {
      const read = reader(c, token);
      if (kind === "assets")
        return (
          await read(
            "SELECT asset.id, asset.name, asset.type, asset.text_asset.text, asset.image_asset.full_size.url, asset.youtube_video_asset.youtube_video_id FROM asset ORDER BY asset.id DESC LIMIT 200"
          )
        ).map(r => ({
          id: String(r.asset.id),
          name:
            r.asset.name || r.asset.textAsset?.text || `Asset ${r.asset.id}`,
          type: r.asset.type,
          url: (r.asset.imageAsset?.fullSize?.url ||
            (/^[\w-]{11}$/.test(r.asset.youtubeVideoAsset?.youtubeVideoId ?? "")
              ? `https://i.ytimg.com/vi/${r.asset.youtubeVideoAsset.youtubeVideoId}/hqdefault.jpg`
              : undefined)) as string | undefined,
        }));
      if (kind === "audiences")
        return (
          await read(
            "SELECT audience.id, audience.name FROM audience LIMIT 200"
          )
        ).map(r => ({
          id: String(r.audience.id),
          name: r.audience.name,
          type: "Audience",
        }));
      if (kind === "merchants")
        return (
          await read(
            "SELECT product_link.merchant_center.merchant_center_id FROM product_link WHERE product_link.type = 'MERCHANT_CENTER'"
          )
        ).map(r => ({
          id: String(r.productLink.merchantCenter.merchantCenterId),
          name: `Merchant Center ${r.productLink.merchantCenter.merchantCenterId}`,
          type: "Merchant Center",
        }));
      // Escape literals using GAQL's documented backslash rules; no query fragments from the UI.
      const literal = search
        .replace(/\\/g, "\\\\")
        .replace(/'/g, "\\'")
        .replace(/[%_]/g, "");
      if (kind === "locations")
        return (
          await read(
            `SELECT geo_target_constant.id, geo_target_constant.canonical_name, geo_target_constant.target_type FROM geo_target_constant WHERE geo_target_constant.status = 'ENABLED' AND geo_target_constant.name LIKE '%${literal}%' LIMIT 50`
          )
        ).map(r => ({
          id: String(r.geoTargetConstant.id),
          name: r.geoTargetConstant.canonicalName,
          type: r.geoTargetConstant.targetType,
        }));
      return (
        await read(
          "SELECT language_constant.id, language_constant.name FROM language_constant WHERE language_constant.targetable = true ORDER BY language_constant.name"
        )
      ).map(r => ({
        id: String(r.languageConstant.id),
        name: r.languageConstant.name,
        type: "Language",
      }));
    }
  );
}
async function prepare(
  db: LibraryDatabase,
  organizationId: number,
  connection: ChannelConnection,
  token: string,
  change: GoogleChange
) {
  const read = reader(connection, token),
    customerId = connection.accountId;
  const evidence: unknown[] = [
    {
      customerId,
      manager: connection.details.google?.loginCustomerId,
      currency: connection.details.currency,
      timezone: connection.details.timezone,
    },
  ];
  let snapshot: GoogleCampaignSnapshot | undefined;
  if (change.kind !== "campaign_create") {
    const rows = await read(
      `SELECT ${campaignFields} FROM campaign WHERE campaign.id = ${change.campaignId} AND campaign.status != 'REMOVED'`
    );
    if (!rows.length)
      fail("Campaign no longer exists in this account.", "NOT_FOUND");
    snapshot = rows[0];
    evidence.push(snapshot);
    if (change.kind === "ad_create") {
      const groups = await read(
        `SELECT ad_group.id, ad_group.status FROM ad_group WHERE campaign.id = ${change.campaignId} AND ad_group.id = ${change.adGroupId} AND ad_group.status != 'REMOVED'`
      );
      if (!groups.length) fail("Ad group not found in the selected campaign.");
      evidence.push(groups);
    }
    if (
      change.kind === "asset_group_assets" ||
      change.kind === "asset_group_update"
    ) {
      const groups = await read(
        `SELECT asset_group.id, asset_group.name, asset_group.status, asset_group.final_urls FROM asset_group WHERE campaign.id = ${change.campaignId} AND asset_group.id = ${change.assetGroupId} AND asset_group.status != 'REMOVED'`
      );
      if (!groups.length)
        fail("Asset group not found in the selected campaign.");
      const links = await read(
        `SELECT asset_group_asset.resource_name, asset_group_asset.field_type, asset.id FROM asset_group_asset WHERE campaign.id = ${change.campaignId} AND asset_group.id = ${change.assetGroupId} AND asset_group_asset.status != 'REMOVED' ORDER BY asset_group_asset.resource_name`
      );
      for (const remove of change.kind === "asset_group_assets"
        ? change.remove
        : [])
        if (
          !links.some(
            r =>
              String(r.asset.id) === remove.assetId &&
              r.assetGroupAsset.fieldType === remove.field
          )
        )
          fail(
            "An asset association changed. Reload before replacing it.",
            "CONFLICT"
          );
      evidence.push(groups, links);
    }
  }
  const assets: PreparedGoogleAsset[] = [];
  let uploadBytes = 0;
  const inputs = googleChangeAssets(change);
  // Resolve sequentially to retain deterministic temporary IDs and bound storage reads.
  for (let i = 0; i < inputs.length; i++) {
    const item = inputs[i],
      source = item.source;
    const resource = `customers/${customerId}/assets/${-100 - i}`;
    if (source.kind === "existing") {
      const found = await read(
        `SELECT asset.id, asset.type, asset.text_asset.text, asset.image_asset.full_size.width_pixels, asset.image_asset.full_size.height_pixels, asset.youtube_video_asset.youtube_video_id FROM asset WHERE asset.id = ${source.id}`
      );
      if (!found.length)
        fail("A selected Google asset no longer exists in this account.");
      assets.push({
        field: item.field,
        resource: `customers/${customerId}/assets/${source.id}`,
        evidence: found[0],
      });
      continue;
    }
    let value: Record<string, unknown>,
      assetEvidence: unknown = source;
    if (source.kind === "text") value = { textAsset: { text: source.text } };
    else if (source.kind === "youtube")
      value = { youtubeVideoAsset: { youtubeVideoId: source.videoId } };
    else {
      const asset = await readLibraryAsset(db, organizationId, source.key);
      if (asset.state !== "approved" || asset.mediaType !== "image")
        fail("Approve each selected library image before publishing.");
      const reference = parseAssetKey(source.key);
      const row =
        reference.kind === "asset"
          ? (
              await db
                .select({ key: brandAssets.storageKey })
                .from(brandAssets)
                .where(
                  and(
                    eq(brandAssets.organizationId, organizationId),
                    eq(brandAssets.id, reference.id)
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
                    eq(creativeVariants.organizationId, organizationId),
                    eq(creativeVariants.id, reference.id)
                  )
                )
                .limit(1)
            )[0];
      if (
        !row?.key ||
        !normalizeStorageKey(row.key).startsWith(`org-${organizationId}/`)
      )
        fail("This image has no usable workspace media.");
      const bytes = Buffer.from(
        await storageGetBase64(row!.key!, 5 * 1024 * 1024),
        "base64"
      );
      const image = sharp(bytes, {
        limitInputPixels: 25_000_000,
        failOn: "warning",
      });
      const meta = await image.metadata();
      const width = meta.width ?? 0,
        height = meta.height ?? 0;
      const specs: Record<string, [number, number, number]> = {
        MARKETING_IMAGE: [600, 314, 1.91],
        SQUARE_MARKETING_IMAGE: [300, 300, 1],
        PORTRAIT_MARKETING_IMAGE: [480, 600, 0.8],
        LOGO: [128, 128, 1],
        LANDSCAPE_LOGO: [512, 128, 4],
      };
      const spec = specs[item.field];
      if (
        !spec ||
        width < spec[0] ||
        height < spec[1] ||
        Math.abs(width / height / spec[2] - 1) > 0.01
      )
        fail(
          `${asset.name}: ${item.field.toLowerCase().replace(/_/g, " ")} requires at least ${spec?.[0]} × ${spec?.[1]} pixels and a ${spec?.[2]}:1 ratio.`
        );
      const imageBytes = await image.rotate().png().toBuffer();
      if (imageBytes.length > 5 * 1024 * 1024)
        fail(`${asset.name} exceeds Google's 5 MB image limit.`);
      uploadBytes += imageBytes.length;
      if (uploadBytes > 20 * 1024 * 1024)
        fail(
          "Use fewer or smaller images. This reviewed change is limited to 20 MB of image uploads."
        );
      value = {
        name: asset.name.slice(0, 128),
        imageAsset: { data: imageBytes.toString("base64") },
      };
      assetEvidence = {
        key: asset.key,
        revision: asset.revision,
        fingerprint: asset.fingerprint,
        digest: stableHash(imageBytes.toString("base64")),
      };
    }
    assets.push({
      field: item.field,
      resource,
      operation: {
        assetOperation: { create: { resourceName: resource, ...value } },
      },
      evidence: assetEvidence,
    });
  }
  const operations = compileGoogleChange(customerId, change, assets, snapshot);
  const reviewHash = stableHash({
    change,
    evidence,
    assets: assets.map(a => ({ field: a.field, evidence: a.evidence })),
    operations,
  });
  return { operations, reviewHash };
}
export async function getGoogleDraft(
  db: LibraryDatabase,
  organizationId: number,
  id: string
) {
  const row = (
    await db
      .select()
      .from(googleCampaignDrafts)
      .where(
        and(
          eq(googleCampaignDrafts.organizationId, organizationId),
          eq(googleCampaignDrafts.id, id)
        )
      )
      .limit(1)
  )[0];
  if (!row) return fail("Google campaign draft not found.", "NOT_FOUND");
  return row;
}
export async function listGoogleDrafts(
  db: LibraryDatabase,
  organizationId: number,
  connectionId: string
) {
  return db
    .select()
    .from(googleCampaignDrafts)
    .where(
      and(
        eq(googleCampaignDrafts.organizationId, organizationId),
        eq(googleCampaignDrafts.connectionId, connectionId)
      )
    )
    .orderBy(desc(googleCampaignDrafts.updatedAtMs))
    .limit(100);
}
export async function saveGoogleDraft(
  userId: number,
  input: {
    organizationId: number;
    connectionId: string;
    id?: string;
    revision?: number;
    change: GoogleChange;
  }
) {
  await requireOrganizationRole(userId, input.organizationId, [
    "owner",
    "admin",
    "creator",
    "publisher",
  ]);
  const db = await libraryDatabase(),
    change = googleChangeSchema.parse(input.change);
  const connection = (
    await db
      .select()
      .from(channelConnections)
      .where(
        and(
          eq(channelConnections.id, input.connectionId),
          eq(channelConnections.organizationId, input.organizationId),
          eq(channelConnections.channel, "google_ads")
        )
      )
      .limit(1)
  )[0];
  if (!connection || connection.status !== "connected")
    fail("Connect a Google Ads account in this workspace first.");
  return withOrganizationTransaction(db, input.organizationId, async tx => {
    const old = input.id
      ? (
          await tx
            .select()
            .from(googleCampaignDrafts)
            .where(
              and(
                eq(googleCampaignDrafts.id, input.id),
                eq(googleCampaignDrafts.organizationId, input.organizationId)
              )
            )
            .for("update")
        )[0]
      : undefined;
    if (
      input.id &&
      (!old ||
        old.revision !== input.revision ||
        old.connectionId !== input.connectionId ||
        ["publishing", "published", "uncertain"].includes(old.state))
    )
      fail(
        "This draft changed or was submitted. Reload before continuing.",
        "CONFLICT"
      );
    const now = Date.now();
    const row = old
      ? (
          await tx
            .update(googleCampaignDrafts)
            .set({
              change,
              state: "draft",
              revision: old.revision + 1,
              reviewHash: null,
              validatedAtMs: null,
              error: null,
              updatedAtMs: now,
            })
            .where(eq(googleCampaignDrafts.id, old.id))
            .returning()
        )[0]
      : (
          await tx
            .insert(googleCampaignDrafts)
            .values({
              id: randomUUID(),
              organizationId: input.organizationId,
              connectionId: input.connectionId,
              change,
              createdByUserId: userId,
              createdAtMs: now,
              updatedAtMs: now,
            })
            .returning()
        )[0];
    await appendActivity(
      {
        organizationId: input.organizationId,
        actorUserId: userId,
        action: "google_campaign.draft_saved",
        entityType: "google_campaign_draft",
        entityId: row.id,
        payload: { kind: change.kind, revision: row.revision },
      },
      tx
    );
    return row;
  });
}
export async function validateGoogleDraft(
  userId: number,
  input: { organizationId: number; id: string; revision: number }
) {
  await requireOrganizationRole(userId, input.organizationId, [
    "owner",
    "admin",
    "creator",
    "publisher",
  ]);
  const db = await libraryDatabase(),
    draft = await getGoogleDraft(db, input.organizationId, input.id);
  if (
    draft.revision !== input.revision ||
    !["draft", "validated", "failed"].includes(draft.state)
  )
    fail("Reload this draft before validating.", "CONFLICT");
  return withGoogleAdsAccess(
    db,
    input.organizationId,
    draft.connectionId,
    async (c, token) => {
      const prepared = await prepare(
        db,
        input.organizationId,
        c,
        token,
        draft.change
      );
      await mutateGoogleAds(
        token,
        c.accountId,
        prepared.operations,
        true,
        c.details.google?.loginCustomerId
      );
      const updated = (
        await db
          .update(googleCampaignDrafts)
          .set({
            state: "validated",
            reviewHash: prepared.reviewHash,
            validatedAtMs: Date.now(),
            error: null,
          })
          .where(
            and(
              eq(googleCampaignDrafts.id, draft.id),
              eq(googleCampaignDrafts.organizationId, input.organizationId),
              eq(googleCampaignDrafts.revision, draft.revision),
              eq(googleCampaignDrafts.state, draft.state)
            )
          )
          .returning()
      )[0];
      if (!updated)
        fail("Draft changed during validation. Review it again.", "CONFLICT");
      return updated;
    }
  );
}
export async function publishGoogleDraft(
  userId: number,
  input: {
    organizationId: number;
    id: string;
    revision: number;
    reviewHash: string;
    confirm: true;
  }
) {
  await requireOrganizationRole(userId, input.organizationId, [
    "owner",
    "admin",
    "publisher",
  ]);
  if (process.env.LIVE_AD_ACTIONS_ENABLED !== "true")
    fail(
      "Live advertising changes are disabled for this environment. You can save and validate drafts."
    );
  const db = await libraryDatabase(),
    draft = await getGoogleDraft(db, input.organizationId, input.id);
  if (
    draft.state === "published" &&
    draft.revision === input.revision &&
    draft.reviewHash === input.reviewHash
  )
    return draft;
  if (
    draft.state !== "validated" ||
    draft.revision !== input.revision ||
    draft.reviewHash !== input.reviewHash ||
    !draft.validatedAtMs ||
    draft.validatedAtMs < Date.now() - 15 * 60_000
  )
    fail("Validate and review the latest draft before publishing.", "CONFLICT");
  return withGoogleAdsAccess(
    db,
    input.organizationId,
    draft.connectionId,
    async (c, token) => {
      const prepared = await prepare(
        db,
        input.organizationId,
        c,
        token,
        draft.change
      );
      if (prepared.reviewHash !== input.reviewHash)
        fail(
          "The campaign or an approved asset changed. Validate and review again.",
          "CONFLICT"
        );
      // Validate before claiming. Once claimed, a transport failure is never retried automatically.
      await mutateGoogleAds(
        token,
        c.accountId,
        prepared.operations,
        true,
        c.details.google?.loginCustomerId
      );
      await requireOrganizationRole(userId, input.organizationId, [
        "owner",
        "admin",
        "publisher",
      ]);
      await withOrganizationTransaction(db, input.organizationId, async tx => {
        const live = (
          await tx
            .select()
            .from(channelConnections)
            .where(
              and(
                eq(channelConnections.id, c.id),
                eq(channelConnections.organizationId, input.organizationId)
              )
            )
            .for("update")
        )[0];
        if (!live || live.status !== "connected" || live.version !== c.version)
          fail(
            "The account connection changed. Validate the draft again.",
            "CONFLICT"
          );
        const claimed = await tx
          .update(googleCampaignDrafts)
          .set({
            state: "publishing",
            approvedByUserId: userId,
            updatedAtMs: Date.now(),
          })
          .where(
            and(
              eq(googleCampaignDrafts.id, draft.id),
              eq(googleCampaignDrafts.organizationId, input.organizationId),
              eq(googleCampaignDrafts.revision, input.revision),
              eq(googleCampaignDrafts.state, "validated"),
              eq(googleCampaignDrafts.reviewHash, input.reviewHash)
            )
          )
          .returning();
        if (!claimed.length)
          fail("This change has already been submitted or edited.", "CONFLICT");
        await appendActivity(
          {
            organizationId: input.organizationId,
            actorUserId: userId,
            action: "google_campaign.publish_approved",
            entityType: "google_campaign_draft",
            entityId: draft.id,
            payload: {
              kind: draft.change.kind,
              revision: draft.revision,
              reviewHash: input.reviewHash,
            },
          },
          tx
        );
      });
      try {
        const result = await mutateGoogleAds(
          token,
          c.accountId,
          prepared.operations,
          false,
          c.details.google?.loginCustomerId
        );
        return await finish(db, draft, userId, "published", result, null);
      } catch (e) {
        // Even a database failure after Google's success must not lead to a duplicate launch.
        const uncertain = !(e instanceof GoogleMutationError) || e.uncertain;
        return finish(
          db,
          draft,
          userId,
          uncertain ? "uncertain" : "failed",
          null,
          e instanceof GoogleMutationError
            ? e.message
            : "Delivery was not confirmed. Check Google Ads before submitting another change."
        );
      }
    }
  );
}
async function finish(
  db: LibraryDatabase,
  draft: GoogleCampaignDraft,
  userId: number,
  state: "published" | "failed" | "uncertain",
  result: GoogleCampaignDraft["result"],
  error: string | null
) {
  return withOrganizationTransaction(db, draft.organizationId, async tx => {
    const row = (
      await tx
        .update(googleCampaignDrafts)
        .set({ state, result, error, updatedAtMs: Date.now() })
        .where(
          and(
            eq(googleCampaignDrafts.id, draft.id),
            eq(googleCampaignDrafts.organizationId, draft.organizationId),
            eq(googleCampaignDrafts.state, "publishing")
          )
        )
        .returning()
    )[0];
    if (!row)
      fail("This delivery state changed. Reload the draft.", "CONFLICT");
    await appendActivity(
      {
        organizationId: draft.organizationId,
        actorUserId: userId,
        action: `google_campaign.${state}`,
        entityType: "google_campaign_draft",
        entityId: draft.id,
        outcome: state === "published" ? "success" : "failure",
        payload: {
          revision: draft.revision,
          resources: result?.resources,
          requestId: result?.requestId,
        },
      },
      tx
    );
    return row;
  });
}
