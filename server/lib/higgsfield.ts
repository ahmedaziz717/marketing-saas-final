import https from "node:https";
import { z } from "zod";
import { assertPublicUrl } from "./websiteCrawler";

const API = "https://api.higgsfield.ai";
export function higgsfieldConfigured() {
  return !!credential() && process.env.VIDEO_GENERATION_ENABLED !== "false";
}
function credential() {
  return (process.env.HF_API_KEY || process.env.HF_CREDENTIALS || "")
    .trim()
    .replace(/^Key\s+/, "");
}
export class HiggsfieldError extends Error {
  constructor(
    public status: number,
    public ambiguous: boolean,
    message: string
  ) {
    super(message);
  }
}
const idPattern = /^[a-zA-Z0-9_-]{1,100}$/;
export function requestUrl(
  url: string,
  id: string,
  action: "status" | "cancel"
) {
  if (!idPattern.test(id)) throw new Error("Invalid generation request ID");
  const parsed = new URL(url);
  if (
    parsed.origin !== API ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== `/requests/${id}/${action}`
  )
    throw new Error("Invalid generation status URL");
  return parsed.toString();
}
const resultSchema = z.object({
  request_id: z.string().regex(idPattern),
  status: z.enum([
    "queued",
    "in_progress",
    "completed",
    "failed",
    "nsfw",
    "canceled",
  ]),
  status_url: z.string().optional(),
  cancel_url: z.string().optional(),
  video: z.object({ url: z.string().url() }).optional(),
});
export type HiggsfieldResult = z.infer<typeof resultSchema>;

async function apiRequest(url: string, init: RequestInit = {}) {
  const key = credential();
  if (!key)
    throw new HiggsfieldError(
      401,
      false,
      "Video generation needs administrator setup."
    );
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Key ${key}`,
        "Content-Type": "application/json",
      },
      redirect: "error",
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw new HiggsfieldError(
      0,
      true,
      "The video service did not confirm the request. We will check the same request again."
    );
  }
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 8000);
    const ambiguous =
      response.status >= 500 ||
      response.status === 429 ||
      /idempotenc|concurren|queue.{0,20}(full|limit)/i.test(detail);
    const message =
      response.status === 403
        ? "The video provider’s API balance needs attention. Contact your administrator."
        : response.status === 401
          ? "The video provider’s API credentials need attention. Contact your administrator."
          : response.status === 422
            ? "The video service could not validate these generation settings."
            : response.status === 423
              ? "The video service blocked this request. Review your references and prompt."
              : "The video service could not accept this request. Review the settings or try again later.";
    throw new HiggsfieldError(response.status, ambiguous, message);
  }
  if (response.status === 202 && url.endsWith("/cancel")) return null;
  try {
    return resultSchema.parse(await response.json());
  } catch {
    throw new HiggsfieldError(
      0,
      true,
      "The video service returned an unreadable status. We will check again."
    );
  }
}
export async function submitHiggsfield(
  endpoint: string,
  body: Record<string, unknown>,
  id: string
) {
  if (
    !/^(bytedance\/seedance-2\.5\/(text-to-video|reference-to-video|video-edit|video-extend)|higgsfield\/genjutsu\/motion-transfer\/v1\.0)$/.test(
      endpoint
    )
  )
    throw new Error("Unsupported video operation");
  return (await apiRequest(`${API}/${endpoint}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Idempotency-Key": id },
  }))!;
}
export async function pollHiggsfield(id: string, url: string) {
  const result = (await apiRequest(requestUrl(url, id, "status")))!;
  if (result.request_id !== id)
    throw new HiggsfieldError(
      0,
      true,
      "The video service returned a different request. An administrator must review this job."
    );
  return result;
}
export async function cancelHiggsfield(id: string, url: string) {
  await apiRequest(requestUrl(url, id, "cancel"), { method: "POST" });
}
export function providerUrls(result: HiggsfieldResult) {
  const id = result.request_id;
  return {
    providerRequestId: id,
    providerStatusUrl: requestUrl(
      result.status_url ?? `${API}/requests/${id}/status`,
      id,
      "status"
    ),
    providerCancelUrl: requestUrl(
      result.cancel_url ?? `${API}/requests/${id}/cancel`,
      id,
      "cancel"
    ),
  };
}

/** No provider credentials are sent to CDN URLs. DNS is pinned after rejecting private IPs. */
export async function downloadVideo(
  value: string,
  redirects = 0
): Promise<Buffer> {
  if (redirects > 3)
    throw new Error("Video download redirected too many times");
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  )
    throw new Error("The video download URL is not supported");
  const { addresses } = await assertPublicUrl(value);
  const response = await new Promise<{ bytes: Buffer; redirect?: string }>(
    (resolve, reject) => {
      const request = https.get(
        {
          hostname: addresses[0].address,
          servername: url.hostname,
          path: url.pathname + url.search,
          headers: { Host: url.hostname },
          timeout: 30000,
        },
        res => {
          if (
            res.statusCode &&
            [301, 302, 303, 307, 308].includes(res.statusCode) &&
            res.headers.location
          ) {
            res.resume();
            resolve({
              bytes: Buffer.alloc(0),
              redirect: new URL(res.headers.location, url).toString(),
            });
            return;
          }
          if (res.statusCode !== 200) {
            res.resume();
            reject(new Error("The generated video could not be downloaded"));
            return;
          }
          const chunks: Buffer[] = [];
          let size = 0;
          res.on("error", reject);
          res.on("aborted", () =>
            reject(new Error("Video download was interrupted"))
          );
          res.on("data", chunk => {
            size += chunk.length;
            if (size > 200 * 1024 * 1024)
              request.destroy(
                new Error("Generated video exceeds the 200 MB storage limit")
              );
            else chunks.push(Buffer.from(chunk));
          });
          res.on("end", () => resolve({ bytes: Buffer.concat(chunks) }));
        }
      );
      const deadline = setTimeout(
        () => request.destroy(new Error("Video download timed out")),
        90000
      );
      request.once("close", () => clearTimeout(deadline));
      request.on("timeout", () =>
        request.destroy(new Error("Video download timed out"))
      );
      request.on("error", reject);
    }
  );
  return response.redirect
    ? downloadVideo(response.redirect, redirects + 1)
    : response.bytes;
}
