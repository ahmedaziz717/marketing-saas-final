import { createHmac } from "node:crypto";
export const GRAPH_VERSION = "v26.0";
export class ChannelGraphError extends Error {
  constructor(
    message: string,
    public definitive: boolean,
    public code?: number
  ) {
    super(message);
    this.name = "ChannelGraphError";
  }
}
export function remoteId(value: string) {
  if (!/^(?:act_)?[0-9]+(?:_[0-9]+)?$/.test(value))
    throw new Error("Invalid Meta object ID.");
  return value;
}
export function redactProviderMessage(value: string, token: string) {
  let safe = value
    .replace(
      /(?:access_token|client_secret|input_token)=[^&\s]+/gi,
      "[redacted]"
    )
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
  for (const secret of [token, process.env.META_APP_SECRET])
    if (secret) safe = safe.split(secret).join("[redacted]");
  return safe.slice(0, 500);
}
export async function graphRequest<T = Record<string, any>>(
  path: string,
  token: string,
  params: Record<string, string> = {},
  body?: URLSearchParams | FormData,
  video = false
): Promise<T> {
  if (!/^[A-Za-z0-9_/-]+$/.test(path) || path.includes(".."))
    throw new Error("Invalid Meta API path.");
  const url = new URL(
    `https://${video ? "graph-video" : "graph"}.facebook.com/${GRAPH_VERSION}/${path}`
  );
  Object.entries(params).forEach(([key, value]) =>
    url.searchParams.set(key, value)
  );
  if (token && process.env.META_APP_SECRET)
    url.searchParams.set(
      "appsecret_proof",
      createHmac("sha256", process.env.META_APP_SECRET)
        .update(token)
        .digest("hex")
    );
  let response: Response;
  try {
    response = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body,
      signal: AbortSignal.timeout(video ? 120000 : 20000),
      redirect: "error",
    });
  } catch {
    throw new ChannelGraphError(
      "Meta did not confirm the request. Check the connection and delivery status before retrying.",
      false
    );
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || !data || data.error || data.success === false) {
    const text =
      typeof data?.error?.message === "string"
        ? data.error.message
        : `Meta returned an unsuccessful response (HTTP ${response.status}).`;
    throw new ChannelGraphError(
      Object.entries(params)
        .filter(([key]) =>
          [
            "input_token",
            "fb_exchange_token",
            "client_secret",
            "code",
          ].includes(key)
        )
        .reduce(
          (message, [, secret]) =>
            secret ? message.split(secret).join("[redacted]") : message,
          redactProviderMessage(text, token)
        ),
      !!data?.error &&
        response.status < 500 &&
        ![1, 2].includes(data.error.code),
      Number(data?.error?.code) || undefined
    );
  }
  return data as T;
}
export const graphPost = (
  path: string,
  token: string,
  fields: Record<string, string>
) => graphRequest(path, token, {}, new URLSearchParams(fields));
export async function graphCollection<T = Record<string, any>>(
  path: string,
  token: string,
  params: Record<string, string> = {},
  maxPages = 5
) {
  const data: T[] = [];
  let after: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const result = await graphRequest<{
      data?: T[];
      paging?: { next?: string; cursors?: { after?: string } };
    }>(path, token, { limit: "100", ...params, ...(after ? { after } : {}) });
    if (!Array.isArray(result.data))
      throw new ChannelGraphError(
        "Meta returned an unexpected collection.",
        true
      );
    data.push(...result.data);
    if (!result.paging?.next || !result.paging.cursors?.after)
      return { data, truncated: !!result.paging?.next };
    if (after === result.paging.cursors.after) return { data, truncated: true };
    // Never follow a provider URL: paging URLs may include tokens.
    after = result.paging.cursors.after;
  }
  return { data, truncated: true };
}
export type MetaPage = {
  id: string;
  name: string;
  access_token?: string;
  tasks?: string[];
};
export type MetaAccount = {
  id: string;
  account_id: string;
  name: string;
  currency?: string;
  timezone_name?: string;
  account_status?: number;
};
export async function discoverMeta(
  token: string,
  purpose: "facebook" | "meta_ads"
) {
  const identity = await graphRequest<{ id: string; name?: string }>(
    "me",
    token,
    { fields: "id,name" }
  );
  const permissions = await graphCollection<{
    permission: string;
    status: string;
  }>("me/permissions", token);
  const granted = permissions.data
    .filter(p => p.status === "granted")
    .map(p => p.permission);
  const pages = await graphCollection<MetaPage>("me/accounts", token, {
    fields: "id,name,access_token,tasks",
  });
  const accounts =
    purpose === "meta_ads"
      ? await graphCollection<MetaAccount>("me/adaccounts", token, {
          fields: "id,account_id,name,currency,timezone_name,account_status",
        })
      : { data: [] as MetaAccount[], truncated: false };
  let expiresAtMs: number | null = null;
  const warnings: string[] = [];
  if (process.env.META_APP_ID && process.env.META_APP_SECRET) {
    const debug = await graphRequest<{
      data?: {
        is_valid?: boolean;
        app_id?: string;
        expires_at?: number;
        data_access_expires_at?: number;
      };
    }>(
      "debug_token",
      `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`,
      { input_token: token }
    );
    if (!debug.data?.is_valid || debug.data.app_id !== process.env.META_APP_ID)
      throw new Error(
        "Use a valid user token issued for this Meta application."
      );
    const times = [
      debug.data.expires_at,
      debug.data.data_access_expires_at,
    ].filter((n): n is number => typeof n === "number" && n > 0);
    expiresAtMs = times.length ? Math.min(...times) * 1000 : null;
  } else
    warnings.push(
      "Token expiry could not be inspected. Revalidate the connection regularly."
    );
  if (pages.truncated || accounts.truncated || permissions.truncated)
    warnings.push(
      "The asset list was truncated. Reconnect with fewer assets if the destination is missing."
    );
  return {
    identity,
    granted,
    pages: pages.data,
    accounts: accounts.data,
    warnings,
    expiresAtMs,
  };
}
export function safeDiscovery(d: Awaited<ReturnType<typeof discoverMeta>>) {
  return {
    identityName: d.identity.name ?? "Meta user",
    permissions: d.granted,
    pages: d.pages.map(p => ({ id: p.id, name: p.name })),
    accounts: d.accounts.map(a => ({
      id: a.account_id || a.id.replace(/^act_/, ""),
      name: a.name,
      currency: a.currency,
      status: a.account_status,
    })),
    warnings: d.warnings,
  };
}
