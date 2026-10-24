import { HiggsfieldError, HiggsfieldUrlError } from "./higgsfield";

/** Keep diagnostics useful without exposing prompts, signed URLs, credentials or SQL. */
export function videoFailureDiagnostic(error: unknown) {
  if (error instanceof HiggsfieldUrlError)
    return { category: "provider_url", ...error.diagnostic };
  if (error instanceof HiggsfieldError)
    return {
      category: "provider_api",
      status: error.status,
      ambiguous: error.ambiguous,
    };
  let cause: unknown = error;
  for (
    let depth = 0;
    depth < 4 && cause && typeof cause === "object";
    depth++
  ) {
    const detail = cause as { code?: unknown; cause?: unknown };
    if (typeof detail.code === "string" && /^[0-9A-Z]{5}$/.test(detail.code))
      return { category: "database", code: detail.code };
    cause = detail.cause;
  }
  const known = new Map([
    ["Video worker lease no longer belongs to this process", "lease_lost"],
    ["Generation request snapshot is unavailable", "missing_snapshot"],
    ["Unsupported video operation", "unsupported_operation"],
    ["Provider request ID is unavailable", "missing_provider_id"],
    [
      "Generated video storage is temporarily unavailable",
      "storage_unavailable",
    ],
    ["Workspace brand kit is unavailable", "missing_brand_kit"],
  ]);
  return {
    category:
      error instanceof Error
        ? (known.get(error.message) ?? "processing_error")
        : "unknown_error",
    kind:
      error instanceof TypeError
        ? "TypeError"
        : error instanceof Error
          ? "Error"
          : "unknown",
  };
}
