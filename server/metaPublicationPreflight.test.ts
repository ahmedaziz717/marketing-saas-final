import { afterEach, expect, it, vi } from "vitest";
import { validateMetaDestination } from "./lib/metaPublicationPreflight";
import { graphRequest } from "./lib/channelGraph";
const content = { adSetId: "123", metaCampaignId: "456" } as any;
const valid = {
  id: "123",
  account_id: "789",
  campaign_id: "456",
  destination_type: "WEBSITE",
  campaign: { id: "456", objective: "OUTCOME_SALES" },
};
afterEach(() => vi.unstubAllGlobals());
it("allows a paused website destination but blocks incompatible formats before uploads", () => {
  expect(() =>
    validateMetaDestination(
      { ...valid, effective_status: "PAUSED" },
      "789",
      content
    )
  ).not.toThrow();
  for (const [patch, message] of [
    [{ account_id: "999" }, /different ad account/],
    [{ campaign_id: "999" }, /selected campaign/],
    [{ is_dynamic_creative: true }, /Dynamic Creative/],
    [{ promoted_object: { product_set_id: "1" } }, /catalog ad set/],
    [{ promoted_object: { application_id: "1" } }, /promotes an app/],
    [{ destination_type: "MESSENGER" }, /messenger/],
    [{ effective_status: "ARCHIVED" }, /archived/],
  ] as const)
    expect(() =>
      validateMetaDestination({ ...valid, ...patch }, "789", content)
    ).toThrow(message);
});
it("keeps useful Meta error details while redacting tokens and OAuth codes from every persisted field", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              message: "Invalid parameter",
              code: 100,
              error_subcode: 18157520,
              error_user_title: "Unsupported creative",
              error_user_msg:
                "Choose a different ad set. token-example input-secret auth-code",
              fbtrace_id: "safe-trace-123",
            },
          }),
          { status: 400 }
        )
      )
  );
  const error = await graphRequest("123", "token-example", {
    input_token: "input-secret",
    code: "auth-code",
  }).catch(e => e);
  expect(error.message).toContain("Choose a different ad set");
  expect(error.details).toMatchObject({
    subcode: 18157520,
    traceId: "safe-trace-123",
    userTitle: "Unsupported creative",
  });
  for (const secret of ["token-example", "input-secret", "auth-code"])
    expect(JSON.stringify(error)).not.toContain(secret);
  expect(error.definitive).toBe(true);
});
