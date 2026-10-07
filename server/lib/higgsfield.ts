import https from "node:https";
import { z } from "zod";
import { assertPublicUrl } from "./websiteCrawler";
import { generationModels } from "../../shared/modelCatalog";

const API = "https://api.higgsfield.ai";
export function higgsfieldConfigured(kind: "image" | "video" = "video") {
  return (
    !!credential() &&
    (kind === "image" || process.env.VIDEO_GENERATION_ENABLED !== "false")
  );
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
export class HiggsfieldUrlError extends Error {
  constructor(public diagnostic: Record<string, string | boolean>) {
    super("Invalid generation status URL");
  }
}
export function requestUrl(
  url: string,
  id: string,
  action: "status" | "cancel"
) {
  if (!idPattern.test(id)) throw new Error("Invalid generation request ID");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new HiggsfieldUrlError({ action, reason: "malformed_url" });
  }
  if (
    parsed.origin !== API ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== `/requests/${id}/${action}`
  )
    throw new HiggsfieldUrlError({
      action,
      reason: "unexpected_url_shape",
      expectedOrigin: parsed.origin === API,
      expectedHost: parsed.hostname === "api.higgsfield.ai",
      secureTransport: parsed.protocol === "https:",
      hasCredentials: !!(parsed.username || parsed.password),
      hasQuery: !!parsed.search,
      hasFragment: !!parsed.hash,
      // Report only known route words, never raw URLs, query tokens or credentials.
      pathShape: parsed.pathname
        .split("/")
        .map(part =>
          part === id
            ? ":request_id"
            : ["", "requests", "status", "cancel", "v1"].includes(part)
              ? part
              : ":other"
        )
        .join("/"),
    });
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
  error: z.string().nullable().optional(),
  video: z.object({ url: z.string().url() }).optional(),
  images: z.array(z.object({ url: z.string().url() })).optional(),
});
export type HiggsfieldResult = z.infer<typeof resultSchema>;

/** Provider errors may echo signed asset URLs. Keep useful diagnostic text,
 * but never expose temporary URLs, auth headers, or credentials to the UI.
 */
export function videoProviderFailureMessage(result: HiggsfieldResult) {
  if (result.status === "nsfw")
    return "The video service declined this content. Review your prompt and references. AI credits refunded.";
  if (result.status === "canceled")
    return "The video service confirmed cancellation. AI credits refunded.";
  if (
    /(?:credit|api|account) balance.{0,80}(?:too low|insufficient|exhausted)|insufficient (?:credits?|balance)|not enough credits/i.test(
      result.error ?? ""
    )
  )
    return "The video provider's API balance is too low. An EvokeLoop administrator needs to top up the provider account. Your EvokeLoop AI credits have been refunded.";
  const reason = (result.error ?? "")
    .replace(/https?:\/\/\S+/gi, "[reference URL]")
    .replace(/\b(?:Bearer|Key)\s+\S+/gi, "[credentials removed]")
    .replace(
      /\b(?:api[_-]?key|secret|token|authorization)\s*[:=]\s*[^\s,;]+/gi,
      "[credentials removed]"
    )
    .replace(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
      "[token removed]"
    )
    .replace(/higgsfield/gi, "video service")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 700);
  return reason
    ? `Video generation failed: ${reason} AI credits refunded.`
    : "The video service reported a generation failure without a detailed reason. AI credits refunded.";
}

async function apiRequest(
  url: string,
  init: RequestInit = {},
  estimate = false
) {
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
    const json = await response.json();
    if (estimate) {
      const parsed = estimateSchema.safeParse(json);
      if (!parsed.success) {
        console.warn(
          JSON.stringify({
            event: "generation.quote.invalid_response",
            status: response.status,
            fields:
              json && typeof json === "object"
                ? Object.keys(json).slice(0, 20)
                : [],
            usdType: typeof json?.usd,
            estimateType:
              typeof json?.type === "string" ? json.type.slice(0, 80) : null,
            pricingDescription:
              typeof json?.pricing_description === "string"
                ? json.pricing_description
                    .replace(/https?:\/\/\S+/gi, "[URL]")
                    .replace(/\b(?:Bearer|Key)\s+\S+/gi, "[redacted]")
                    .slice(0, 4000)
                : null,
            issues: parsed.error.issues.map(issue => ({
              path: issue.path,
              code: issue.code,
            })),
          })
        );
        throw new Error("Invalid estimate response");
      }
      return parsed.data;
    }
    return resultSchema.parse(json);
  } catch {
    throw new HiggsfieldError(
      0,
      true,
      "The video service returned an unreadable status. We will check again."
    );
  }
}
// Account-specific estimates include applicable provider discounts. Never use
// provider credits as EL credits, or fall back to a catalog range on failure.
const estimateSchema = z.object({
  usd: z
    .union([z.string().regex(/^\d+(?:\.\d+)?$/), z.number()])
    .transform(Number)
    .pipe(z.number().finite().nonnegative().max(100000)),
});
export async function estimateHiggsfield(
  endpoint: string,
  body: Record<string, unknown>
): Promise<{ costMicros: number; quotedAtMs: number }> {
  if (
    !generationModels.some(
      m => m.provider === "higgsfield" && m.providerModel === endpoint
    )
  )
    throw new Error("Unsupported generation operation");
  try {
    const result = (await apiRequest(
      `${API}/estimate/${endpoint}`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
      true
    )) as z.infer<typeof estimateSchema>;
    return { costMicros: Math.round(result.usd * 1e6), quotedAtMs: Date.now() };
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: "generation.quote.failed",
        endpoint,
        status: error instanceof HiggsfieldError ? error.status : null,
        ambiguous: error instanceof HiggsfieldError ? error.ambiguous : false,
      })
    );
    // Estimation does not submit generation and never creates a billable job.
    throw new Error(
      "A credit quote is unavailable for these settings. Check the required inputs or try again. No generation was submitted."
    );
  }
}
export async function submitHiggsfield(
  endpoint: string,
  body: Record<string, unknown>,
  id: string
) {
  if (
    !generationModels.some(
      model =>
        model.provider === "higgsfield" && model.providerModel === endpoint
    )
  )
    throw new Error("Unsupported video operation");
  return (await apiRequest(`${API}/${endpoint}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Idempotency-Key": id },
  }))! as HiggsfieldResult;
}
export async function pollHiggsfield(id: string, url: string) {
  const result = (await apiRequest(
    requestUrl(url, id, "status")
  ))! as HiggsfieldResult;
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
  // Resolve the validated request ID through the documented API routes.
  // Response links can name a different host; never forward credentials there.
  // https://docs.higgsfield.ai/docs/api-reference/requests/get-request-status
  return {
    providerRequestId: id,
    providerStatusUrl: requestUrl(`${API}/requests/${id}/status`, id, "status"),
    providerCancelUrl: requestUrl(`${API}/requests/${id}/cancel`, id, "cancel"),
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
