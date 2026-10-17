/** Keep proxy/loading HTML out of tRPC's JSON parser. Never replay mutations. */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await globalThis.fetch(input, { ...init, credentials: "include" });
  const contentType = response.headers.get("content-type") ?? "";
  if (!/\bapplication\/(?:[\w.-]+\+)?json\b/i.test(contentType)) {
    await response.body?.cancel().catch(() => {});
    throw new Error("The server is temporarily unavailable. Please wait a moment and try again.");
  }
  return response;
}
