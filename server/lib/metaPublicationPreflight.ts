import type { PublicationContent } from "../../shared/channels";
import { graphRequest, remoteId } from "./channelGraph";

export type MetaAdSetEvidence = {
  id: string;
  account_id: string;
  campaign_id?: string;
  is_dynamic_creative?: boolean;
  destination_type?: string;
  effective_status?: string;
  promoted_object?: { product_set_id?: string; application_id?: string };
  campaign?: { id: string; objective?: string; effective_status?: string };
};
export function validateMetaDestination(
  adSet: MetaAdSetEvidence,
  accountId: string,
  content: PublicationContent
) {
  if (adSet.account_id !== accountId)
    throw new Error("The selected ad set belongs to a different ad account.");
  if (content.metaCampaignId && adSet.campaign_id !== content.metaCampaignId)
    throw new Error(
      "The selected ad set does not belong to the selected campaign. Update delivery settings."
    );
  if (adSet.is_dynamic_creative)
    throw new Error(
      "This ad set uses Dynamic Creative. Choose a standard ad set for the selected creative format."
    );
  if (
    [adSet.effective_status, adSet.campaign?.effective_status].some(
      s => s === "DELETED" || s === "ARCHIVED"
    )
  )
    throw new Error(
      "The selected campaign or ad set is archived or deleted. Choose an available destination."
    );
  if (adSet.promoted_object?.product_set_id)
    throw new Error(
      "This is a catalog ad set. Choose a website ad set for this image creative; catalog templates are not supported here."
    );
  if (
    adSet.promoted_object?.application_id ||
    ["OUTCOME_APP_PROMOTION", "APP_INSTALLS"].includes(
      adSet.campaign?.objective ?? ""
    )
  )
    throw new Error(
      "This ad set promotes an app. Choose a website campaign for this destination URL."
    );
  if (
    adSet.destination_type &&
    !["WEBSITE", "UNDEFINED"].includes(adSet.destination_type)
  )
    throw new Error(
      `This ad set uses ${adSet.destination_type.replaceAll("_", " ").toLowerCase()}. Choose a website destination for this ad.`
    );
}
export async function preflightMetaPublication(
  accountId: string,
  token: string,
  content: PublicationContent
) {
  const adSet = await graphRequest<MetaAdSetEvidence>(
    remoteId(content.adSetId),
    token,
    {
      fields:
        "id,account_id,campaign_id,is_dynamic_creative,destination_type,effective_status,promoted_object,campaign{id,objective,effective_status}",
    }
  );
  validateMetaDestination(adSet, accountId, content);
  return adSet;
}
