import { expect, it } from "vitest";
import { googleAdsDiagnostics, googleAdsFailureMessage } from "./lib/googleAdsDiagnostics";

it("retains machine codes and request IDs without exposing messages or triggers", () => {
  const body = { error: { message: "private-token", details: [{ errors: [
    { errorCode: { queryError: "PROHIBITED_FIELD_IN_ORDER_BY_CLAUSE" }, message: "private-query", trigger: "private-value" },
    { errorCode: { queryError: "bad private text" } },
  ] }] } };
  expect(googleAdsFailureMessage("account query", body, "req-123")).toBe("Google account query failed: PROHIBITED_FIELD_IN_ORDER_BY_CLAUSE. Request ID: req-123.");
  expect(googleAdsDiagnostics(body, "secret?token=value").requestId).toBeUndefined();
  expect(googleAdsDiagnostics({ error: { details: {} } }, null)).toEqual({ codes: [], requestId: undefined });
});
