import { TRPCError } from "@trpc/server";
import {
  googleChangeSchema,
  type GoogleAdContent,
  type GoogleAssetInput,
  type GoogleChange,
} from "../../shared/googleCampaigns";
import type { GoogleOperation } from "./googleAdsMutate";

export type GoogleCampaignSnapshot = {
  campaign: {
    id: string;
    resourceName: string;
    name: string;
    status: string;
    advertisingChannelType: string;
    brandGuidelinesEnabled?: boolean;
    shoppingSetting?: { merchantId?: string };
    campaignBudget: string;
  };
  campaignBudget: {
    resourceName: string;
    amountMicros?: string;
    period?: string;
    explicitlyShared?: boolean;
  };
};
export type PreparedGoogleAsset = {
  field: GoogleAssetInput["field"];
  resource: string;
  operation?: GoogleOperation;
  evidence: unknown;
};
function invalid(message: string): never {
  throw new TRPCError({ code: "BAD_REQUEST", message });
}
export const googleMicros = (v: number) => String(Math.round(v * 1_000_000));

/** Pure, allowlisted compiler. No caller-supplied operation or resource URL reaches Google. */
export function compileGoogleChange(
  customerId: string,
  input: GoogleChange,
  assets: PreparedGoogleAsset[],
  snapshot?: GoogleCampaignSnapshot
) {
  const change = googleChangeSchema.parse(input);
  const resource = (type: string, id: string | number) =>
    `customers/${customerId}/${type}/${id}`;
  if (change.kind === "campaign_create" || change.kind === "ad_create") {
    const allowed: Record<string, string[]> = {
      SEARCH: [],
      SHOPPING: [],
      DISPLAY: [
        "MARKETING_IMAGE",
        "SQUARE_MARKETING_IMAGE",
        "LOGO",
        "LANDSCAPE_LOGO",
      ],
      DEMAND_GEN: [
        "MARKETING_IMAGE",
        "SQUARE_MARKETING_IMAGE",
        "PORTRAIT_MARKETING_IMAGE",
        "LOGO",
      ],
      APP: [
        "MARKETING_IMAGE",
        "SQUARE_MARKETING_IMAGE",
        "PORTRAIT_MARKETING_IMAGE",
        "YOUTUBE_VIDEO",
      ],
      PERFORMANCE_MAX: [
        "HEADLINE",
        "LONG_HEADLINE",
        "DESCRIPTION",
        "BUSINESS_NAME",
        "MARKETING_IMAGE",
        "SQUARE_MARKETING_IMAGE",
        "PORTRAIT_MARKETING_IMAGE",
        "LOGO",
        "LANDSCAPE_LOGO",
        "YOUTUBE_VIDEO",
      ],
    };
    if (assets.some(a => !allowed[change.type].includes(a.field)))
      invalid(
        "Remove asset placements that are not supported by this ad type."
      );
  }
  const operations: GoogleOperation[] = assets.flatMap(a =>
    a.operation ? [a.operation] : []
  );
  const create = (kind: string, value: Record<string, unknown>) =>
    operations.push({ [`${kind}Operation`]: { create: value } });
  const update = (
    kind: string,
    value: Record<string, unknown>,
    updateMask: string
  ) => operations.push({ [`${kind}Operation`]: { update: value, updateMask } });
  const images = (field: GoogleAssetInput["field"]) =>
    assets.filter(a => a.field === field).map(a => ({ asset: a.resource }));
  const ad = (group: string, type: string, content: GoogleAdContent) => {
    if (!["SHOPPING", "APP"].includes(type) && !content.finalUrl)
      invalid("Enter an HTTPS landing page.");
    if (
      type !== "SHOPPING" &&
      (!content.headlines.length || !content.descriptions.length)
    )
      invalid("Add headlines and descriptions.");
    const headlines = content.headlines.map(text => ({ text })),
      descriptions = content.descriptions.map(text => ({ text }));
    const common = {
      headlines,
      descriptions,
      businessName: content.businessName,
      marketingImages: images("MARKETING_IMAGE"),
      squareMarketingImages: images("SQUARE_MARKETING_IMAGE"),
    };
    const data: Record<string, unknown> = {
      name: content.name,
      finalUrls: [content.finalUrl],
    };
    if (type === "SEARCH") {
      if (
        headlines.length < 3 ||
        descriptions.length < 2 ||
        descriptions.length > 4
      )
        invalid("Search ads need 3–15 headlines and 2–4 descriptions.");
      data.responsiveSearchAd = {
        headlines,
        descriptions,
        path1: content.path1,
        path2: content.path2,
      };
    } else if (type === "DISPLAY") {
      if (
        headlines.length > 5 ||
        !content.longHeadline ||
        !content.businessName ||
        !images("MARKETING_IMAGE").length ||
        !images("SQUARE_MARKETING_IMAGE").length
      )
        invalid("Complete the Display ad text and images before review.");
      data.responsiveDisplayAd = {
        ...common,
        longHeadline: { text: content.longHeadline },
        logoImages: images("LOGO"),
        squareLogoImages: images("LOGO"),
      };
      // Landscape logos and square logos are different Google asset placements.
      (data.responsiveDisplayAd as any).logoImages = images("LANDSCAPE_LOGO");
    } else if (type === "DEMAND_GEN") {
      if (
        headlines.length > 5 ||
        !images("LOGO").length ||
        !content.businessName
      )
        invalid(
          "Demand Gen requires 1–5 headlines, a business name and square logo."
        );
      data.demandGenMultiAssetAd = {
        ...common,
        logoImages: images("LOGO"),
        portraitMarketingImages: images("PORTRAIT_MARKETING_IMAGE"),
      };
    } else if (type === "SHOPPING") {
      delete data.finalUrls;
      data.shoppingProductAd = {};
    } else if (type === "APP") {
      delete data.finalUrls;
      delete data.name;
      if (headlines.length > 5) invalid("App ads accept up to 5 headlines.");
      data.appAd = {
        headlines,
        descriptions,
        images: assets
          .filter(a => a.field.includes("IMAGE"))
          .map(a => ({ asset: a.resource })),
        youtubeVideos: images("YOUTUBE_VIDEO"),
      };
    } else invalid("This ad type cannot be created here.");
    create("adGroupAd", { adGroup: group, status: "ENABLED", ad: data });
  };
  const linkAssets = (
    campaign: string,
    group: string,
    brandGuidelines: boolean
  ) => {
    for (const asset of assets) {
      const brand =
        brandGuidelines &&
        ["BUSINESS_NAME", "LOGO", "LANDSCAPE_LOGO"].includes(asset.field);
      create(brand ? "campaignAsset" : "assetGroupAsset", {
        [brand ? "campaign" : "assetGroup"]: brand ? campaign : group,
        asset: asset.resource,
        fieldType: asset.field,
      });
    }
  };
  if (change.kind === "campaign_update") {
    if (!snapshot || snapshot.campaign.id !== change.campaignId)
      invalid("Reload this campaign before editing.");
    if (
      snapshot.campaignBudget.period &&
      snapshot.campaignBudget.period !== "DAILY"
    )
      invalid(
        "This campaign uses a total budget. Manage that budget in Google Ads."
      );
    update(
      "campaign",
      {
        resourceName: resource("campaigns", change.campaignId),
        name: change.name,
        status: change.status,
      },
      "name,status"
    );
    if (
      snapshot.campaignBudget.amountMicros !== googleMicros(change.dailyBudget)
    ) {
      if (snapshot.campaignBudget.explicitlyShared)
        invalid(
          "This is a shared budget. Edit it in Google Ads so all affected campaigns can be reviewed."
        );
      update(
        "campaignBudget",
        {
          resourceName: snapshot.campaign.campaignBudget,
          amountMicros: googleMicros(change.dailyBudget),
        },
        "amount_micros"
      );
    }
  } else if (change.kind === "campaign_create") {
    const budget = resource("campaignBudgets", -1),
      campaign = resource("campaigns", -2),
      group = resource(
        change.type === "PERFORMANCE_MAX" ? "assetGroups" : "adGroups",
        -3
      );
    create("campaignBudget", {
      resourceName: budget,
      name: change.name,
      amountMicros: googleMicros(change.dailyBudget),
      deliveryMethod: "STANDARD",
      explicitlyShared: false,
    });
    const data: Record<string, unknown> = {
      resourceName: campaign,
      name: change.name,
      status: change.status,
      advertisingChannelType:
        change.type === "APP" ? "MULTI_CHANNEL" : change.type,
      campaignBudget: budget,
      containsEuPoliticalAdvertising: change.politicalAdvertising,
    };
    const strategy = change.bidding.strategy,
      target = change.bidding.target;
    if (strategy === "MAXIMIZE_CONVERSIONS")
      data.maximizeConversions = target
        ? { targetCpaMicros: googleMicros(target) }
        : {};
    if (strategy === "MAXIMIZE_CONVERSION_VALUE")
      data.maximizeConversionValue = target ? { targetRoas: target } : {};
    if (strategy === "MAXIMIZE_CLICKS") data.targetSpend = {};
    if (strategy === "TARGET_CPA")
      data.targetCpa = { targetCpaMicros: googleMicros(target!) };
    if (strategy === "TARGET_ROAS") data.targetRoas = { targetRoas: target };
    if (strategy === "MANUAL_CPC") data.manualCpc = {};
    if (change.startDate) data.startDateTime = `${change.startDate} 00:00:00`;
    if (change.endDate) data.endDateTime = `${change.endDate} 23:59:59`;
    if (change.type === "SEARCH")
      data.networkSettings = {
        targetGoogleSearch: true,
        targetSearchNetwork: change.searchPartners,
        targetContentNetwork: change.displayExpansion,
      };
    if (change.type === "PERFORMANCE_MAX") {
      data.brandGuidelinesEnabled = true;
      data.urlExpansionOptOut = !change.urlExpansion;
    }
    if (
      change.type === "SHOPPING" ||
      (change.type === "PERFORMANCE_MAX" && change.merchantId)
    )
      data.shoppingSetting = {
        merchantId: change.merchantId,
        feedLabel: change.feedLabel,
        ...(change.type === "SHOPPING"
          ? { campaignPriority: change.shoppingPriority }
          : {}),
      };
    if (change.type === "APP") {
      data.advertisingChannelSubType = "APP_CAMPAIGN";
      data.appCampaignSetting = {
        appId: change.appId,
        appStore: change.appStore,
        biddingStrategyGoalType:
          strategy === "TARGET_CPA"
            ? "OPTIMIZE_INSTALLS_TARGET_INSTALL_COST"
            : "OPTIMIZE_INSTALLS_WITHOUT_TARGET_INSTALL_COST",
      };
    }
    create("campaign", data);
    if (change.type === "PERFORMANCE_MAX") {
      create("assetGroup", {
        resourceName: group,
        name: change.ad.name,
        campaign,
        finalUrls: [change.ad.finalUrl],
        status: "ENABLED",
      });
      linkAssets(campaign, group, true);
      if (change.merchantId)
        create("assetGroupListingGroupFilter", {
          assetGroup: group,
          type: "UNIT_INCLUDED",
          listingSource: "SHOPPING",
        });
    } else {
      const groupData: Record<string, unknown> = {
        resourceName: group,
        name: change.ad.name,
        campaign,
        status: "ENABLED",
      };
      if (change.type === "DEMAND_GEN" && change.demandChannels)
        groupData.demandGenAdGroupSettings = {
          channelControls: {
            selectedChannels: Object.fromEntries(
              [
                "youtubeInStream",
                "youtubeInFeed",
                "youtubeShorts",
                "discover",
                "gmail",
                "display",
                "maps",
              ].map(key => [
                key,
                change.demandChannels!.includes(
                  key as NonNullable<typeof change.demandChannels>[number]
                ),
              ])
            ),
          },
        };
      if (["SEARCH", "DISPLAY", "SHOPPING"].includes(change.type))
        groupData.type = {
          SEARCH: "SEARCH_STANDARD",
          DISPLAY: "DISPLAY_STANDARD",
          SHOPPING: "SHOPPING_PRODUCT_ADS",
        }[change.type as "SEARCH" | "DISPLAY" | "SHOPPING"];
      if (strategy === "MANUAL_CPC")
        groupData.cpcBidMicros = googleMicros(target!);
      create("adGroup", groupData);
      if (change.type === "SEARCH")
        for (const keyword of change.keywords)
          create("adGroupCriterion", {
            adGroup: group,
            status: "ENABLED",
            negative: keyword.negative,
            keyword: { text: keyword.text, matchType: keyword.match },
          });
      if (change.type === "SHOPPING")
        create("adGroupCriterion", {
          adGroup: group,
          status: "ENABLED",
          listingGroup: { type: "UNIT" },
          ...(strategy === "MANUAL_CPC"
            ? { cpcBidMicros: googleMicros(target!) }
            : {}),
        });
      if (change.type === "DEMAND_GEN")
        create("adGroupCriterion", {
          adGroup: group,
          audience: { audience: resource("audiences", change.audienceId!) },
        });
      ad(group, change.type, change.ad);
    }
    const targetingAtGroup = change.type === "DEMAND_GEN";
    for (const locationId of change.locationIds)
      create(targetingAtGroup ? "adGroupCriterion" : "campaignCriterion", {
        [targetingAtGroup ? "adGroup" : "campaign"]: targetingAtGroup
          ? group
          : campaign,
        location: { geoTargetConstant: `geoTargetConstants/${locationId}` },
      });
    for (const languageId of change.languageIds)
      create(targetingAtGroup ? "adGroupCriterion" : "campaignCriterion", {
        [targetingAtGroup ? "adGroup" : "campaign"]: targetingAtGroup
          ? group
          : campaign,
        language: { languageConstant: `languageConstants/${languageId}` },
      });
  } else if (change.kind === "ad_create") {
    if (snapshot?.campaign.advertisingChannelType !== change.type)
      invalid("Choose an ad type matching the selected campaign.");
    ad(resource("adGroups", change.adGroupId), change.type, change.ad);
  } else {
    if (snapshot?.campaign.advertisingChannelType !== "PERFORMANCE_MAX")
      invalid("Asset groups require a Performance Max campaign.");
    const group = resource(
      "assetGroups",
      change.kind === "asset_group_create" ? -3 : change.assetGroupId
    );
    if (change.kind === "asset_group_update")
      update(
        "assetGroup",
        {
          resourceName: group,
          name: change.name,
          status: change.status,
          finalUrls: [change.finalUrl],
        },
        "name,status,final_urls"
      );
    if (change.kind === "asset_group_create")
      create("assetGroup", {
        resourceName: group,
        name: change.name,
        campaign: resource("campaigns", change.campaignId),
        finalUrls: [change.finalUrl],
        status: "ENABLED",
      });
    if (
      snapshot.campaign.brandGuidelinesEnabled &&
      assets.some(a =>
        ["LOGO", "LANDSCAPE_LOGO", "BUSINESS_NAME"].includes(a.field)
      )
    )
      invalid(
        "This campaign manages brand assets at campaign level. Keep its existing brand assets and add creative assets to this group."
      );
    linkAssets(resource("campaigns", change.campaignId), group, false);
    if (
      change.kind === "asset_group_create" &&
      snapshot.campaign.shoppingSetting?.merchantId
    )
      create("assetGroupListingGroupFilter", {
        assetGroup: group,
        type: "UNIT_INCLUDED",
        listingSource: "SHOPPING",
      });
    if (change.kind === "asset_group_assets")
      for (const remove of change.remove)
        operations.push({
          assetGroupAssetOperation: {
            remove: resource(
              "assetGroupAssets",
              `${change.assetGroupId}~${remove.assetId}~${remove.field}`
            ),
          },
        });
  }
  return operations;
}

export function googleChangeAssets(change: GoogleChange): GoogleAssetInput[] {
  if (change.kind === "campaign_create" && change.type === "PERFORMANCE_MAX")
    return [
      ...change.ad.assets,
      ...change.ad.headlines.map(text => ({
        field: "HEADLINE" as const,
        source: { kind: "text" as const, text },
      })),
      ...change.ad.descriptions.map(text => ({
        field: "DESCRIPTION" as const,
        source: { kind: "text" as const, text },
      })),
      {
        field: "LONG_HEADLINE",
        source: { kind: "text", text: change.ad.longHeadline! },
      },
      {
        field: "BUSINESS_NAME",
        source: { kind: "text", text: change.ad.businessName! },
      },
    ];
  if (change.kind === "campaign_create" || change.kind === "ad_create")
    return change.ad.assets;
  if (change.kind === "asset_group_create") return change.assets;
  if (change.kind === "asset_group_assets") return change.add;
  return [];
}
