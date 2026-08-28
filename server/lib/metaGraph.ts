const GRAPH_VERSION = "v26.0";
const GRAPH_ROOT = `https://graph.facebook.com/${GRAPH_VERSION}`;

async function parseGraphResponse(response: Response) {
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || data.error) {
    const error = data.error as { message?: string; code?: number; error_subcode?: number } | undefined;
    throw new Error(error?.message || `Meta request failed with HTTP ${response.status}`);
  }
  return data;
}

export async function validateMetaToken(accessToken: string) {
  const url = new URL(`${GRAPH_ROOT}/me`);
  url.searchParams.set("fields", "id,name");
  url.searchParams.set("access_token", accessToken);
  return parseGraphResponse(await fetch(url)) as Promise<{ id: string; name?: string }>;
}

export async function postMeta(path: string, accessToken: string, fields: Record<string, string>) {
  const body = new URLSearchParams({ ...fields, access_token: accessToken });
  return parseGraphResponse(await fetch(`${GRAPH_ROOT}/${path.replace(/^\//, "")}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  }));
}

export function extractUploadedImageHash(response: Record<string, unknown>) {
  const images = response.images as Record<string, { hash?: string }> | undefined;
  const first = images ? Object.values(images)[0] : undefined;
  if (!first?.hash) throw new Error("Meta did not return an uploaded image hash");
  return first.hash;
}
