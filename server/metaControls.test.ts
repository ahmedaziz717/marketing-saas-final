import { beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import { assetFit, assetFormat } from "../shared/assetFit";
import { metaLinkData } from "../shared/metaCreative";
import { contentSchema } from "../shared/channels";
import { metaChangeSchema } from "../shared/metaManagement";
const graph = vi.hoisted(() => vi.fn());
vi.mock("./lib/channelGraph", () => ({
  graphRequest: graph,
  graphPost: vi.fn(),
  graphCollection: graph,
  remoteId: (id: string) => id,
}));
vi.mock("./lib/channelConnections", () => ({
  connectionToken: () => "test-token",
}));
import {
  prepareMetaChange,
  signMetaReview,
  verifyMetaReview,
} from "./lib/metaManagement";
const connection = {
  id: "test",
  accountId: "456",
  version: 1,
  details: { permissions: ["ads_management"], currency: "USD" },
} as any;
beforeEach(() => {
  graph.mockReset();
  vi.stubEnv("INTEGRATION_TOKEN_ENCRYPTION_SECRET", "unit-test-only-key");
});
afterAll(() => vi.unstubAllEnvs());
describe("approved creative compatibility", () => {
  it("distinguishes square carousel images, portrait single images and reference assets", () => {
    const square = {
      purpose: "finished",
      mediaType: "image",
      width: 1080,
      height: 1080,
    } as any;
    expect(assetFit(square, "meta_ads", true)).toBe(true);
    expect(assetFit({ ...square, height: 1350 }, "meta_ads", true)).toBe(false);
    expect(assetFit({ ...square, height: 1350 }, "meta_ads")).toBe(true);
    expect(assetFit({ ...square, purpose: "reference" }, "meta_ads")).toBe(
      false
    );
    expect(assetFit({ ...square, width: 100, height: 100 }, "meta_ads")).toBe(
      false
    );
    expect(assetFormat({ format: "Square" } as any)).toBe("square");
  });
  it("keeps carousel order and prevents Meta reordering", () => {
    const body = metaLinkData(
      contentSchema.parse({
        title: "Test",
        message: "Caption",
        link: "https://example.com",
        headline: "Shop",
      }),
      ["second", "first"]
    );
    expect(body.child_attachments?.map(a => a.image_hash)).toEqual([
      "second",
      "first",
    ]);
    expect(body.multi_share_optimized).toBe(false);
    expect(
      body.child_attachments?.every(a => a.link === "https://example.com")
    ).toBe(true);
    expect(() => metaLinkData({} as any, [])).toThrow();
  });
});
describe("reviewed Meta management", () => {
  it("creates CBO campaigns paused with cents, never active", async () => {
    const change = metaChangeSchema.parse({
      kind: "create_campaign",
      name: "Test",
      budgetMode: "campaign",
      dailyBudget: 25.15,
    });
    expect((await prepareMetaChange(connection, change)).params).toMatchObject({
      status: "PAUSED",
      daily_budget: "2515",
      objective: "OUTCOME_SALES",
    });
    expect(
      metaChangeSchema.safeParse({ ...change, status: "ACTIVE" }).success
    ).toBe(false);
  });
  it("rejects objects belonging to another account", async () => {
    graph.mockResolvedValue({ account_id: "789" });
    await expect(
      prepareMetaChange(
        connection,
        metaChangeSchema.parse({
          kind: "update_ad",
          objectId: "1",
          name: "Test",
        })
      )
    ).rejects.toThrow("different ad account");
  });
  it("preserves existing audience restrictions when changing placements", async () => {
    graph
      .mockResolvedValueOnce({
        account_id: "456",
        campaign_id: "2",
        targeting: {
          age_min: 25,
          geo_locations: { countries: ["US"] },
          custom_audiences: [{ id: "9" }],
          instagram_positions: ["stream"],
        },
      })
      .mockResolvedValueOnce({ account_id: "456", daily_budget: "2500" });
    const result = await prepareMetaChange(
      connection,
      metaChangeSchema.parse({
        kind: "update_adset",
        objectId: "1",
        name: "Test",
        placements: "facebook_feed",
      })
    );
    expect(JSON.parse(result.params.targeting)).toEqual({
      age_min: 25,
      geo_locations: { countries: ["US"] },
      custom_audiences: [{ id: "9" }],
      publisher_platforms: ["facebook"],
      facebook_positions: ["feed"],
      device_platforms: ["mobile", "desktop"],
    });
  });
  it("blocks accidental ABO to CBO conversion", async () => {
    graph.mockResolvedValue({ account_id: "456" });
    await expect(
      prepareMetaChange(
        connection,
        metaChangeSchema.parse({
          kind: "update_campaign",
          objectId: "1",
          name: "Test",
          dailyBudget: 10,
        })
      )
    ).rejects.toThrow("ABO");
  });
  it("creates a Traffic ad set in the selected account and campaign, paused with its budget and manual placements", async () => {
    graph.mockResolvedValueOnce({
      account_id: "456",
      id: "2",
      objective: "OUTCOME_TRAFFIC",
    });
    const change = metaChangeSchema.parse({
      kind: "create_adset",
      name: "Traffic",
      campaignId: "2",
      dailyBudget: 12.25,
      countries: ["US", "CA"],
      audienceMode: "manual",
      ageMin: 25,
      ageMax: 55,
      genders: ["2"],
      placements: "manual",
      manualPlacements: ["facebook_feed", "instagram_reels"],
      optimizationGoal: "LANDING_PAGE_VIEWS",
    });
    const result = await prepareMetaChange(connection, change);
    expect(result.path).toBe("act_456/adsets");
    expect(result.params).toMatchObject({
      campaign_id: "2",
      status: "PAUSED",
      daily_budget: "1225",
      optimization_goal: "LANDING_PAGE_VIEWS",
      destination_type: "WEBSITE",
      billing_event: "IMPRESSIONS",
    });
    expect(JSON.parse(result.params.targeting)).toMatchObject({
      age_min: 25,
      age_max: 55,
      genders: [2],
      geo_locations: { countries: ["US", "CA"] },
      publisher_platforms: ["facebook", "instagram"],
      facebook_positions: ["feed"],
      instagram_positions: ["reels"],
    });
  });
  it("uses the parent CBO budget and validates the inherited bid cap", async () => {
    graph.mockResolvedValue({
      account_id: "456",
      objective: "OUTCOME_TRAFFIC",
      daily_budget: "5000",
      bid_strategy: "COST_CAP",
    });
    const change = metaChangeSchema.parse({
      kind: "create_adset",
      name: "CBO child",
      campaignId: "2",
      countries: ["US"],
      placements: "automatic",
    });
    await expect(prepareMetaChange(connection, change)).rejects.toThrow(
      "requires a cost or bid cap"
    );
    const result = await prepareMetaChange(connection, {
      ...change,
      bidAmount: 3.45,
    });
    expect(result.params.bid_amount).toBe("345");
    expect(result.params.daily_budget).toBeUndefined();
    expect(result.params.bid_strategy).toBeUndefined();
    await expect(
      prepareMetaChange(connection, { ...change, dailyBudget: 10 })
    ).rejects.toThrow("campaign owns the budget");
  });
  it("validates lifetime scheduling and preserves exact conversion attribution", async () => {
    const endTime = new Date(Date.now() + 86400000).toISOString();
    const raw = {
      kind: "create_adset",
      name: "Leads",
      campaignId: "2",
      countries: ["US"],
      placements: "automatic",
      lifetimeBudget: 200,
      pixelId: "8",
      conversionEvent: "LEAD",
      attribution: "7d_click_1d_view",
    };
    expect(metaChangeSchema.safeParse(raw).success).toBe(false);
    graph
      .mockResolvedValueOnce({ account_id: "456", objective: "OUTCOME_LEADS" })
      .mockResolvedValueOnce({ data: [{ id: "8" }] });
    const result = await prepareMetaChange(
      connection,
      metaChangeSchema.parse({ ...raw, endTime })
    );
    expect(result.params).toMatchObject({
      status: "PAUSED",
      lifetime_budget: "20000",
      end_time: endTime,
    });
    expect(JSON.parse(result.params.promoted_object)).toEqual({
      pixel_id: "8",
      custom_event_type: "LEAD",
    });
    expect(JSON.parse(result.params.attribution_spec)).toEqual([
      { event_type: "CLICK_THROUGH", window_days: 7 },
      { event_type: "VIEW_THROUGH", window_days: 1 },
    ]);
  });
  it("rejects another account's pixel or audience and incompatible performance goals", async () => {
    const change = metaChangeSchema.parse({
      kind: "create_adset",
      name: "Sales",
      campaignId: "2",
      countries: ["US"],
      placements: "automatic",
      dailyBudget: 25,
      pixelId: "8",
    });
    graph
      .mockResolvedValueOnce({ account_id: "456", objective: "OUTCOME_SALES" })
      .mockResolvedValueOnce({ data: [{ id: "99" }] });
    await expect(prepareMetaChange(connection, change)).rejects.toThrow(
      "pixel is not available"
    );
    graph
      .mockResolvedValueOnce({
        account_id: "456",
        objective: "OUTCOME_TRAFFIC",
      })
      .mockResolvedValueOnce({ data: [{ id: "99" }] });
    await expect(
      prepareMetaChange(connection, {
        ...change,
        pixelId: undefined,
        includedAudiences: ["11"],
      })
    ).rejects.toThrow("audience is not available");
    graph.mockResolvedValueOnce({
      account_id: "456",
      objective: "OUTCOME_SALES",
    });
    await expect(
      prepareMetaChange(connection, { ...change, optimizationGoal: "REACH" })
    ).rejects.toThrow("does not match");
  });
  it("creates all six campaign objectives paused without spending or silently substituting an objective", async () => {
    for (const objective of [
      "OUTCOME_AWARENESS",
      "OUTCOME_TRAFFIC",
      "OUTCOME_ENGAGEMENT",
      "OUTCOME_LEADS",
      "OUTCOME_APP_PROMOTION",
      "OUTCOME_SALES",
    ]) {
      const result = await prepareMetaChange(
        connection,
        metaChangeSchema.parse({
          kind: "create_campaign",
          name: objective,
          objective,
        })
      );
      expect(result.params).toMatchObject({
        objective,
        status: "PAUSED",
        buying_type: "AUCTION",
      });
    }
    graph.mockResolvedValue({
      account_id: "456",
      objective: "OUTCOME_APP_PROMOTION",
    });
    await expect(
      prepareMetaChange(
        connection,
        metaChangeSchema.parse({
          kind: "create_adset",
          name: "App",
          campaignId: "2",
          countries: ["US"],
          placements: "automatic",
        })
      )
    ).rejects.toThrow("dedicated Meta tools");
  });
  it("rejects expired and modified reviews", () => {
    const ticket = signMetaReview({
      expires: Date.now() + 10000,
      name: "approved",
    });
    expect(verifyMetaReview(ticket).name).toBe("approved");
    expect(() => verifyMetaReview("e30." + ticket.split(".")[1])).toThrow(
      "invalid"
    );
    expect(() => verifyMetaReview(signMetaReview({ expires: 1 }))).toThrow(
      "expired"
    );
  });
});
