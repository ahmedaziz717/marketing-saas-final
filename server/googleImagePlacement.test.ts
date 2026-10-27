import { expect, it } from "vitest";
import {
  CREATIVE_FORMATS,
  creativeSetupSchema,
  defaultCreativeSetup,
  formatDetails,
} from "../shared/creativeBuilder";
import { googleCampaignCreateSchema } from "../shared/googleCampaigns";
import {
  googleImageMatches,
  googleMarketingImagePlacement,
} from "../shared/googleImagePlacement";
it("classifies supported marketing dimensions without inferring from filenames or removed assets", () => {
  expect(googleMarketingImagePlacement(1080, 1080)).toBe(
    "SQUARE_MARKETING_IMAGE"
  );
  expect(googleMarketingImagePlacement(1200, 628)).toBe("MARKETING_IMAGE");
  expect(googleMarketingImagePlacement(480, 600)).toBe(
    "PORTRAIT_MARKETING_IMAGE"
  );
  for (const [w, h] of [
    [299, 299],
    [480, 599],
    [1920, 1080],
    [0, 0],
    [NaN, 300],
    [Infinity, 300],
  ]) {
    expect(googleMarketingImagePlacement(w, h)).toBeUndefined();
  }
  expect(googleMarketingImagePlacement()).toBeUndefined();
  expect(googleImageMatches("LOGO", 128, 128)).toBe(true);
  expect(googleMarketingImagePlacement(128, 128)).toBeUndefined();
});

it("offers Google responsive outputs that classify correctly while preserving fixed banners", () => {
  const formatIds = ["google_landscape", "google_square", "google_portrait"];
  const setup = creativeSetupSchema.parse({
    ...defaultCreativeSetup(),
    channels: ["google_display"],
    formatIds,
  });
  expect(setup.formatIds).toEqual(formatIds);
  expect(
    formatIds.map(id => {
      const format = formatDetails(id)!;
      return googleMarketingImagePlacement(format.width, format.height);
    })
  ).toEqual([
    "MARKETING_IMAGE",
    "SQUARE_MARKETING_IMAGE",
    "PORTRAIT_MARKETING_IMAGE",
  ]);
  for (const format of CREATIVE_FORMATS.filter(
    f => f.channel === "google_display" && !formatIds.includes(f.id)
  )) {
    expect(
      googleMarketingImagePlacement(format.width, format.height)
    ).toBeUndefined();
  }
  expect(formatDetails("google_rectangle")).toMatchObject({
    width: 300,
    height: 250,
  });
});

it("points new Display campaigns to missing responsive images before Google submission", () => {
  const campaign = {
    kind: "campaign_create",
    type: "DISPLAY",
    name: "Display launch",
    dailyBudget: 10,
    bidding: { strategy: "MAXIMIZE_CONVERSIONS" },
    politicalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
    locationIds: ["2840"],
    languageIds: ["1000"],
    ad: {
      name: "Display ad",
      finalUrl: "https://example.com",
      businessName: "Example",
      headlines: ["Example headline"],
      descriptions: ["Example description"],
      longHeadline: "Example long headline",
      assets: [
        {
          field: "SQUARE_MARKETING_IMAGE",
          source: { kind: "existing", id: "1" },
        },
      ],
    },
  };
  const missing = googleCampaignCreateSchema.safeParse(campaign);
  expect(missing.success).toBe(false);
  if (!missing.success)
    expect(missing.error.issues).toEqual([
      expect.objectContaining({
        path: ["ad", "assets"],
        message: expect.stringContaining("Landscape · 1.91:1 · 1200 × 628"),
      }),
    ]);
  campaign.ad.assets.push({
    field: "MARKETING_IMAGE",
    source: { kind: "existing", id: "2" },
  });
  expect(googleCampaignCreateSchema.safeParse(campaign).success).toBe(true);
  campaign.ad.assets = campaign.ad.assets.filter(
    a => a.field !== "SQUARE_MARKETING_IMAGE"
  );
  const square = googleCampaignCreateSchema.safeParse(campaign);
  expect(square.success).toBe(false);
  if (!square.success)
    expect(square.error.issues[0].message).toContain("Square · 1:1");
});
