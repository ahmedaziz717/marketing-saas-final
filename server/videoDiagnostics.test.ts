import { expect, it } from "vitest";
import { requestUrl } from "./lib/higgsfield";
import { videoFailureDiagnostic } from "./lib/videoDiagnostics";

it("explains rejected provider routes without logging URL secrets", () => {
  let failure: unknown;
  try {
    requestUrl(
      "https://user:secret@api.higgsfield.ai/requests/job/status/?token=private-token",
      "job",
      "status"
    );
  } catch (error) {
    failure = error;
  }
  expect(videoFailureDiagnostic(failure)).toEqual({
    category: "provider_url",
    action: "status",
    reason: "unexpected_url_shape",
    expectedOrigin: true,
    expectedHost: true,
    secureTransport: true,
    hasCredentials: true,
    hasQuery: true,
    hasFragment: false,
    pathShape: "/requests/:request_id/status/",
  });
  expect(JSON.stringify(videoFailureDiagnostic(failure))).not.toMatch(
    /secret|private-token/
  );
});

it("extracts only database error codes, never SQL, parameters or exception text", () => {
  const failure = new Error("SQL with signed URLs and credentials", {
    cause: Object.assign(new Error("sensitive query values"), {
      code: "23505",
    }),
  });
  expect(videoFailureDiagnostic(failure)).toEqual({
    category: "database",
    code: "23505",
  });
  expect(videoFailureDiagnostic(new Error("secret-credential"))).toEqual({
    category: "processing_error",
    kind: "Error",
  });
});
