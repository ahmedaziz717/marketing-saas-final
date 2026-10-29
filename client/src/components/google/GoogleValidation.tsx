import { createContext, useContext, useId, type ReactNode } from "react";
import "./googleValidation.css";
import { Button } from "@/components/ui/button";
import type { GoogleChange } from "@shared/googleCampaigns";

export type GoogleIssue = { path: PropertyKey[]; message: string };
export type GoogleIssuePresentation = {
  field: string;
  label: string;
  section: string;
  message: string;
};

/** Presentation only: requirements remain in the shared schema and provider validation. */
export function googleIssuePresentation(
  issue: GoogleIssue,
  change?: GoogleChange
): GoogleIssuePresentation {
  let field = issue.path.map(String).join(".");
  if (!field) {
    const text = issue.message;
    if (/end date/i.test(text)) field = "endDate";
    else if (/bid target/i.test(text)) field = "bidding.target";
    else if (/bidding strategy/i.test(text)) field = "bidding.strategy";
    else if (/landing page/i.test(text)) field = "ad.finalUrl";
    else if (/Search needs/i.test(text)) field = "keywords";
    else if (/Merchant Center/i.test(text)) field = "merchantId";
    else if (/app ID/i.test(text)) field = "appId";
    else if (/audience/i.test(text)) field = "audienceId";
    else if (/long headline/i.test(text)) field = "ad.longHeadline";
    else if (/headlines|descriptions/i.test(text)) field = "ad.headlines";
    else if (/image|logo/i.test(text)) field = "ad.assets";
  }
  const root = field.split(".")[0];
  const adField = field.startsWith("ad.")
    ? field.split(".").slice(0, 2).join(".")
    : field;
  const target = field.startsWith("ad.assets")
    ? "ad.assets"
    : field.startsWith("ad.")
      ? adField
      : field.startsWith("bidding.")
        ? field.split(".").slice(0, 2).join(".")
        : root;
  const group = change?.kind.startsWith("asset_group");
  const labels: Record<string, string> = {
    name: group ? "Asset group name" : "Campaign name",
    dailyBudget: "Daily budget",
    "bidding.strategy": "Bidding strategy",
    "bidding.target": "Bid target",
    bidding: "Bidding",
    startDate: "Start date",
    endDate: "End date",
    locationIds: "Locations",
    languageIds: "Languages",
    keywords: "Keywords and Search copy",
    politicalAdvertising: "EU political advertising declaration",
    merchantId: "Merchant Center account and feed label",
    feedLabel: "Feed label",
    audienceId: "Audience",
    appId: "App ID",
    appStore: "App store",
    demandChannels: "Demand Gen surfaces",
    "ad.name":
      change && "type" in change && change.type === "PERFORMANCE_MAX"
        ? "Asset group name"
        : "Ad name",
    "ad.finalUrl": "Landing page",
    finalUrl: "Landing page",
    "ad.businessName": "Business name",
    "ad.headlines": "Short headlines",
    "ad.longHeadline": "Long headlines",
    "ad.descriptions": "Descriptions",
    "ad.assets": "Creative assets",
    assets: "Creative and copy assets",
    add: "New creative and copy",
    remove: "Selected replacements",
    "ad.path1": "Display path 1",
    "ad.path2": "Display path 2",
    campaignId: "Campaign",
    assetGroupId: "Asset group",
    adGroupId: "Ad group",
  };
  const section = ["campaignId", "assetGroupId", "adGroupId"].includes(root)
    ? "campaign"
    : ["locationIds", "languageIds"].includes(root)
      ? "targeting"
      : [
            "keywords",
            "merchantId",
            "feedLabel",
            "appId",
            "appStore",
            "audienceId",
            "politicalAdvertising",
            "demandChannels",
          ].includes(root)
        ? "options"
        : field.startsWith("ad.")
          ? ["ad.name", "ad.finalUrl", "ad.assets"].includes(target)
            ? "creative"
            : "copy"
          : group || ["assets", "add", "remove"].includes(root)
            ? "creative"
            : "settings";
  return {
    field: target || "settings",
    label: labels[target] ?? "Campaign settings",
    section,
    message: issue.message,
  };
}
const Context = createContext<GoogleIssuePresentation[]>([]);
const LogoActionContext = createContext<(() => void) | undefined>(undefined);
export function GoogleValidationProvider({
  issues,
  change,
  onChooseLogos,
  children,
}: {
  issues: GoogleIssue[];
  change?: GoogleChange;
  onChooseLogos?: () => void;
  children: ReactNode;
}) {
  return (
    <Context.Provider
      value={issues.map(issue => googleIssuePresentation(issue, change))}
    >
      <LogoActionContext.Provider value={onChooseLogos}>
        {children}
      </LogoActionContext.Provider>
    </Context.Provider>
  );
}
export function useGoogleFieldValidation(path?: string) {
  const issues = useContext(Context);
  const id = `google-error-${useId().replace(/:/g, "")}`;
  const messages = Array.from(
    new Set(
      issues
        .filter(
          issue =>
            path && (issue.field === path || issue.field.startsWith(`${path}.`))
        )
        .map(issue => issue.message)
    )
  );
  return { messages, errorId: id, invalid: messages.length > 0 };
}
export function GoogleFieldErrors({ path }: { path: string }) {
  const { messages } = useGoogleFieldValidation(path);
  const onChooseLogos = useContext(LogoActionContext);
  const missingLogo = messages.some(message =>
    /^Add .*square logos/.test(message)
  );
  return messages.length ? (
    <div className="google-field-error" role="alert">
      {messages.map(message => (
        <p key={message}>{message}</p>
      ))}
      {missingLogo && (
        <div>
          <p>
            A square image is not automatically a logo. Choose Logos, then
            Square logo · 1:1, and select your approved logo. 128 × 128 px is
            the minimum, not an exact size; larger square logos are supported.
          </p>
          {onChooseLogos && (
            <Button type="button" variant="outline" onClick={onChooseLogos}>
              Choose Logos
            </Button>
          )}
        </div>
      )}
    </div>
  ) : null;
}
