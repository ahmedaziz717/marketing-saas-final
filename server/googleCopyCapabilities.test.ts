import { expect, it } from "vitest";
import {
  googleCopyCapabilities,
  googleCopyRequestSchema,
  remainingGoogleCopy,
} from "../shared/googleCopy";
import { compileGoogleChange } from "./lib/googleCampaignOperations";

it("shares Display limits while legacy requests retain PMAX defaults", () => {
  expect(googleCopyCapabilities().specs.headlines.maximum).toBe(15);
  expect(googleCopyCapabilities("DISPLAY").specs.longHeadlines.maximum).toBe(1);
  expect(
    googleCopyRequestSchema.safeParse({
      counts: { headlines: 15, longHeadlines: 5, descriptions: 5 },
    }).success
  ).toBe(true);
  expect(
    googleCopyRequestSchema.safeParse({
      adType: "DISPLAY",
      counts: { headlines: 5, longHeadlines: 1, descriptions: 5 },
    }).success
  ).toBe(true);
  for (const counts of [
    { headlines: 6, longHeadlines: 1, descriptions: 1 },
    { headlines: 1, longHeadlines: 2, descriptions: 1 },
    { headlines: 1, longHeadlines: 1, descriptions: 6 },
  ])
    expect(
      googleCopyRequestSchema.safeParse({ adType: "DISPLAY", counts }).success
    ).toBe(false);
  expect(
    remainingGoogleCopy(Array(5).fill("HEADLINE"), "DISPLAY").headlines
  ).toBe(0);
  expect(remainingGoogleCopy(Array(5).fill("HEADLINE")).headlines).toBe(10);
  expect(
    googleCopyRequestSchema.safeParse({
      adType: "DISPLAY",
      counts: { headlines: 1, longHeadlines: 0, descriptions: 0 },
      existingCopy: {
        headlines: [],
        longHeadlines: ["One", "Two"],
        descriptions: [],
      },
    }).success
  ).toBe(false);
});

it("compiles Display five-one-five copy without truncation and rejects excess text", () => {
  const ad = {
    name: "Display",
    finalUrl: "https://example.com",
    businessName: "Example",
    headlines: Array.from({ length: 5 }, (_, i) => `Headline ${i}`),
    descriptions: Array.from({ length: 5 }, (_, i) => `Description ${i}`),
    longHeadline: "Long headline",
    assets: [],
    path1: "",
    path2: "",
  };
  const assets = [
    {
      field: "MARKETING_IMAGE" as const,
      resource: "customers/1/assets/1",
      evidence: {},
    },
    {
      field: "SQUARE_MARKETING_IMAGE" as const,
      resource: "customers/1/assets/2",
      evidence: {},
    },
  ];
  const change = {
    kind: "ad_create" as const,
    type: "DISPLAY" as const,
    campaignId: "1",
    adGroupId: "2",
    ad,
  };
  const snapshot = {
    campaign: {
      id: "1",
      resourceName: "customers/1/campaigns/1",
      name: "Display",
      status: "PAUSED",
      advertisingChannelType: "DISPLAY",
      campaignBudget: "customers/1/campaignBudgets/1",
    },
    campaignBudget: { resourceName: "customers/1/campaignBudgets/1" },
  };
  const operations = compileGoogleChange("1", change, assets, snapshot);
  const display = (operations.find(x => x.adGroupAdOperation) as any)
    .adGroupAdOperation.create.ad.responsiveDisplayAd;
  expect(display.headlines).toHaveLength(5);
  expect(display.descriptions).toHaveLength(5);
  expect(display.longHeadline.text).toBe("Long headline");
  expect(() =>
    compileGoogleChange(
      "1",
      { ...change, ad: { ...ad, headlines: [...ad.headlines, "Sixth"] } },
      assets,
      snapshot
    )
  ).toThrow();
  expect(() =>
    compileGoogleChange(
      "1",
      { ...change, ad: { ...ad, longHeadline: undefined } },
      assets,
      snapshot
    )
  ).toThrow();
});
