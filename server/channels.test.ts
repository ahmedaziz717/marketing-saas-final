import { afterEach, describe, expect, it, vi } from "vitest";
import {
  actionValue,
  dateInZone,
  localScheduleToUtc,
  planSchema,
  previousRange,
  publicationDraftSchema,
  rangeSchema,
  weekStart,
} from "../shared/channels";
import { adMetrics } from "./lib/channelReports";
import {
  ChannelGraphError,
  graphCollection,
  graphPost,
  redactProviderMessage,
} from "./lib/channelGraph";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("channel dates, metrics and provider boundary", () => {
  it("supports arbitrary future weeks, leap dates and non-hour timezone offsets", () => {
    expect(
      dateInZone(
        localScheduleToUtc("2028-02-29T10:00", "Asia/Kolkata"),
        "Asia/Kolkata"
      )
    ).toBe("2028-02-29T10:00");
    expect(weekStart("2026-09-20")).toBe("2026-09-14");
    expect(localScheduleToUtc("2026-09-22T10:00", "America/New_York")).toBe(
      Date.parse("2026-09-22T14:00:00Z")
    );
  });
  it("rejects nonexistent or ambiguous DST times instead of silently choosing an hour", () => {
    expect(() =>
      localScheduleToUtc("2027-03-14T02:30", "America/New_York")
    ).toThrow("does not exist");
    expect(() =>
      localScheduleToUtc("2026-11-01T01:30", "America/New_York")
    ).toThrow("occurs twice");
    expect(() => localScheduleToUtc("2027-02-29T10:00", "UTC")).toThrow(
      "valid"
    );
  });
  it("validates full calendar dates and equal previous periods", () => {
    expect(
      rangeSchema.safeParse({ since: "2026-02-30", until: "2026-03-02" })
        .success
    ).toBe(false);
    expect(
      rangeSchema.safeParse({ since: "2026-01-01", until: "2027-01-01" })
        .success
    ).toBe(false);
    expect(previousRange({ since: "2026-09-01", until: "2026-09-07" })).toEqual(
      { since: "2026-08-25", until: "2026-08-31" }
    );
  });
  it("rejects duplicate planning slots", () => {
    expect(
      planSchema.safeParse({
        organizationId: 1,
        channel: "facebook",
        timezone: "UTC",
        postsPerWeek: 2,
        slots: [
          { day: 2, time: "10:00" },
          { day: 2, time: "10:00" },
        ],
      }).success
    ).toBe(false);
  });
  it("does not double count purchase aliases or turn unavailable metrics into zeros", () => {
    expect(
      actionValue(
        [
          { action_type: "purchase", value: "8" },
          { action_type: "omni_purchase", value: "8" },
        ],
        ["omni_purchase", "purchase"]
      )
    ).toBe(8);
    expect(adMetrics({})).toMatchObject({
      spend: null,
      purchases: null,
      roas: null,
    });
    expect(
      adMetrics({
        spend: "20",
        actions: [{ action_type: "purchase", value: "2" }],
        action_values: [{ action_type: "purchase", value: "100" }],
      })
    ).toMatchObject({ purchases: 2, roas: 5 });
    expect(
      adMetrics({ spend: "0", actions: [], action_values: [] }).roas
    ).toBeNull();
  });
  it("rejects javascript destinations and unknown channels", () => {
    const draft = {
      organizationId: 1,
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      revision: 0,
      channel: "facebook",
      connectionId: null,
      assetKey: null,
      scheduledAtMs: null,
      timezone: "UTC",
      content: { title: "Post", link: "javascript:alert(1)" },
    };
    expect(publicationDraftSchema.safeParse(draft).success).toBe(false);
    expect(
      publicationDraftSchema.safeParse({
        ...draft,
        channel: "tiktok",
        content: { title: "Post" },
      }).success
    ).toBe(false);
  });
  it("redacts credentials from provider errors", () => {
    vi.stubEnv("META_APP_SECRET", "app-secret-example");
    expect(
      redactProviderMessage(
        "token-example app-secret-example Bearer abc access_token=xyz",
        "token-example"
      )
    ).not.toMatch(/token-example|app-secret-example|Bearer abc|xyz/);
  });
  it("does not follow provider paging links to arbitrary hosts or expose tokens in URLs", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ id: 1 }],
            paging: {
              next: "https://attacker.example?access_token=secret",
              cursors: { after: "cursor" },
            },
          })
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ id: 2 }] }))
      );
    vi.stubGlobal("fetch", fetch);
    const result = await graphCollection("123/feed", "secret");
    expect(result.data).toHaveLength(2);
    expect(result.truncated).toBe(false);
    for (const [url, options] of fetch.mock.calls) {
      expect(url.hostname).toBe("graph.facebook.com");
      expect(url.searchParams.has("access_token")).toBe(false);
      expect(options.headers.Authorization).toBe("Bearer secret");
    }
    expect(fetch.mock.calls[1][0].searchParams.get("after")).toBe("cursor");
  });
  it("marks network or malformed final responses uncertain, not safe to retry blindly", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("connection lost"))
    );
    await expect(
      graphPost("123/feed", "secret", { message: "test" })
    ).rejects.toMatchObject({ definitive: false });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("<html>proxy failure</html>", { status: 502 })
        )
    );
    await expect(graphPost("123/feed", "secret", {})).rejects.toMatchObject({
      definitive: false,
    });
  });
});
