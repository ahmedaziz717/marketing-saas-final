import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cancelHiggsfield,
  downloadVideo,
  HiggsfieldError,
  pollHiggsfield,
  providerUrls,
  requestUrl,
  submitHiggsfield,
  videoProviderFailureMessage,
} from "./lib/higgsfield";
const request = vi.fn();
const id = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  vi.stubEnv("HF_API_KEY", "test-id:test-secret");
  vi.stubGlobal("fetch", request);
  request.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("distinguishes provider balance failures from customer credit balances", () => {
  const message = videoProviderFailureMessage({
    request_id: id,
    status: "failed",
    error:
      "Your credit balance is too low to complete this request. Please top up your balance and try again.",
  });
  expect(message).toContain("provider's API balance");
  expect(message).toContain("administrator");
  expect(message).toContain("EvokeLoop AI credits have been refunded");
});
it("retains the documented failure reason while redacting signed references and credentials", async () => {
  request.mockResolvedValue(
    new Response(
      JSON.stringify({
        request_id: id,
        status: "failed",
        error:
          "Image too small: https://storage.test/image?token=private Key secret-id:secret-value",
      })
    )
  );
  const result = await pollHiggsfield(
    id,
    `https://api.higgsfield.ai/requests/${id}/status`
  );
  expect(result.error).toContain("Image too small");
  const message = videoProviderFailureMessage(result);
  expect(message).toContain("Image too small");
  expect(message).toContain("AI credits refunded");
  expect(message).not.toContain("private");
  expect(message).not.toContain("secret-value");
  expect(
    videoProviderFailureMessage({
      request_id: id,
      status: "failed",
      error: null,
    })
  ).toContain("without a detailed reason");
});
it("submits a keyed, idempotent JSON request to the documented endpoint", async () => {
  request.mockResolvedValue(
    new Response(JSON.stringify({ request_id: id, status: "queued" }), {
      status: 200,
    })
  );
  await submitHiggsfield(
    "bytedance/seedance-2.5/text-to-video",
    { prompt: "A product orbit", duration: 5 },
    id
  );
  const [url, options] = request.mock.calls[0];
  expect(url).toBe(
    "https://api.higgsfield.ai/bytedance/seedance-2.5/text-to-video"
  );
  expect(options.headers.Authorization).toBe("Key test-id:test-secret");
  expect(options.headers["Idempotency-Key"]).toBe(id);
  expect(options.redirect).toBe("error");
  expect(JSON.parse(options.body)).toEqual({
    prompt: "A product orbit",
    duration: 5,
  });
});
it("does not mistake a lost response or idempotency mismatch for a refundable failure", async () => {
  request.mockRejectedValueOnce(new Error("Network reset"));
  await expect(
    submitHiggsfield("bytedance/seedance-2.5/text-to-video", {}, id)
  ).rejects.toMatchObject({ ambiguous: true });
  request.mockResolvedValueOnce(
    new Response(JSON.stringify({ error: "Idempotency key mismatch" }), {
      status: 422,
    })
  );
  await expect(
    submitHiggsfield("bytedance/seedance-2.5/text-to-video", {}, id)
  ).rejects.toMatchObject({ ambiguous: true });
  request.mockResolvedValueOnce(
    new Response(JSON.stringify({ error: "Invalid duration" }), { status: 422 })
  );
  await expect(
    submitHiggsfield("bytedance/seedance-2.5/text-to-video", {}, id)
  ).rejects.toMatchObject({ ambiguous: false });
});
it("accepts empty 202 cancellation acknowledgments but rejects another job’s status", async () => {
  request.mockResolvedValueOnce(new Response(null, { status: 202 }));
  await expect(
    cancelHiggsfield(id, `https://api.higgsfield.ai/requests/${id}/cancel`)
  ).resolves.toBeUndefined();
  request.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        request_id: "another-request",
        status: "completed",
        video: { url: "https://cdn.example.test/video.mp4" },
      })
    )
  );
  await expect(
    pollHiggsfield(id, `https://api.higgsfield.ai/requests/${id}/status`)
  ).rejects.toBeInstanceOf(HiggsfieldError);
});
it("blocks unsupported endpoints and private result downloads before external IO", async () => {
  await expect(
    submitHiggsfield("https://evil.example", {}, id)
  ).rejects.toThrow("Unsupported");
  await expect(downloadVideo("http://example.test/video.mp4")).rejects.toThrow(
    "not supported"
  );
  await expect(downloadVideo("https://127.0.0.1/video.mp4")).rejects.toThrow(
    "private"
  );
  expect(request).not.toHaveBeenCalled();
});
it("tracks a provider request on the documented API without forwarding credentials to response-link hosts", async () => {
  const urls = providerUrls({
    request_id: id,
    status: "queued",
    status_url: `https://different-host.example/requests/${id}/status`,
    cancel_url: `https://different-host.example/requests/${id}/cancel`,
  });
  expect(urls.providerStatusUrl).toBe(
    `https://api.higgsfield.ai/requests/${id}/status`
  );
  expect(urls.providerCancelUrl).toBe(
    `https://api.higgsfield.ai/requests/${id}/cancel`
  );
  request.mockResolvedValue(
    new Response(JSON.stringify({ request_id: id, status: "queued" }))
  );
  await pollHiggsfield(id, urls.providerStatusUrl);
  expect(request.mock.calls[0][0]).toBe(urls.providerStatusUrl);
  expect(request.mock.calls[0][1].redirect).toBe("error");
  for (const url of [
    `http://api.higgsfield.ai.evil.test/requests/${id}/status`,
    `https://evil.test/requests/${id}/status`,
    `http://api.higgsfield.ai:8080/requests/${id}/status`,
    `http://user:secret@api.higgsfield.ai/requests/${id}/status`,
    `http://api.higgsfield.ai/requests/another/status`,
    `http://api.higgsfield.ai/requests/${id}/status?secret=1`,
  ])
    expect(() => requestUrl(url, id, "status")).toThrow();
  expect(request).toHaveBeenCalledTimes(1);
});

it("prices the exact request through the authenticated estimate endpoint, not the provider credit count", async () => {
  const { estimateHiggsfield } = await import("./lib/higgsfield");
  const { providerRequestRate } = await import("./lib/providerQuote");
  const { estimatedActionCredits } = await import("../shared/aiCredits");
  const endpoint = "bytedance/seedance-2.5/reference-to-video";
  const body = {
    prompt: "Product closeup",
    duration: 7,
    resolution: "720p",
    generate_audio: false,
    image_urls: [
      "https://stored.example/a.png",
      "https://stored.example/b.png",
    ],
  };
  request.mockResolvedValueOnce(
    new Response(JSON.stringify({ credits: "999.000", usd: "0.423" }))
  );
  const base = {
    provider: "higgsfield",
    model: endpoint,
    kind: "video" as const,
    billingMode: "cost" as const,
    credits: 0,
    inputPerMillion: null,
    cachedInputPerMillion: null,
    outputPerMillion: 999,
    perRequestUsd: null,
    markupPercent: 100,
    creditValueMicros: 10000,
    note: "Test",
  };
  const rate = await providerRequestRate(base, endpoint, body);
  expect(rate.estimatedCostMicros).toBe(423000);
  expect(estimatedActionCredits(rate)).toBe(85);
  expect(rate.costBasis).toBe("provider_account_estimate");
  const [url, options] = request.mock.calls[0];
  expect(url).toBe(`https://api.higgsfield.ai/estimate/${endpoint}`);
  expect(options.headers.Authorization).toBe("Key test-id:test-secret");
  expect(JSON.parse(options.body)).toEqual(body);
  expect(options.redirect).toBe("error");
  request.mockResolvedValueOnce(new Response(JSON.stringify({ usd: "1.372" })));
  expect(
    (
      await estimateHiggsfield(endpoint, {
        ...body,
        duration: 12,
        generate_audio: true,
      })
    ).costMicros
  ).toBe(1372000);
  expect(JSON.parse(request.mock.calls[1][1].body)).toMatchObject({
    duration: 12,
    generate_audio: true,
  });
});

it.each([
  { credits: "100" },
  { usd: "garbage" },
  { usd: -1 },
  { usd: "Infinity" },
  { usd: null },
])(
  "rejects malformed account estimates without a catalog-price fallback: %j",
  async response => {
    const { estimateHiggsfield } = await import("./lib/higgsfield");
    request.mockResolvedValue(new Response(JSON.stringify(response)));
    await expect(
      estimateHiggsfield("bytedance/seedance-2.5/text-to-video", {
        prompt: "test",
      })
    ).rejects.toThrow("No generation was submitted");
    expect(request).toHaveBeenCalledTimes(1);
  }
);

it("does not send credentials to an unsupported estimate route", async () => {
  const { estimateHiggsfield } = await import("./lib/higgsfield");
  await expect(
    estimateHiggsfield("https://outside.example/estimate", {})
  ).rejects.toThrow("Unsupported");
  expect(request).not.toHaveBeenCalled();
});
