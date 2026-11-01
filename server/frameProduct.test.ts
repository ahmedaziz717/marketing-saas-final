import { describe, expect, it } from "vitest";
import {
  PRODUCT_STAGES,
  PRODUCT_FEATURES,
  PROPOSED_PLANS,
  resolveFeatureAccess,
  usageMonthRange,
  mayManageBilling,
} from "../shared/frameProduct";
describe("Frame commercial and product foundations", () => {
  it("keeps the four agreed product stages", () =>
    expect(PRODUCT_STAGES.map(s => s.label)).toEqual([
      "Create",
      "Activate",
      "Measure",
      "Optimize",
    ]));
  it("preserves proposed pricing without inventing enterprise/video allowances", () => {
    expect(
      PROPOSED_PLANS.map(p => [
        p.id,
        p.monthlyUsd,
        p.credits,
        p.monthlyAdSpendUsd,
      ])
    ).toEqual([
      ["launch", 99, 1000, 10000],
      ["growth", 299, 4000, 50000],
      ["scale", 799, 15000, 250000],
      ["enterprise", null, null, null],
    ]);
  });
  it("keeps planned tools unavailable even for an entitled subscription", () => {
    expect(
      resolveFeatureAccess("ai_agent", {
        mode: "subscription",
        includedFeatures: ["ai_agent"],
      }).access
    ).toBe("planned");
    expect(
      resolveFeatureAccess("attribution", { mode: "preview" }).access
    ).toBe("planned");
  });
  it("separates preview, included and not-in-plan access without assigning a paid tier", () => {
    expect(
      resolveFeatureAccess("image_assets", { mode: "preview" }).access
    ).toBe("preview");
    expect(
      resolveFeatureAccess("image_assets", {
        mode: "subscription",
        includedFeatures: [],
      }).access
    ).toBe("not_in_plan");
    expect(
      resolveFeatureAccess("image_assets", {
        mode: "subscription",
        includedFeatures: ["image_assets"],
      }).access
    ).toBe("included");
    expect(
      resolveFeatureAccess("advertising", { mode: "preview" }).feature
        .availability
    ).toBe("connection_required");
  });
  it("does not conflate approval or publishing roles with billing", () => {
    expect(["owner", "admin"].every(mayManageBilling)).toBe(true);
    expect(
      ["creator", "publisher", "reviewer", "", "superadmin"].some(
        mayManageBilling
      )
    ).toBe(false);
  });
  it("rejects bad months and uses inclusive start / exclusive end UTC boundaries", () => {
    expect(usageMonthRange("2028-02")).toEqual({
      start: Date.UTC(2028, 1, 1),
      end: Date.UTC(2028, 2, 1),
    });
    for (const value of [
      "2026-00",
      "2026-13",
      "2026-9",
      "2026-09-01",
      "9999-12",
      "DROP TABLE",
    ])
      expect(() => usageMonthRange(value)).toThrow();
  });
  it("assigns unique feature IDs and routes with no duplicate stores", () => {
    expect(new Set(PRODUCT_FEATURES.map(f => f.id)).size).toBe(
      PRODUCT_FEATURES.length
    );
    expect(new Set(PRODUCT_FEATURES.map(f => f.href)).size).toBe(
      PRODUCT_FEATURES.length
    );
  });
});
