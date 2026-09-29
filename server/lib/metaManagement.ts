import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { activityEvents } from "../../drizzle/schema";
import type { ChannelConnection } from "../../drizzle/channelSchema";
import type { MetaChange } from "../../shared/metaManagement";
import { budgetMinorUnits } from "../../shared/metaManagement";
import { connectionToken } from "./channelConnections";
import { graphRequest, graphPost, remoteId } from "./channelGraph";
import { stableHash } from "./policy";
import { appendActivity, withOrganizationTransaction } from "./activity";
import { liveDeliveryEnabled } from "./publications";
import type { LibraryDatabase } from "./assetLibrary";
function signingKey() {
  const key = process.env.INTEGRATION_TOKEN_ENCRYPTION_SECRET;
  if (!key) throw new Error("Review signing is not configured.");
  return key;
}
export function signMetaReview(payload: object) {
  const text = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return (
    text +
    "." +
    createHmac("sha256", signingKey()).update(text).digest("base64url")
  );
}
export function verifyMetaReview(ticket: string) {
  const [text, sig] = ticket.split(".");
  const expected = createHmac("sha256", signingKey())
    .update(text ?? "")
    .digest();
  const actual = Buffer.from(sig ?? "", "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new Error("This review is invalid. Review the change again.");
  const payload = JSON.parse(Buffer.from(text, "base64url").toString());
  if (!Number.isFinite(payload.expires) || payload.expires < Date.now())
    throw new Error("This review expired. Review the change again.");
  return payload;
}
export async function readMetaObject(
  c: ChannelConnection,
  kind: string,
  id: string
) {
  const fields = kind.includes("campaign")
    ? "id,account_id,name,status,effective_status,objective,daily_budget,lifetime_budget,special_ad_categories,bid_strategy"
    : kind.includes("adset")
      ? "id,account_id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget,targeting,optimization_goal,billing_event,promoted_object,bid_strategy"
      : "id,account_id,name,adset_id,campaign_id,status,effective_status";
  const row = await graphRequest(remoteId(id), connectionToken(c), { fields });
  if (String(row.account_id) !== c.accountId)
    throw new Error("This object belongs to a different ad account.");
  return row;
}
export async function prepareMetaChange(
  c: ChannelConnection,
  change: MetaChange
) {
  if (!c.details.permissions.includes("ads_management"))
    throw new Error("Reconnect with advertising management permission.");
  const before = change.objectId
    ? await readMetaObject(c, change.kind, change.objectId)
    : null;
  const campaign =
    change.kind === "create_adset"
      ? await readMetaObject(c, "campaign", change.campaignId!)
      : change.kind === "update_adset"
        ? await readMetaObject(c, "campaign", String(before!.campaign_id))
        : null;
  const params: Record<string, string> = { name: change.name };
  const warnings: string[] = [];
  const newCampaign = change.kind === "create_campaign",
    newSet = change.kind === "create_adset";
  if (newCampaign) {
    Object.assign(params, {
      objective: change.objective,
      special_ad_categories: JSON.stringify(change.specialCategories),
      status: "PAUSED",
    });
    if (change.budgetMode === "campaign") {
      if (!change.dailyBudget)
        throw new Error("Enter a campaign daily budget.");
      params.bid_strategy = "LOWEST_COST_WITHOUT_CAP";
    } else if (change.dailyBudget)
      throw new Error("For ABO, set the budget when creating an ad set.");
  }
  if (change.dailyBudget !== undefined) {
    if (c.details.currency !== "USD")
      throw new Error("Budget editing currently supports USD accounts only.");
    if (change.kind === "update_ad")
      throw new Error("Budgets belong to campaigns or ad sets, not ads.");
    if (before?.lifetime_budget && Number(before.lifetime_budget) > 0)
      throw new Error(
        "This object uses a lifetime budget. Edit that budget in Meta Ads Manager."
      );
    if (
      campaign &&
      Number(campaign.daily_budget || campaign.lifetime_budget) > 0
    )
      throw new Error(
        "This campaign owns the budget (CBO). Edit the campaign budget instead."
      );
    if (change.kind === "update_campaign" && !Number(before?.daily_budget))
      throw new Error(
        "This campaign uses ad-set budgets (ABO). Edit its ad sets; changing budget ownership requires a separate migration in Meta Ads Manager."
      );
    params.daily_budget = String(budgetMinorUnits(change.dailyBudget));
    warnings.push(
      `Daily budget: ${change.dailyBudget.toFixed(2)} USD. This can change spending if the object is active.`
    );
  }
  if (newSet) {
    if (!change.countries?.length)
      throw new Error("Select at least one target country.");
    if (
      !["OUTCOME_SALES", "OUTCOME_TRAFFIC"].includes(
        String(campaign!.objective)
      )
    )
      throw new Error(
        "New ad sets currently support Sales and Traffic campaigns."
      );
    if (
      !Number(campaign!.daily_budget || campaign!.lifetime_budget) &&
      !change.dailyBudget
    )
      throw new Error("Enter the ad-set daily budget for this ABO campaign.");
    Object.assign(params, {
      campaign_id: change.campaignId!,
      status: "PAUSED",
      billing_event: "IMPRESSIONS",
      destination_type: "WEBSITE",
      optimization_goal:
        campaign!.objective === "OUTCOME_SALES"
          ? "OFFSITE_CONVERSIONS"
          : "LINK_CLICKS",
    });
    if (!Number(campaign!.daily_budget || campaign!.lifetime_budget))
      params.bid_strategy = "LOWEST_COST_WITHOUT_CAP";
    if (campaign!.objective === "OUTCOME_SALES") {
      if (!change.pixelId)
        throw new Error("Select a purchase pixel for this Sales ad set.");
      const pixels = await graphRequest(
        `act_${remoteId(c.accountId)}/adspixels`,
        connectionToken(c),
        { fields: "id", limit: "100" }
      );
      if (!pixels.data?.some((p: any) => String(p.id) === change.pixelId))
        throw new Error("The selected pixel is not available to this account.");
      params.promoted_object = JSON.stringify({
        pixel_id: change.pixelId,
        custom_event_type: "PURCHASE",
      });
    }
  }
  if (newSet || change.kind === "update_adset") {
    const targeting = { ...(before?.targeting ?? {}) };
    if (change.countries)
      targeting.geo_locations = { countries: change.countries };
    if (change.audienceMode !== "keep")
      targeting.targeting_automation = {
        ...(targeting.targeting_automation ?? {}),
        advantage_audience: change.audienceMode === "advantage" ? 1 : 0,
      };
    if (change.placements !== "keep") {
      for (const field of [
        "publisher_platforms",
        "facebook_positions",
        "instagram_positions",
        "audience_network_positions",
        "messenger_positions",
        "threads_positions",
        "device_platforms",
      ])
        delete targeting[field];
      if (change.placements === "facebook_feed")
        Object.assign(targeting, {
          publisher_platforms: ["facebook"],
          facebook_positions: ["feed"],
          device_platforms: ["mobile", "desktop"],
        });
    }
    if (
      newSet ||
      change.countries ||
      change.audienceMode !== "keep" ||
      change.placements !== "keep"
    )
      params.targeting = JSON.stringify(targeting);
    if (change.audienceMode !== "keep" || change.placements !== "keep")
      warnings.push(
        "Audience or placement changes may affect delivery and learning. Meta determines Advantage+ eligibility from the combined settings."
      );
  } else if (
    change.countries ||
    change.audienceMode !== "keep" ||
    change.placements !== "keep"
  )
    throw new Error("Audience and placement controls belong to ad sets.");
  if (change.status && !newCampaign && !newSet) {
    params.status = change.status;
    if (change.status === "ACTIVE")
      warnings.push(
        "Activating this object can begin spending under its budget and parent settings."
      );
  }
  const path = newCampaign
    ? `act_${c.accountId}/campaigns`
    : newSet
      ? `act_${c.accountId}/adsets`
      : remoteId(change.objectId!);
  return {
    before,
    campaign,
    params,
    path,
    warnings,
    connectionVersion: c.version,
  };
}
export async function applyMetaChange(
  db: LibraryDatabase,
  c: ChannelConnection,
  userId: number,
  ticket: string,
  change: MetaChange
) {
  const review = verifyMetaReview(ticket);
  if (
    review.userId !== userId ||
    review.organizationId !== c.organizationId ||
    review.connectionId !== c.id ||
    review.changeHash !== stableHash(change)
  )
    throw new Error("This review does not belong to this change or account.");
  if (!liveDeliveryEnabled("meta_ads"))
    throw new Error(
      "Meta writes are disabled for this environment. Your reviewed change has not been sent."
    );
  const prepared = await prepareMetaChange(c, change);
  if (stableHash(prepared) !== review.snapshot)
    throw new Error(
      "The Meta settings changed since review. Review the current version again."
    );
  const claim = await withOrganizationTransaction(
    db,
    c.organizationId,
    async tx => {
      const existing = await tx
        .select()
        .from(activityEvents)
        .where(
          and(
            eq(activityEvents.organizationId, c.organizationId),
            eq(activityEvents.entityType, "meta_change"),
            eq(activityEvents.entityId, review.requestId)
          )
        );
      if (existing.length)
        throw new Error(
          "This change has already been submitted. Refresh Meta before attempting another change."
        );
      await appendActivity(
        {
          organizationId: c.organizationId,
          actorUserId: userId,
          action: "meta.change_started",
          entityType: "meta_change",
          entityId: review.requestId,
          payload: {
            kind: change.kind,
            objectId: change.objectId,
            accountId: c.accountId,
            params: prepared.params,
          },
        },
        tx
      );
      return true;
    }
  );
  if (!claim) throw new Error("Change could not be claimed.");
  try {
    const result = await graphPost(
      prepared.path,
      connectionToken(c),
      prepared.params
    );
    if (!result.id && result.success !== true)
      throw new Error(
        "Meta did not confirm the change. Check Ads Manager before retrying."
      );
    await appendActivity({
      organizationId: c.organizationId,
      actorUserId: userId,
      action: "meta.change_completed",
      entityType: "meta_change",
      entityId: review.requestId,
      payload: { result, accountId: c.accountId },
    });
    return { id: String(result.id ?? change.objectId), success: true };
  } catch (error) {
    await appendActivity({
      organizationId: c.organizationId,
      actorUserId: userId,
      action: "meta.change_failed",
      entityType: "meta_change",
      entityId: review.requestId,
      outcome: "failure",
      payload: {
        message:
          error instanceof Error
            ? error.message
            : "Unknown outcome; check Meta before retrying.",
      },
    });
    throw error;
  }
}
export async function reviewMetaChange(
  c: ChannelConnection,
  userId: number,
  change: MetaChange
) {
  const prepared = await prepareMetaChange(c, change);
  return {
    ...prepared,
    liveEnabled: liveDeliveryEnabled("meta_ads"),
    ticket: signMetaReview({
      requestId: randomUUID(),
      userId,
      organizationId: c.organizationId,
      connectionId: c.id,
      changeHash: stableHash(change),
      snapshot: stableHash(prepared),
      expires: Date.now() + 300000,
    }),
  };
}
