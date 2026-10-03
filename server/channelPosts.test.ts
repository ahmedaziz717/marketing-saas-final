import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("./lib/channelConnections", () => ({
  connectionToken: () => "test-token",
}));
import { facebookPosts } from "./lib/channelReports";
const connection = { accountId: "123" } as Parameters<typeof facebookPosts>[0];
const range = { since: "2026-09-01", until: "2026-09-28" };
afterEach(() => vi.unstubAllGlobals());
describe("Facebook post permission fallback", () => {
  it("keeps posts and images when engagement fields are denied; counts remain unavailable", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { error: { code: 10, message: "Requires pages_read_user_content" } },
          { status: 403 }
        )
      )
      .mockResolvedValueOnce(
        Response.json({
          data: [
            {
              id: "123_456",
              message: "Test",
              full_picture: "https://example.test/photo.jpg",
            },
          ],
        })
      );
    vi.stubGlobal("fetch", fetcher);
    const result = await facebookPosts(connection, range);
    expect(result.engagementUnavailable).toBe(true);
    expect(result.data[0]).toMatchObject({
      message: "Test",
      image: "https://example.test/photo.jpg",
      reactions: null,
      comments: null,
      shares: null,
    });
    const retry = new URL(String(fetcher.mock.calls[1][0]));
    expect(retry.searchParams.get("fields")).toBe(
      "id,message,created_time,permalink_url,full_picture"
    );
    expect(retry.searchParams.get("since")).toBe("2026-09-01T00:00:00Z");
  });
  it("preserves successful engagement counts", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({
            data: [
              {
                id: "123_456",
                reactions: { summary: { total_count: 2 } },
                comments: { summary: { total_count: 0 } },
                shares: { count: 1 },
              },
            ],
          })
        )
    );
    const result = await facebookPosts(connection, range);
    expect(result.engagementUnavailable).toBe(false);
    expect(result.data[0]).toMatchObject({
      reactions: 2,
      comments: 0,
      shares: 1,
    });
  });
  it("does not retry expired tokens or unrelated failures", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { error: { code: 190, message: "Expired token" } },
          { status: 400 }
        )
      );
    vi.stubGlobal("fetch", fetcher);
    await expect(facebookPosts(connection, range)).rejects.toThrow(
      "Expired token"
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not conceal a permission failure on basic post fields", async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(async () =>
        Response.json(
          { error: { code: 10, message: "Requires pages_read_user_content" } },
          { status: 403 }
        )
      );
    vi.stubGlobal("fetch", fetcher);
    await expect(facebookPosts(connection, range)).rejects.toThrow(
      "pages_read_user_content"
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
