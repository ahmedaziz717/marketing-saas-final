import { beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import { assetFit, assetFormat } from "../shared/assetFit";
import { metaLinkData } from "../shared/metaCreative";
import { contentSchema } from "../shared/channels";
import { metaChangeSchema } from "../shared/metaManagement";
const graph = vi.hoisted(() => vi.fn());
vi.mock("./lib/channelGraph", () => ({
  graphRequest: graph,
  graphPost: vi.fn(),
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
