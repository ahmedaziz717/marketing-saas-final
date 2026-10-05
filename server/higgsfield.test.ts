import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cancelHiggsfield,
  downloadVideo,
  HiggsfieldError,
  pollHiggsfield,
  providerUrls,
  requestUrl,
  submitHiggsfield,
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
it("upgrades API response links to HTTPS while preserving the request and security boundaries", async () => {
  const urls = providerUrls({
    request_id: id,
    status: "queued",
    status_url: `http://api.higgsfield.ai/requests/${id}/status`,
    cancel_url: `http://api.higgsfield.ai/requests/${id}/cancel`,
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
