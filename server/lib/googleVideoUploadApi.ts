import { googleConfig, GoogleAdsError } from "./googleAdsApi";
import { googleCustomerIdSchema } from "../../shared/googleAds";
import { GoogleMutationError } from "./googleAdsMutate";

/** Only called after explicit upload confirmation. Upload-session URLs never leave this function. */
export async function uploadGoogleVideo(
  token: string,
  customerId: string,
  title: string,
  bytes: Buffer,
  generated: boolean,
  loginCustomerId?: string
) {
  googleCustomerIdSchema.parse(customerId);
  if (!bytes.length || bytes.length > 20 * 1024 * 1024)
    throw new GoogleMutationError("Choose a video up to 20 MB.");
  const version = googleConfig().version;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "X-Goog-Upload-Protocol": "resumable",
    "X-Goog-Upload-Command": "start",
    "X-Goog-Upload-Header-Content-Length": String(bytes.length),
  };
  if (loginCustomerId)
    headers["login-customer-id"] =
      googleCustomerIdSchema.parse(loginCustomerId);
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim();
  if (developerToken) headers["developer-token"] = developerToken;
  let session: Response;
  try {
    session = await fetch(
      `https://googleads.googleapis.com/resumable/upload/${version}/customers/${customerId}/youTubeVideoUploads:create`,
      {
        method: "POST",
        headers,
        redirect: "error",
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify({
          customerId,
          youTubeVideoUpload: {
            videoTitle:
              title.replace(/[<>]/g, "").trim().slice(0, 100) ||
              "EvokeLoop video",
            videoPrivacy: "UNLISTED",
            ...(Number(version.slice(1)) >= 26
              ? {
                  videoContentMetadata: {
                    generativeContentDisclosure: generated
                      ? "GENERATIVE_CONTENT"
                      : "NON_GENERATIVE_CONTENT",
                  },
                }
              : {}),
          },
        }),
      }
    );
  } catch {
    throw new GoogleMutationError(
      "Google did not confirm the upload session. Check Google Ads before retrying.",
      true
    );
  }
  if (session.status === 401) throw new GoogleAdsError("expired");
  if (!session.ok)
    throw new GoogleMutationError(
      "Google could not start this video upload. Check account access and video eligibility.",
      session.status >= 500
    );
  const url = new URL(
    session.headers.get("x-goog-upload-url") || "https://invalid.invalid"
  );
  if (
    url.protocol !== "https:" ||
    url.hostname !== "googleads.googleapis.com" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  )
    throw new GoogleMutationError(
      "Google returned an invalid upload session.",
      true
    );
  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
        "X-Goog-Upload-Offset": "0",
        "X-Goog-Upload-Command": "upload, finalize",
      },
      body: new Uint8Array(bytes),
      redirect: "error",
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) throw new Error("Upload failed");
    const body = await response.json();
    const resource = body.resourceName ?? body.resource_name;
    if (
      typeof resource !== "string" ||
      !new RegExp(`^customers/${customerId}/youTubeVideoUploads/[0-9]+$`).test(
        resource
      )
    )
      throw new Error("Invalid upload result");
    return resource;
  } catch {
    throw new GoogleMutationError(
      "Google did not confirm the completed upload. Check Google Ads before retrying.",
      true
    );
  }
}
