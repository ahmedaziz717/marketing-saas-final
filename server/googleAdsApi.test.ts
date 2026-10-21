import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GOOGLE_ADS_SCOPE,
  discoverGoogleAccounts,
  exchangeGoogleCode,
  googleOAuthConfigured,
  refreshGoogleGrant,
  verifyGoogleAccount,
  type GoogleGrant,
} from "./lib/googleAdsApi";

const request = vi.fn();
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
const grant = (): GoogleGrant => ({
  provider: "google_ads",
  clientId: "web-client",
  accessToken: "old-access",
  refreshToken: "private-refresh",
  expiresAtMs: Date.now() - 1,
  scope: GOOGLE_ADS_SCOPE,
});
const customer = (id: string, extra = {}) => ({
  id,
  descriptiveName: `Account ${id}`,
  currencyCode: "USD",
  timeZone: "America/New_York",
  status: "ENABLED",
  manager: false,
  ...extra,
});
beforeEach(() => {
  vi.stubEnv("GOOGLE_ADS_CLIENT_ID", "web-client");
  vi.stubEnv("GOOGLE_ADS_CLIENT_SECRET", "private-client-secret");
  vi.stubEnv("INTEGRATION_TOKEN_ENCRYPTION_SECRET", "test-encryption");
  vi.stubEnv("APP_ORIGIN", "https://app.example.test");
  vi.stubEnv("GOOGLE_ADS_API_VERSION", "v26");
  request.mockReset();
  vi.stubGlobal("fetch", request);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("Google OAuth tokens", () => {
  it("exchanges a code only at Google's endpoint and sends the secret/verifier in the body", async () => {
    request.mockResolvedValue(
      response({
        access_token: "new-access",
        refresh_token: "new-refresh",
        expires_in: 3600,
        scope: GOOGLE_ADS_SCOPE,
        token_type: "Bearer",
        refresh_token_expires_in: 604800,
      })
    );
    const result = await exchangeGoogleCode(
      "one-time-code",
      "private-verifier"
    );
    const [url, init] = request.mock.calls[0];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("error");
    expect(init.body.get("code_verifier")).toBe("private-verifier");
    expect(init.body.get("client_secret")).toBe("private-client-secret");
    expect(init.body.get("redirect_uri")).toBe(
      "https://app.example.test/api/channels/google/callback"
    );
    expect(result.refreshExpiresAtMs).toBeGreaterThan(Date.now());
  });
  it("preserves a refresh token and approved scope when refresh does not repeat them", async () => {
    request.mockResolvedValue(
      response({ access_token: "renewed-access", expires_in: 3600 })
    );
    const result = await refreshGoogleGrant(grant());
    expect(result.refreshToken).toBe("private-refresh");
    expect(result.scope).toBe(GOOGLE_ADS_SCOPE);
    expect(request.mock.calls[0][1].body.get("grant_type")).toBe(
      "refresh_token"
    );
  });
  it("persists rotated refresh tokens", async () => {
    request.mockResolvedValue(
      response({
        access_token: "renewed-access",
        refresh_token: "rotated-refresh",
        expires_in: 3600,
      })
    );
    expect((await refreshGoogleGrant(grant())).refreshToken).toBe(
      "rotated-refresh"
    );
  });
  it("rejects missing Ads scope or ongoing access", async () => {
    request.mockResolvedValueOnce(
      response({
        access_token: "new",
        refresh_token: "refresh",
        expires_in: 3600,
        scope: "openid email",
      })
    );
    await expect(exchangeGoogleCode("code", "verifier")).rejects.toMatchObject({
      reason: "scope",
    });
    request.mockResolvedValueOnce(
      response({
        access_token: "new",
        expires_in: 3600,
        scope: GOOGLE_ADS_SCOPE,
      })
    );
    await expect(exchangeGoogleCode("code", "verifier")).rejects.toMatchObject({
      reason: "offline",
    });
  });
  it("never returns provider error descriptions containing secrets", async () => {
    request.mockResolvedValue(
      response(
        {
          error: "invalid_grant",
          error_description: "private-refresh private-client-secret",
        },
        400
      )
    );
    await expect(refreshGoogleGrant(grant())).rejects.toMatchObject({
      reason: "expired",
    });
    try {
      await refreshGoogleGrant(grant());
    } catch (e) {
      expect(String(e)).not.toContain("private-");
    }
  });
  it("requires secure app config and binds refresh tokens to their original OAuth client", async () => {
    expect(googleOAuthConfigured()).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ORIGIN", "http://app.example.test");
    expect(googleOAuthConfigured()).toBe(false);
    vi.stubEnv("APP_ORIGIN", "https://app.example.test");
    await expect(
      refreshGoogleGrant({ ...grant(), clientId: "different-client" })
    ).rejects.toMatchObject({ reason: "expired" });
    expect(request).not.toHaveBeenCalled();
  });
});
describe("Google Ads discovery and read boundary", () => {
  it("expands manager accounts, follows pages, and prefers a direct account grant", async () => {
    request.mockImplementation(async (url: string, init: RequestInit) => {
      if (url.endsWith("listAccessibleCustomers"))
        return response({
          resourceNames: ["customers/1111111111", "customers/2222222222"],
        });
      const body = JSON.parse(String(init.body));
      if (url.includes("/1111111111/"))
        return body.pageToken
          ? response({ results: [{ customerClient: customer("3333333333") }] })
          : response({
              results: [
                { customerClient: customer("1111111111", { manager: true }) },
                { customerClient: customer("2222222222") },
              ],
              nextPageToken: "next",
            });
      return response({
        results: [{ customerClient: customer("2222222222") }],
      });
    });
    const result = await discoverGoogleAccounts("secret-access");
    expect(result.accounts.map(a => a.id)).toEqual([
      "2222222222",
      "3333333333",
    ]);
    expect(result.accounts[0].loginCustomerId).toBeUndefined();
    expect(result.accounts[1].loginCustomerId).toBe("1111111111");
    expect(result.warnings).toEqual([]);
    for (const [url, init] of request.mock.calls) {
      expect(url).toMatch(
        /^https:\/\/googleads.googleapis.com\/v26\/customers/
      );
      expect(url).not.toMatch(/mutate|remove|secret/);
      expect(init.headers.Authorization).toBe("Bearer secret-access");
      expect(init.headers["developer-token"]).toBeUndefined();
      if (init.body) expect(JSON.parse(init.body).query).toMatch(/^SELECT /);
    }
  });
  it("uses the discovered manager header when verifying the selected account", async () => {
    request.mockResolvedValue(
      response({ results: [{ customer: customer("2222222222") }] })
    );
    await verifyGoogleAccount("access", {
      id: "2222222222",
      loginCustomerId: "1111111111",
    });
    expect(request.mock.calls[0][1].headers["login-customer-id"]).toBe(
      "1111111111"
    );
  });
  it.each([{ manager: true }, { status: "CANCELED" }, { id: "9999999999" }])(
    "does not connect managers, inactive accounts, or mismatched identities: %j",
    async extra => {
      request.mockResolvedValue(
        response({ results: [{ customer: customer("2222222222", extra) }] })
      );
      await expect(
        verifyGoogleAccount("access", { id: "2222222222" })
      ).rejects.toMatchObject({ reason: "permission" });
    }
  );
  it("handles no accessible accounts without fabricating a connection", async () => {
    request.mockResolvedValue(response({}));
    expect(await discoverGoogleAccounts("access")).toEqual({
      accounts: [],
      warnings: [],
    });
  });
  it("shows API access errors rather than presenting a successful empty discovery", async () => {
    request
      .mockResolvedValueOnce(
        response({ resourceNames: ["customers/1111111111"] })
      )
      .mockResolvedValueOnce(
        response(
          {
            error: {
              details: [
                {
                  errors: [
                    {
                      errorCode: {
                        authorizationError:
                          "CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION",
                      },
                    },
                  ],
                },
              ],
            },
          },
          403
        )
      );
    await expect(discoverGoogleAccounts("access")).rejects.toMatchObject({
      reason: "access",
    });
  });
  it("retains accessible accounts and warns about partial discovery failures", async () => {
    request.mockImplementation(async (url: string) =>
      url.endsWith("listAccessibleCustomers")
        ? response({
            resourceNames: ["customers/1111111111", "customers/2222222222"],
          })
        : url.includes("1111111111")
          ? response({ error: { status: "PERMISSION_DENIED" } }, 403)
          : response({ results: [{ customerClient: customer("2222222222") }] })
    );
    const result = await discoverGoogleAccounts("access");
    expect(result.accounts).toHaveLength(1);
    expect(result.warnings.join(" ")).toMatch(/could not be loaded/);
  });
  it("rejects IDs that could inject a different request path", async () => {
    await expect(
      verifyGoogleAccount("access", { id: "../mutate" })
    ).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
});
