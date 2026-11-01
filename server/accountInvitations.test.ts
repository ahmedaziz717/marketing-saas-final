import { afterEach, expect, it, vi } from "vitest";
import { sendAccountInvitation } from "./lib/accountInvitations";
vi.mock("./lib/siteOrigins", () => ({
  siteOrigins: () => ({ app: "https://app.evokeloop.com" }),
}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("reports missing configuration without sending", async () => {
  vi.stubEnv("CONTACT_RESEND_API_KEY", "");
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  expect(
    (
      await sendAccountInvitation(
        "owner@example.com",
        "Test",
        "/account-invite/test"
      )
    ).status
  ).toBe("failed");
  expect(fetch).not.toHaveBeenCalled();
});
it("sends the email-bound invitation with a stable deduplication key", async () => {
  vi.stubEnv("CONTACT_RESEND_API_KEY", "test");
  vi.stubEnv("CONTACT_EMAIL_FROM", "EvokeLoop <support@evokeloop.com>");
  const fetch = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ id: "receipt" }) });
  vi.stubGlobal("fetch", fetch);
  expect(
    await sendAccountInvitation(
      "owner@example.com",
      "Test",
      "/account-invite/test"
    )
  ).toEqual({ status: "sent", providerId: "receipt" });
  const args = fetch.mock.calls[0][1];
  expect(JSON.parse(args.body).to).toEqual(["owner@example.com"]);
  expect(JSON.parse(args.body).text).toContain(
    "https://app.evokeloop.com/account-invite/test"
  );
  expect(args.headers["Idempotency-Key"]).toMatch(
    /^account-invite\/[a-f0-9]{64}$/
  );
});
it("does not claim delivery on provider rejection", async () => {
  vi.stubEnv("CONTACT_RESEND_API_KEY", "test");
  vi.stubEnv("CONTACT_EMAIL_FROM", "support@evokeloop.com");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }));
  expect(
    (
      await sendAccountInvitation(
        "owner@example.com",
        "Test",
        "/account-invite/test"
      )
    ).status
  ).toBe("failed");
});
