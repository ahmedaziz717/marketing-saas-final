import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { once } from "node:events";
import express from "express";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("./db", () => ({ getDb: async () => state.db }));
import {
  registerResendInbound,
  RESEND_INBOUND_PATH,
} from "./lib/resendInbound";
let engine: PGlite,
  server: ReturnType<express.Express["listen"]>,
  origin: string;
const realFetch = globalThis.fetch;
const apiFetch = vi.fn();
const secretBytes = Buffer.alloc(32, 41);
const secret = "whsec_" + secretBytes.toString("base64");
let emailId: string;
beforeAll(async () => {
  engine = new PGlite();
  for (const file of readdirSync("drizzle/postgres")
    .filter(f => f.endsWith(".sql"))
    .sort())
    await engine.exec(readFileSync("drizzle/postgres/" + file, "utf8"));
  state.db = drizzle(engine);
  const app = express();
  registerResendInbound(app);
  // These intentionally reject requests: signed route must finish before them.
  app.use(express.json());
  app.use((_req, res) => {
    res.status(403).end();
  });
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  origin = `http://127.0.0.1:${(server.address() as any).port}`;
}, 30000);
beforeEach(async () => {
  await engine.exec("TRUNCATE app_private.inbound_privacy_emails");
  emailId = randomUUID();
  vi.stubEnv("RESEND_RECEIVING_API_KEY", "test-receiving-key");
  vi.stubEnv("RESEND_WEBHOOK_SECRET", secret);
  vi.stubEnv("CONTACT_EMAIL_FROM", "EvokeLoop <notifications@evokeloop.com>");
  vi.stubEnv("CONTACT_NOTIFICATION_EMAIL", "recipient@example.test");
  vi.stubGlobal("fetch", apiFetch);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  apiFetch.mockReset().mockImplementation(async (url: string) => {
    if (url === `https://api.resend.com/emails/receiving/${emailId}`)
      return Response.json({
        id: emailId,
        subject: "Privacy request",
        raw: { download_url: "https://files.resend.com/test.eml" },
      });
    if (url === "https://files.resend.com/test.eml")
      return new Response(
        "From: visitor@example.test\r\nTo: privacy@evokeloop.com\r\nSubject: Privacy request\r\n\r\nPlease delete my information."
      );
    if (url === "https://api.resend.com/emails")
      return Response.json({ id: "forwarded-id" });
    throw new Error("Unexpected URL");
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
afterAll(async () => {
  await new Promise<void>(r => server.close(() => r()));
  await engine.close();
});
function event(extra: Record<string, unknown> = {}) {
  return {
    type: "email.received",
    data: {
      email_id: emailId,
      from: "Visitor <visitor@example.test>",
      to: ["privacy@evokeloop.com"],
      ...extra,
    },
  };
}
async function post(
  body = JSON.stringify(event()),
  timestamp = Math.floor(Date.now() / 1000),
  valid = true
) {
  const id = "msg_test";
  const signature = createHmac("sha256", secretBytes)
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
  return realFetch(origin + RESEND_INBOUND_PATH, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "svix-id": id,
      "svix-timestamp": String(timestamp),
      "svix-signature": `v1,${valid ? signature : "invalid"}`,
    },
    body,
  });
}
const sends = () =>
  apiFetch.mock.calls.filter(
    ([url]) => url === "https://api.resend.com/emails"
  );
describe.sequential("signed support and privacy inbound forwarding", () => {
  it("rejects forged, expired and altered signatures without sending", async () => {
    expect((await post(undefined, undefined, false)).status).toBe(401);
    expect(
      (await post(undefined, Math.floor(Date.now() / 1000) - 601)).status
    ).toBe(401);
    expect(apiFetch).not.toHaveBeenCalled();
  });
  it("returns unavailable until configured and exposes no secrets", async () => {
    vi.stubEnv("RESEND_WEBHOOK_SECRET", "");
    expect((await post()).status).toBe(503);
    const r = await realFetch(origin + RESEND_INBOUND_PATH);
    expect(await r.json()).toEqual({
      endpoint: "resend-inbound",
      method: "POST",
      configured: false,
      invalidOrMissing: ["RESEND_WEBHOOK_SECRET"],
    });
    expect(apiFetch).not.toHaveBeenCalled();
  });
  it("only processes allowed envelope recipients and ignores other signed events", async () => {
    expect(
      (
        await post(
          JSON.stringify(event({ received_for: ["other@evokeloop.com"] }))
        )
      ).status
    ).toBe(200);
    expect(
      (await post(JSON.stringify({ type: "email.sent", data: {} }))).status
    ).toBe(200);
    expect(apiFetch).not.toHaveBeenCalled();
  });
  it("forwards a complete original message only to the configured inbox and deduplicates replay", async () => {
    expect((await post()).status).toBe(200);
    expect((await post()).status).toBe(200);
    expect(sends()).toHaveLength(1);
    const opts = sends()[0][1];
    const body = JSON.parse(opts.body);
    expect(body.to).toBe("recipient@example.test");
    expect(body.from).toBe("EvokeLoop <notifications@evokeloop.com>");
    expect(body.text).toContain("visitor@example.test");
    expect(body.attachments[0].filename).toBe("forwarded_message.eml");
    expect(
      Buffer.from(body.attachments[0].content, "base64").toString()
    ).toContain("Please delete my information.");
    expect(opts.headers.get("Idempotency-Key")).toBe(
      `evokeloop-privacy/${emailId}`
    );
    const result = await engine.query(
      "SELECT state FROM app_private.inbound_privacy_emails"
    );
    expect(result.rows).toEqual([{ state: "sent" }]);
  });
  it.each([
    ["Support <SUPPORT@evokeloop.com>"],
    ["support@evokeloop.com", "privacy@evokeloop.com"],
  ])(
    "forwards support and combined recipients once: %s",
    async (...received_for) => {
      const payload = JSON.stringify(
        event({ to: ["other@evokeloop.com"], received_for })
      );
      expect((await post(payload)).status).toBe(200);
      expect((await post(payload)).status).toBe(200);
      expect(sends()).toHaveLength(1);
      const body = JSON.parse(sends()[0][1].body);
      expect(body.to).toBe("recipient@example.test");
      expect(body.text).toContain("support@evokeloop.com");
      if (received_for.length > 1)
        expect(body.text).toContain("privacy@evokeloop.com");
    }
  );
  it("does not acknowledge provider failures; retries with the identical payload and key", async () => {
    const original = apiFetch.getMockImplementation()!;
    let failed = false;
    apiFetch.mockImplementation(async (...args) => {
      if (args[0] === "https://api.resend.com/emails" && !failed) {
        failed = true;
        return Response.json(
          { name: "application_error", message: "test" },
          { status: 503 }
        );
      }
      return original(...args);
    });
    expect((await post()).status).toBe(503);
    vi.stubEnv("CONTACT_NOTIFICATION_EMAIL", "changed@example.test");
    expect((await post()).status).toBe(200);
    expect(sends()).toHaveLength(2);
    expect(sends()[0][1].body).toBe(sends()[1][1].body);
  });
  it("prevents concurrent sends and stops uncertain retries outside the idempotency window", async () => {
    const responses = await Promise.all([post(), post()]);
    expect(responses.some(r => r.status === 200)).toBe(true);
    expect(sends()).toHaveLength(1);
    await engine.query(
      "UPDATE app_private.inbound_privacy_emails SET state='pending', \"firstAttemptAtMs\"=$1",
      [Date.now() - 24 * 60 * 60_000]
    );
    expect((await post()).status).toBe(503);
    expect(sends()).toHaveLength(1);
  });
  it("accepts surrounding whitespace in copied settings", async () => {
    vi.stubEnv(
      "CONTACT_EMAIL_FROM",
      " EvokeLoop <notifications@evokeloop.com> "
    );
    vi.stubEnv("CONTACT_NOTIFICATION_EMAIL", " recipient@example.test ");
    vi.stubEnv("RESEND_WEBHOOK_SECRET", " " + secret + " ");
    expect((await post()).status).toBe(200);
  });
  it("rejects forwarding back into the receiving domain", async () => {
    vi.stubEnv("CONTACT_NOTIFICATION_EMAIL", "privacy@evokeloop.com");
    expect((await post()).status).toBe(503);
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
