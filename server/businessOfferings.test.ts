import { it, expect } from "vitest";
import {
  businessProfileSchema,
  offeringLabel,
} from "../shared/businessProfile";
import { catalogEntrySchema } from "../shared/catalog";
import {
  defaultCreativeSetup,
  generationSetupIssues,
  outputCount,
} from "../shared/creativeBuilder";
import { contentSchema } from "../shared/channels";
import { metaTextFeed } from "../shared/metaCreative";
it("supports recurring subscriptions and third-party identity without a product image", () => {
  const plan = catalogEntrySchema.parse({
    name: "Provider membership",
    productUrl: "https://example.test/plans",
    recordType: "service",
    serviceDetails: {
      offeringType: "membership",
      ownership: "own",
      pricing: "recurring",
      billingPeriod: "annual",
      audience: "Education providers",
      trial: "30 days",
      benefits: "Listing visibility",
    },
  });
  expect(plan.imageUrl).toBe("");
  expect(offeringLabel(plan)).toBe("Membership");
  expect(
    businessProfileSchema.safeParse({
      model: "directory",
      timezone: "invalid-zone",
    }).success
  ).toBe(false);
});
it("supports platform creatives without catalog products", () => {
  const setup = {
    ...defaultCreativeSetup(),
    promotionMode: "platform" as const,
    copy: {
      headline: "Explore learning",
      subheadline: "Browse educational resources",
      cta: "Learn more",
    },
  };
  expect(generationSetupIssues(setup)).not.toContain(
    "Select at least one offering, or promote the platform."
  );
  expect(outputCount(setup)).toBe(setup.formatIds.length);
});
it("bounds and isolates Meta multiple text formats", () => {
  const c = contentSchema.parse({
    title: "Draft",
    message: "A",
    headline: "B",
    textVariants: { messages: ["A", "C"], headlines: [], descriptions: [] },
  });
  expect(metaTextFeed(c).bodies).toEqual([{ text: "A" }, { text: "C" }]);
  expect(() =>
    metaTextFeed({ ...c, carouselAssetKeys: ["asset:1", "asset:2"] })
  ).toThrow("single-image");
  expect(
    contentSchema.safeParse({
      ...c,
      textVariants: {
        messages: Array(5).fill("extra"),
        headlines: [],
        descriptions: [],
      },
    }).success
  ).toBe(false);
});
