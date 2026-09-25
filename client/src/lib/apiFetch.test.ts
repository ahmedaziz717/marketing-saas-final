import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./apiFetch";

afterEach(() => vi.unstubAllGlobals());

describe("API responses during a server interruption", () => {
  it.each([200, 502, 503])("reports HTML with status %s without parsing it or replaying the mutation", async status => {
    const fetch = vi.fn().mockResolvedValue(new Response("<!DOCTYPE html><title>Application loading</title>", {
      status, headers: { "content-type": "text/html; charset=utf-8" },
    }));
    vi.stubGlobal("fetch", fetch);
    await expect(apiFetch("/api/trpc/crawl.processBatch", { method: "POST", body: "{}" }))
      .rejects.toThrow("The server is temporarily unavailable");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("/api/trpc/crawl.processBatch", expect.objectContaining({ credentials: "include", method: "POST" }));
  });

  it("preserves normal JSON responses, including authentication errors", async () => {
    const response = new Response(JSON.stringify({ error: { message: "Please sign in" } }), {
      status: 401, headers: { "content-type": "application/json; charset=utf-8" },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    const result = await apiFetch("/api/trpc/auth.me");
    expect(result).toBe(response);
    expect(result.status).toBe(401);
    expect(await result.json()).toEqual({ error: { message: "Please sign in" } });
  });
});
