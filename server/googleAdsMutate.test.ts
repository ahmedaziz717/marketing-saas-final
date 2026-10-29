import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mutateGoogleAds } from "./lib/googleAdsMutate";
const request = vi.fn();
const operations = [
  {
    campaignOperation: {
      update: {
        resourceName: "customers/2222222222/campaigns/1",
        status: "PAUSED",
      },
      updateMask: "status",
    },
  },
];
beforeEach(() => {
  vi.stubEnv("GOOGLE_ADS_CLIENT_ID", "fixture-client");
  vi.stubEnv("GOOGLE_ADS_CLIENT_SECRET", "fixture-secret");
  vi.stubEnv("INTEGRATION_TOKEN_ENCRYPTION_SECRET", "fixture-key");
  vi.stubEnv("APP_ORIGIN", "https://app.example.test");
  vi.stubGlobal("fetch", request);
  request.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("validates without partial writes and restricts receipts to this account", async () => {
  request.mockResolvedValueOnce(Response.json({}));
  expect(
    await mutateGoogleAds("token", "2222222222", operations, true, "1111111111")
  ).toEqual({ resources: [] });
  const [url, init] = request.mock.calls[0];
  expect(url).toMatch(
    /^https:\/\/googleads.googleapis.com\/v\d+\/customers\/2222222222\/googleAds:mutate$/
  );
  expect(init.headers["login-customer-id"]).toBe("1111111111");
  expect(JSON.parse(init.body)).toMatchObject({
    validateOnly: true,
    partialFailure: false,
    responseContentType: "RESOURCE_NAME_ONLY",
  });
  request.mockResolvedValueOnce(
    Response.json({
      mutateOperationResponses: [
        {
          campaignResult: { resourceName: "customers/9999999999/campaigns/1" },
        },
      ],
    })
  );
  await expect(
    mutateGoogleAds("token", "2222222222", operations, false)
  ).rejects.toMatchObject({ uncertain: true });
});
it("never retries an ambiguous publication and redacts raw provider messages", async () => {
  request.mockRejectedValueOnce(new Error("secret-network-url"));
  await expect(
    mutateGoogleAds("token", "2222222222", operations, false)
  ).rejects.toMatchObject({ uncertain: true });
  expect(request).toHaveBeenCalledTimes(1);
  request.mockResolvedValueOnce(
    Response.json(
      {
        error: {
          message: "secret-token",
          details: [
            {
              errors: [
                {
                  message: "secret-token",
                  errorCode: { campaignError: "INVALID_CAMPAIGN_NAME" },
                },
              ],
            },
          ],
        },
      },
      { status: 400 }
    )
  );
  await expect(
    mutateGoogleAds("token", "2222222222", operations, true)
  ).rejects.toMatchObject({
    message: "Google validation failed: INVALID_CAMPAIGN_NAME.",
    uncertain: false,
  });
});

it("reports mutation failures as safe validation diagnostics, not OAuth connection failures", async () => {
  request.mockResolvedValueOnce(
    Response.json(
      {
        partialFailureError: {
          message: "private payload",
          details: [
            {
              errors: [
                {
                  errorCode: { assetError: "ASPECT_RATIO_NOT_ALLOWED" },
                  message: "private image URL",
                  trigger: "private-token",
                },
              ],
            },
          ],
        },
      },
      { headers: { "request-id": "fixture-request" } }
    )
  );
  await expect(
    mutateGoogleAds("token", "2222222222", operations, true)
  ).rejects.toMatchObject({
    message:
      "Google validation failed: ASPECT_RATIO_NOT_ALLOWED. Request ID: fixture-request.",
    uncertain: false,
  });
  expect(request).toHaveBeenCalledTimes(1);
});
