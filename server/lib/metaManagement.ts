import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { activityEvents } from "../../drizzle/schema";
import type { ChannelConnection } from "../../drizzle/channelSchema";
import type { MetaChange } from "../../shared/metaManagement";
import {
  budgetMinorUnits,
  metaGoals,
  metaPlacementOptions,
} from "../../shared/metaManagement";
import { connectionToken } from "./channelConnections";
import {
  graphRequest,
  graphCollection,
  graphPost,
  remoteId,
} from "./channelGraph";
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
  const ownsBudget =
    campaign && Number(campaign.daily_budget || campaign.lifetime_budget) > 0;
  if (newCampaign) {
    Object.assign(params, {
      objective: change.objective,
      buying_type: "AUCTION",
      special_ad_categories: JSON.stringify(change.specialCategories),
      status: "PAUSED",
    });
    if (change.budgetMode === "campaign") {
      if (!change.dailyBudget && !change.lifetimeBudget)
        throw new Error("Enter a campaign budget.");
      params.bid_strategy = change.bidStrategy ?? "LOWEST_COST_WITHOUT_CAP";
    } else {
      if (change.dailyBudget || change.lifetimeBudget)
        throw new Error("For ABO, set the budget when creating an ad set.");
      params.is_adset_budget_sharing_enabled = "0";
    }
  }
  if (change.dailyBudget !== undefined || change.lifetimeBudget !== undefined) {
    if (c.details.currency !== "USD")
      throw new Error(
        "Budget editing currently supports USD accounts only. Use Meta Ads Manager for this account's budget."
      );
    if (change.kind === "update_ad")
      throw new Error("Budgets belong to campaigns or ad sets, not ads.");
    if (ownsBudget)
      throw new Error(
        "This campaign owns the budget (CBO). Edit the campaign budget instead."
      );
    if (
      change.kind === "update_campaign" &&
      !Number(before?.daily_budget || before?.lifetime_budget)
    )
      throw new Error(
        "This campaign uses ad-set budgets (ABO). Edit its ad sets; changing budget ownership requires Meta Ads Manager."
      );
    if (
      before &&
      ((Number(before.lifetime_budget) > 0 && change.dailyBudget) ||
        (Number(before.daily_budget) > 0 && change.lifetimeBudget))
    )
      throw new Error(
        "Keep the existing budget type. Change budget type in Meta Ads Manager."
      );
    const amount = change.dailyBudget ?? change.lifetimeBudget!;
    params[
      change.dailyBudget !== undefined ? "daily_budget" : "lifetime_budget"
    ] = String(budgetMinorUnits(amount));
    warnings.push(
      `${change.dailyBudget !== undefined ? "Daily" : "Lifetime"} budget: ${amount.toFixed(2)} USD.`
    );
  }
  if (newSet) {
    if (!change.countries?.length)
      throw new Error("Select at least one target country.");
    const objective = String(campaign!.objective);
    const goals = metaGoals[objective];
    if (!goals)
      throw new Error(
        "Create this objective's ad set in Meta Ads Manager, then refresh and select it here. App, catalog and messaging setup require their dedicated Meta tools."
      );
    const goal = change.optimizationGoal ?? goals[0][0];
    if (!goals.some(([value]) => value === goal))
      throw new Error(
        "This performance goal does not match the campaign objective."
      );
    if (!ownsBudget && !change.dailyBudget && !change.lifetimeBudget)
      throw new Error("Enter an ad-set budget for this ABO campaign.");
    if (
      (change.lifetimeBudget || Number(campaign!.lifetime_budget) > 0) &&
      !change.endTime
    )
      throw new Error("Lifetime budgets require an ad-set end date.");
    if (change.endTime && Date.parse(change.endTime) <= Date.now())
      throw new Error("Choose a future end date.");
    if (change.startTime && Date.parse(change.startTime) <= Date.now())
      throw new Error(
        "Choose a future start date, or leave it blank to start when activated."
      );
    Object.assign(params, {
      campaign_id: change.campaignId!,
      status: "PAUSED",
      billing_event: "IMPRESSIONS",
      optimization_goal: goal,
    });
    const needsPixel = goal === "OFFSITE_CONVERSIONS";
    if (
      ["OUTCOME_SALES", "OUTCOME_TRAFFIC", "OUTCOME_LEADS"].includes(objective)
    )
      params.destination_type = "WEBSITE";
    else if (objective === "OUTCOME_ENGAGEMENT")
      params.destination_type = "ON_AD";
    const strategy = ownsBudget
      ? String(campaign!.bid_strategy || "LOWEST_COST_WITHOUT_CAP")
      : (change.bidStrategy ?? "LOWEST_COST_WITHOUT_CAP");
    if (!ownsBudget) params.bid_strategy = strategy;
    if (["COST_CAP", "LOWEST_COST_WITH_BID_CAP"].includes(strategy)) {
      if (!change.bidAmount)
        throw new Error(
          "This bidding strategy requires a cost or bid cap on the ad set."
        );
      if (c.details.currency !== "USD")
        throw new Error("Bid caps currently support USD accounts only.");
      params.bid_amount = String(budgetMinorUnits(change.bidAmount));
    } else if (change.bidAmount)
      throw new Error("A bid cap cannot be used with Highest volume bidding.");
    const promoted: Record<string, string> = {};
    if (needsPixel) {
      if (!change.pixelId)
        throw new Error("Select a dataset / pixel for website conversions.");
      const pixels = await graphCollection(
        `act_${remoteId(c.accountId)}/adspixels`,
        connectionToken(c),
        { fields: "id" }
      );
      if (!pixels.data.some(p => String(p.id) === change.pixelId))
        throw new Error("The selected pixel is not available to this account.");
      Object.assign(promoted, {
        pixel_id: change.pixelId,
        custom_event_type:
          change.conversionEvent ??
          (objective === "OUTCOME_LEADS" ? "LEAD" : "PURCHASE"),
      });
      if (change.attribution)
        params.attribution_spec = JSON.stringify([
          {
            event_type: "CLICK_THROUGH",
            window_days: change.attribution.startsWith("7d") ? 7 : 1,
          },
          ...(change.attribution.endsWith("1d_view")
            ? [{ event_type: "VIEW_THROUGH", window_days: 1 }]
            : []),
        ]);
    } else if (
      ["OUTCOME_AWARENESS", "OUTCOME_ENGAGEMENT"].includes(objective)
    ) {
      if (!c.details.pageId)
        throw new Error("Connect a Facebook Page to this ad account first.");
      promoted.page_id = c.details.pageId;
    }
    if (Object.keys(promoted).length)
      params.promoted_object = JSON.stringify(promoted);
    if (change.startTime) params.start_time = change.startTime;
    if (change.endTime) params.end_time = change.endTime;
    if (
      campaign!.special_ad_categories?.length &&
      (change.ageMin || change.ageMax || change.genders?.length)
    )
      throw new Error(
        "This special ad category has restricted demographic targeting. Leave age and gender unrestricted and review targeting in Meta."
      );
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
    // The extended controls belong to creation. Legacy updates preserve unedited targeting.
    if (newSet) {
      if (change.ageMin) targeting.age_min = change.ageMin;
      if (change.ageMax) targeting.age_max = change.ageMax;
      if (change.genders?.length)
        targeting.genders = change.genders.map(Number);
      const requested = [
        ...(change.includedAudiences ?? []),
        ...(change.excludedAudiences ?? []),
      ];
      if (requested.length) {
        const audiences = await graphCollection(
          `act_${remoteId(c.accountId)}/customaudiences`,
          connectionToken(c),
          { fields: "id" }
        );
        if (
          requested.some(id => !audiences.data.some(a => String(a.id) === id))
        )
          throw new Error(
            "A selected audience is not available to this ad account. Refresh the audience list."
          );
        if (
          change.includedAudiences?.some(id =>
            change.excludedAudiences?.includes(id)
          )
        )
          throw new Error("An audience cannot be both included and excluded.");
        if (change.includedAudiences?.length)
          targeting.custom_audiences = change.includedAudiences.map(id => ({
            id,
          }));
        if (change.excludedAudiences?.length)
          targeting.excluded_custom_audiences = change.excludedAudiences.map(
            id => ({ id })
          );
      }
    }
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
      if (change.placements === "manual") {
        const selected = metaPlacementOptions.filter(([id]) =>
          change.manualPlacements?.includes(id)
        );
        if (!selected.length) throw new Error("Choose at least one placement.");
        targeting.publisher_platforms = Array.from(
          new Set(selected.map(p => p[2]))
        );
        for (const platform of targeting.publisher_platforms)
          targeting[`${platform}_positions`] = selected
            .filter(p => p[2] === platform)
            .map(p => p[3]);
      }
    }
    if (
      newSet ||
      change.countries ||
      change.audienceMode !== "keep" ||
      change.placements !== "keep"
    )
      params.targeting = JSON.stringify(targeting);
    if (change.audienceMode === "advantage")
      warnings.push(
        "Advantage+ may expand audience suggestions. Meta applies the audience controls and placement eligibility for this campaign."
      );
    if (
      !newSet &&
      (change.audienceMode !== "keep" || change.placements !== "keep")
    )
      warnings.push(
        "Audience or placement changes may affect delivery and learning."
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
