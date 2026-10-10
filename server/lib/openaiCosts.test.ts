import { it, expect, vi } from "vitest";
import { fetchOpenAICosts } from "./openaiCosts";
const range = { since: "2026-09-01", until: "2026-09-30" };
const row = (value: number, currency = "usd") => ({
  amount: { value, currency },
  project_id: "proj_test",
  line_item: "image output",
  quantity: 628,
  quantity_unit: "tokens",
});
const page = (rows: any[], more = false, cursor: string | null = null) =>
  new Response(
    JSON.stringify({
      data: [
        {
          start_time: Date.parse("2026-09-01") / 1000,
          end_time: Date.parse("2026-09-02") / 1000,
          results: rows,
        },
      ],
      has_more: more,
      next_page: cursor,
    })
  );
it("fetches every page, preserves adjustments and quantities, and uses inclusive UTC dates", async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce(page([row(0.123456)], true, "next"))
    .mockResolvedValueOnce(page([row(-0.01)]));
  const result = await fetchOpenAICosts(range, "test-secret", request);
  expect(result.amountUsd).toBeCloseTo(0.113456);
  expect(result.rows).toHaveLength(2);
  expect(result.rows[0].quantity).toBe(628);
  const [url, options] = request.mock.calls[0];
  expect(url.origin).toBe("https://api.openai.com");
  expect(url.searchParams.getAll("group_by")).toEqual([
    "project_id",
    "line_item",
  ]);
  expect(url.searchParams.get("end_time")).toBe(
    String(Date.parse("2026-10-01") / 1000)
  );
  expect(request.mock.calls[1][0].searchParams.get("page")).toBe("next");
  expect(options.redirect).toBe("error");
  expect(JSON.stringify(result)).not.toContain("test-secret");
});
it("does not report malformed, partial, or non-USD data as zero costs", async () => {
  await expect(
    fetchOpenAICosts(
      range,
      "key",
      vi.fn().mockResolvedValue(page([row(1, "eur")]))
    )
  ).rejects.toThrow("non-USD");
  await expect(
    fetchOpenAICosts(
      range,
      "key",
      vi.fn().mockResolvedValue(page([row(1)], true))
    )
  ).rejects.toThrow("pagination");
  await expect(
    fetchOpenAICosts(
      range,
      "key",
      vi.fn().mockImplementation(() => page([row(1)], true, "same"))
    )
  ).rejects.toThrow("pagination");
  await expect(
    fetchOpenAICosts(
      range,
      "key",
      vi.fn().mockResolvedValue(new Response("{}"))
    )
  ).rejects.toThrow("unsupported");
});
it("returns safe actionable errors without exposing upstream bodies or secrets", async () => {
  await expect(
    fetchOpenAICosts(
      range,
      "test-secret",
      vi.fn().mockResolvedValue(new Response("test-secret", { status: 403 }))
    )
  ).rejects.toThrow("denied billing access");
  await expect(fetchOpenAICosts(range, "", vi.fn())).rejects.toThrow(
    "OPENAI_ADMIN_KEY"
  );
  await expect(
    fetchOpenAICosts(
      range,
      "key",
      vi.fn().mockRejectedValue(new Error("Authorization: secret"))
    )
  ).rejects.toThrow("could not be reached");
});
it("distinguishes a successful empty bill from a failed request", async () => {
  const result = await fetchOpenAICosts(
    range,
    "key",
    vi.fn().mockResolvedValue(page([]))
  );
  expect(result.amountUsd).toBe(0);
  expect(result.rows).toEqual([]);
});
