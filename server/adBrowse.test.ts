import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("./lib/channelConnections", () => ({ connectionToken: () => "test-token" }));
import { advertisingObjects } from "./lib/channelReports";
const connection = { accountId: "123", details: {} } as Parameters<typeof advertisingObjects>[0];
afterEach(() => vi.unstubAllGlobals());
describe("Meta ad browsing filters", () => {
  it("filters status before pagination and retains inherited paused items", async () => {
    const fetcher = vi.fn(async (url: string) => {
      const u = new URL(url);
      const isAd = u.pathname.endsWith("/ads");
      return Response.json({ data: [{ id: "1", effective_status: isAd ? "ADSET_PAUSED" : "PAUSED" }, { id: "2", effective_status: "ACTIVE" }] });
    });
    vi.stubGlobal("fetch", fetcher);
    const r = await advertisingObjects(connection, { status: "paused" });
    expect(r.ads.map(r => r.id)).toEqual(["1"]);
    expect(r.campaigns.map(r => r.id)).toEqual(["1"]);
    for (const [url] of fetcher.mock.calls) expect(JSON.parse(new URL(url).searchParams.get("effective_status")!)).toContain("PAUSED");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("uses period delivery instead of creation date at each level and reports partial results", async () => {
    const range = { since: "2026-01-01", until: "2026-09-28" };
    const fetcher = vi.fn(async (url: string) => {
      const u = new URL(url);
      if (u.pathname.endsWith("/insights")) {
        expect(JSON.parse(u.searchParams.get("time_range")!)).toEqual(range);
        const id = u.searchParams.get("level") + "_id";
        return Response.json({ data: [{ [id]: "old", impressions: "42" }, { [id]: "new", impressions: "0" }], paging: { next: "unused-no-cursor" } });
      }
      return Response.json({ data: [{ id: "old", effective_status: "ACTIVE", created_time: "2020-01-01" }, { id: "new", effective_status: "ACTIVE" }] });
    });
    vi.stubGlobal("fetch", fetcher);
    const r = await advertisingObjects(connection, { status: "active", range });
    for (const rows of [r.campaigns, r.adsets, r.ads]) expect(rows.map(r => r.id)).toEqual(["old"]);
    expect(r.truncated).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(6);
  });
  it("preserves unfiltered publishing lookups when filters are omitted", async () => {
    const fetcher = vi.fn(async (url: string) => {
      expect(new URL(url).searchParams.has("effective_status")).toBe(false);
      return Response.json({ data: [{ id: "1", effective_status: "PAUSED" }] });
    });
    vi.stubGlobal("fetch", fetcher);
    const r = await advertisingObjects(connection);
    expect(r.adsets).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
