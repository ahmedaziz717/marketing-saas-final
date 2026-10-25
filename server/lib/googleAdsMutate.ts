import { googleCustomerIdSchema } from "../../shared/googleAds";
import { GoogleAdsError, googleConfig } from "./googleAdsApi";
import { googleAdsFailureMessage } from "./googleAdsDiagnostics";

/** Internal only: UI requests are compiled from GoogleChange, never raw operations. */
export type GoogleOperation = Record<
  string,
  {
    create?: Record<string, unknown>;
    update?: Record<string, unknown>;
    updateMask?: string;
    remove?: string;
  }
>;
export class GoogleMutationError extends Error {
  constructor(
    message: string,
    public readonly uncertain = false
  ) {
    super(message);
  }
}
export async function mutateGoogleAds(
  accessToken: string,
  customerId: string,
  operations: GoogleOperation[],
  validateOnly: boolean,
  loginCustomerId?: string
) {
  googleCustomerIdSchema.parse(customerId);
  if (!operations.length || operations.length > 500)
    throw new GoogleMutationError("Choose between 1 and 500 changes.");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
  const payload = JSON.stringify({
    mutateOperations: operations,
    validateOnly,
    partialFailure: false,
    responseContentType: "RESOURCE_NAME_ONLY",
  });
  if (Buffer.byteLength(payload) > 32 * 1024 * 1024)
    throw new GoogleMutationError(
      "This change exceeds the upload limit. Use fewer or smaller images."
    );
  if (loginCustomerId)
    headers["login-customer-id"] =
      googleCustomerIdSchema.parse(loginCustomerId);
  let response: Response;
  let body: any;
  try {
    response = await fetch(
      `https://googleads.googleapis.com/${googleConfig().version}/customers/${customerId}/googleAds:mutate`,
      {
        method: "POST",
        headers,
        redirect: "error",
        signal: AbortSignal.timeout(30000),
        body: payload,
      }
    );
    body = await response.json();
  } catch {
    throw new GoogleMutationError(
      validateOnly
        ? "Google validation could not finish. Try validation again."
        : "Google did not confirm the result. Check this account in Google Ads before making another change.",
      !validateOnly
    );
  }
  if (response.status === 401) throw new GoogleAdsError("expired");
  if (!response.ok || body.partialFailureError) {
    throw new GoogleMutationError(
      googleAdsFailureMessage(validateOnly ? "validation" : "publishing", body, response.headers.get("request-id")),
      !validateOnly && response.status >= 500
    );
  }
  const resources = (body.mutateOperationResponses ?? [])
    .flatMap((r: Record<string, any>) =>
      Object.values(r).map(v => v?.resourceName)
    )
    .filter(
      (v: unknown): v is string =>
        typeof v === "string" &&
        v.startsWith(`customers/${customerId}/`) &&
        /^[\w/~.-]+$/.test(v)
    );
  if (!validateOnly && resources.length !== operations.length)
    throw new GoogleMutationError(
      "Google returned an incomplete confirmation. Check the account before retrying.",
      true
    );
  const requestId = response.headers.get("request-id");
  return {
    resources,
    ...(requestId && /^[\w-]{1,150}$/.test(requestId) ? { requestId } : {}),
  };
}
