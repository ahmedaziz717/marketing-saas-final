import { z } from "zod";
import {
  googleAccountSchema,
  googleCustomerIdSchema,
  googleConnectionErrors,
  type GoogleAdsAccount,
} from "../../shared/googleAds";

export const GOOGLE_ADS_SCOPE = "https://www.googleapis.com/auth/adwords";
export const GOOGLE_CALLBACK_PATH = "/api/channels/google/callback";
export class GoogleAdsError extends Error {
  constructor(public readonly reason: string) {
    super(googleConnectionErrors[reason] ?? googleConnectionErrors.connection);
  }
}
export function googleConfig() {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET?.trim();
  const origin = new URL(process.env.APP_ORIGIN || "http://invalid.local");
  if (
    !clientId ||
    !clientSecret ||
    !process.env.INTEGRATION_TOKEN_ENCRYPTION_SECRET ||
    !process.env.APP_ORIGIN ||
    origin.username ||
    origin.password ||
    (origin.protocol !== "https:" &&
      !(
        process.env.NODE_ENV !== "production" &&
        origin.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(origin.hostname)
      ))
  ) {
    throw new GoogleAdsError("connection");
  }
  const version = process.env.GOOGLE_ADS_API_VERSION?.trim() || "v26";
  if (!/^v\d+$/.test(version)) throw new GoogleAdsError("connection");
  return {
    clientId,
    clientSecret,
    version,
    callbackUrl: new URL(GOOGLE_CALLBACK_PATH, origin).toString(),
  };
}
export function googleOAuthConfigured() {
  try {
    googleConfig();
    return true;
  } catch {
    return false;
  }
}
export const googleGrantSchema = z.object({
  provider: z.literal("google_ads"),
  clientId: z.string().min(1),
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAtMs: z.number().finite(),
  refreshExpiresAtMs: z.number().finite().optional(),
  scope: z.string(),
});
export type GoogleGrant = z.infer<typeof googleGrantSchema>;
const tokenResponse = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
  token_type: z.string().optional(),
  refresh_token: z.string().min(1).optional(),
  refresh_token_expires_in: z.number().positive().optional(),
  scope: z.string().optional(),
});

// Fixed Google endpoints, no caller-supplied URLs; never propagate upstream text,
// request bodies, auth codes, or tokens into client errors or server logs.
async function googleJson(url: string, init: RequestInit) {
  try {
    const response = await fetch(url, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    const body = await response.json();
    if (!response.ok) {
      const code =
        typeof body?.error === "string" ? body.error : body?.error?.status;
      const errors =
        body?.error?.details?.flatMap((d: any) => d?.errors ?? []) ?? [];
      const codes: string[] = errors.flatMap((e: any) =>
        Object.values(e?.errorCode ?? {})
      );
      if (code === "invalid_grant" || response.status === 401)
        throw new GoogleAdsError("expired");
      if (
        codes.some(c =>
          [
            "CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION",
            "CLOUD_PROJECT_NOT_REGISTERED",
            "DEVELOPER_TOKEN_NOT_APPROVED",
            "DEVELOPER_TOKEN_PROHIBITED",
            "PROJECT_DISABLED",
          ].includes(c)
        )
      )
        throw new GoogleAdsError("access");
      if (response.status === 429 || code === "RESOURCE_EXHAUSTED")
        throw new GoogleAdsError("quota");
      if (response.status === 403) throw new GoogleAdsError("permission");
      throw new GoogleAdsError("connection");
    }
    return body;
  } catch (error) {
    if (error instanceof GoogleAdsError) throw error;
    throw new GoogleAdsError("connection");
  }
}
async function requestToken(
  values: Record<string, string>,
  prior?: GoogleGrant
) {
  const config = googleConfig();
  if (prior && prior.clientId !== config.clientId)
    throw new GoogleAdsError("expired");
  const parsed = tokenResponse.safeParse(
    await googleJson("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        ...values,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }),
    })
  );
  if (!parsed.success) throw new GoogleAdsError("connection");
  const data = parsed.data;
  const scope = data.scope ?? prior?.scope ?? "";
  if (!scope.split(/\s+/).includes(GOOGLE_ADS_SCOPE))
    throw new GoogleAdsError("scope");
  const refreshToken = data.refresh_token ?? prior?.refreshToken;
  if (!refreshToken) throw new GoogleAdsError("offline");
  if (data.token_type && data.token_type.toLowerCase() !== "bearer")
    throw new GoogleAdsError("connection");
  return googleGrantSchema.parse({
    provider: "google_ads",
    clientId: config.clientId,
    accessToken: data.access_token,
    refreshToken,
    scope,
    expiresAtMs: Date.now() + data.expires_in * 1000,
    refreshExpiresAtMs: data.refresh_token_expires_in
      ? Date.now() + data.refresh_token_expires_in * 1000
      : prior?.refreshExpiresAtMs,
  });
}
export function exchangeGoogleCode(code: string, verifier: string) {
  return requestToken({
    grant_type: "authorization_code",
    code,
    code_verifier: verifier,
    redirect_uri: googleConfig().callbackUrl,
  });
}
export function refreshGoogleGrant(grant: GoogleGrant) {
  if (grant.refreshExpiresAtMs && grant.refreshExpiresAtMs <= Date.now())
    throw new GoogleAdsError("expired");
  return requestToken(
    { grant_type: "refresh_token", refresh_token: grant.refreshToken },
    grant
  );
}

// This transport deliberately permits only account listing and read-only GAQL
// search. Neither a UI caller nor a workflow can send Google mutate/remove calls.
async function adsRead(
  accessToken: string,
  path: string,
  query?: string,
  loginCustomerId?: string,
  pageToken?: string
) {
  const listing = path === "customers:listAccessibleCustomers";
  if (!listing && !/^customers\/\d{10}\/googleAds:search$/.test(path))
    throw new GoogleAdsError("permission");
  if (!listing && (!query || !/^SELECT\s/i.test(query.trim())))
    throw new GoogleAdsError("permission");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
  if (loginCustomerId)
    headers["login-customer-id"] =
      googleCustomerIdSchema.parse(loginCustomerId);
  // Google Cloud project access replaced developer tokens in September 2026.
  return googleJson(
    `https://googleads.googleapis.com/${googleConfig().version}/${path}`,
    {
      method: listing ? "GET" : "POST",
      headers,
      ...(!listing
        ? {
            body: JSON.stringify({
              query,
              ...(pageToken ? { pageToken } : {}),
            }),
          }
        : {}),
    }
  );
}
export async function googleAdsRows(
  accessToken: string,
  customerId: string,
  query: string,
  loginCustomerId?: string
) {
  googleCustomerIdSchema.parse(customerId);
  const results: any[] = [];
  let pageToken: string | undefined;
  const seen = new Set<string>();
  do {
    const page = await adsRead(
      accessToken,
      `customers/${customerId}/googleAds:search`,
      query,
      loginCustomerId,
      pageToken
    );
    if (page.results !== undefined && !Array.isArray(page.results))
      throw new GoogleAdsError("connection");
    results.push(...(page.results ?? []));
    pageToken = page.nextPageToken;
    if (
      pageToken &&
      (typeof pageToken !== "string" || seen.has(pageToken) || seen.size >= 10)
    )
      throw new GoogleAdsError("quota");
    if (pageToken) seen.add(pageToken);
  } while (pageToken);
  return results;
}
export async function discoverGoogleAccounts(accessToken: string) {
  const list = await adsRead(accessToken, "customers:listAccessibleCustomers");
  const resourceNames = z
    .array(z.string().regex(/^customers\/\d{10}$/))
    .safeParse(list.resourceNames ?? []);
  if (!resourceNames.success) throw new GoogleAdsError("connection");
  const roots = Array.from(
    new Set(resourceNames.data.map(n => n.split("/")[1]!))
  );
  if (roots.length > 100) throw new GoogleAdsError("quota");
  const accounts = new Map<string, GoogleAdsAccount>();
  const failures: GoogleAdsError[] = [];
  // Each root query includes all descendants, so nested manager accounts work
  // without requiring direct user membership on the advertising account.
  for (let start = 0; start < roots.length; start += 4) {
    await Promise.all(
      roots.slice(start, start + 4).map(async root => {
        try {
          const rows = await googleAdsRows(
            accessToken,
            root,
            "SELECT customer_client.id, customer_client.manager, customer_client.descriptive_name, customer_client.currency_code, customer_client.time_zone, customer_client.test_account, customer_client.status FROM customer_client WHERE customer_client.status = 'ENABLED'"
          );
          for (const { customerClient: c } of rows) {
            if (!c || c.manager || c.status !== "ENABLED") continue;
            const account = googleAccountSchema.parse({
              id: String(c.id),
              name: c.descriptiveName || `Google Ads ${c.id}`,
              currency: c.currencyCode || "",
              timezone: c.timeZone || "UTC",
              testAccount: c.testAccount === true,
              ...(String(c.id) !== root ? { loginCustomerId: root } : {}),
            });
            const previous = accounts.get(account.id);
            if (!previous || !account.loginCustomerId)
              accounts.set(account.id, account);
          }
        } catch (error) {
          failures.push(
            error instanceof GoogleAdsError
              ? error
              : new GoogleAdsError("connection")
          );
        }
      })
    );
  }
  if (roots.length && failures.length === roots.length) throw failures[0];
  if (accounts.size > 2000) throw new GoogleAdsError("quota");
  return {
    accounts: Array.from(accounts.values()).sort(
      (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
    ),
    warnings: failures.length
      ? [
          `${failures.length} Google account group(s) could not be loaded. If an account is missing, try connecting again.`,
          ...Array.from(new Set(failures.map(e => e.message))),
        ]
      : [],
  };
}
export async function verifyGoogleAccount(
  accessToken: string,
  account: Pick<GoogleAdsAccount, "id" | "loginCustomerId">
) {
  const rows = await googleAdsRows(
    accessToken,
    account.id,
    "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager, customer.test_account, customer.status FROM customer LIMIT 1",
    account.loginCustomerId
  );
  const c = rows[0]?.customer;
  if (!c || String(c.id) !== account.id || c.manager || c.status !== "ENABLED")
    throw new GoogleAdsError("permission");
  return googleAccountSchema.parse({
    id: String(c.id),
    name: c.descriptiveName || `Google Ads ${c.id}`,
    currency: c.currencyCode || "",
    timezone: c.timeZone || "UTC",
    testAccount: c.testAccount === true,
    loginCustomerId: account.loginCustomerId,
  });
}
