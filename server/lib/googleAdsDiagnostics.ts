/** Provider messages/triggers may contain secrets or customer data. Retain only
 * bounded machine codes and a validated request identifier for support. */
export function googleAdsDiagnostics(body: unknown, requestId: string | null) {
  const details = (body as any)?.error?.details;
  const codes = (Array.isArray(details) ? details : [])
    .flatMap((detail: any) => Array.isArray(detail?.errors) ? detail.errors : [])
    .flatMap((error: any) => Object.values(error?.errorCode ?? {}))
    .filter((code: unknown): code is string => typeof code === "string" && /^[A-Z][A-Z0-9_]{0,99}$/.test(code));
  return {
    codes: Array.from(new Set(codes)).slice(0, 5),
    requestId: requestId && /^[\w-]{1,150}$/.test(requestId) ? requestId : undefined,
  };
}

export function googleAdsFailureMessage(stage: string, body: unknown, requestId: string | null) {
  const diagnostic = googleAdsDiagnostics(body, requestId);
  return `Google ${stage} failed${diagnostic.codes.length ? `: ${diagnostic.codes.join(", ")}` : ". Check account access and campaign settings"}.${diagnostic.requestId ? ` Request ID: ${diagnostic.requestId}.` : ""}`;
}
