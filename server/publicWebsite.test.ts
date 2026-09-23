import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { once } from "node:events";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import express from "express";
const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("./db", () => ({ getDb: async () => state.db }));
import { registerPublicWebsite, publicDocument } from "./public/routes";
import {
  makeFormToken,
  validFormToken,
  formReceiptToken,
} from "./lib/publicWebsite";
import { publicWebsiteAdminRouter } from "./routers/publicWebsite";
import { emptyWebsiteProfile, PUBLIC_PATHS } from "../shared/publicWebsite";
import { users } from "../drizzle/schema";
import { websiteRequests } from "../drizzle/websiteSchema";
import type { TrpcContext } from "./_core/context";
let engine: PGlite,
  server: ReturnType<express.Express["listen"]>,
  origin: string;
let admin: ReturnType<typeof publicWebsiteAdminRouter.createCaller>,
  customer: typeof admin,
  guest: typeof admin;
beforeAll(async () => {
  vi.stubEnv(
    "INTEGRATION_TOKEN_ENCRYPTION_SECRET",
    "isolated-public-test-key-never-production"
  );
  engine = new PGlite();
  for (const file of readdirSync("drizzle/postgres")
    .filter(f => f.endsWith(".sql"))
    .sort())
    await engine.exec(readFileSync("drizzle/postgres/" + file, "utf8"));
  state.db = drizzle(engine);
  const people = await state.db
    .insert(users)
    .values([
      { openId: "site-admin", role: "admin", name: "Platform admin" },
      { openId: "site-customer", role: "user", name: "Workspace owner" },
    ])
    .returning();
  [admin, customer, guest] = [people[0], people[1], null].map(user =>
    publicWebsiteAdminRouter.createCaller({
      user,
      req: {},
      res: {},
    } as TrpcContext)
  );
  const app = express();
  registerPublicWebsite(app);
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  origin = `http://127.0.0.1:${(server.address() as any).port}`;
  vi.stubEnv("APP_ORIGIN", origin);
}, 30000);
afterAll(async () => {
  await new Promise<void>(resolve => server?.close(() => resolve()));
  await engine?.close();
  vi.unstubAllEnvs();
});
function form(overrides = {}) {
  return new URLSearchParams({
    name: "Test requester",
    email: "requester@example.test",
    topic: "deletion",
    workspace: "Example workspace",
    message: "Please remove my contact submission data.",
    acknowledgement: "yes",
    website: "",
    formToken: makeFormToken(Date.now() - 2500),
    ...overrides,
  });
}
function post(body: URLSearchParams, from = origin) {
  return fetch(origin + "/public/request", {
    method: "POST",
    headers: { origin: from },
    body,
    redirect: "manual",
  });
}

describe.sequential(
  "public website, trust pages and protected platform inbox",
  () => {
    it("serves every public page as readable HTML without a session or client bundle", async () => {
      for (const path of PUBLIC_PATHS) {
        const response = await fetch(origin + path);
        const html = await response.text();
        expect(response.status, path).toBe(200);
        expect(html).toContain("<h1");
        expect(html).toContain('href="/privacy"');
        expect(html).toContain('href="/data-deletion"');
        expect(html).not.toContain('id="root"');
        expect(html).not.toContain("/src/main.tsx");
        expect(response.headers.get("set-cookie")).toBeNull();
        expect(html).toContain("fonts.googleapis.com");
        expect(html).toContain("family=Manrope");
        expect(html).not.toContain("googletagmanager");
        expect(html).not.toContain("Instrument+Serif");
        expect(response.headers.get("content-security-policy")).toContain(
          "frame-ancestors 'none'"
        );
      }
    });
    it("does not fabricate an operator or advertise a completed Meta approval", async () => {
      const html = await (await fetch(origin + "/about")).text();
      expect(html).toContain("Contact EvokeLoop");
      expect(html).not.toContain("Cybertron International");
      expect((await fetch(origin + "/")).headers.get("x-robots-tag")).toContain(
        "noindex"
      );
      const product = await (await fetch(origin + "/product/optimize")).text();
      expect(product).toContain("Your team makes the optimization decisions");
    });
    it("does not allow a customer workspace user or a guest to read or edit the platform profile or inbox", async () => {
      for (const caller of [customer, guest]) {
        await expect(caller.profile()).rejects.toMatchObject({
          code: "FORBIDDEN",
        });
        await expect(caller.requests()).rejects.toMatchObject({
          code: "FORBIDDEN",
        });
        await expect(
          caller.saveProfile({ profile: emptyWebsiteProfile, revision: 0 })
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
      }
    });
    it("requires actual operator/contact details before disclosure approval", async () => {
      await expect(
        admin.saveProfile({
          profile: { ...emptyWebsiteProfile, disclosuresApproved: true },
          revision: 0,
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await admin.saveProfile({
        profile: {
          ...emptyWebsiteProfile,
          operatorName: "Example Operator <script>",
          supportEmail: "support@example.test",
          privacyEmail: "privacy@example.test",
          disclosuresApproved: true,
        },
        revision: 0,
      });
      const response = await fetch(origin + "/about");
      const html = await response.text();
      expect(html).toContain("Example Operator &lt;script&gt;");
      expect(html).not.toContain("Example Operator <script>");
      expect(html).not.toContain("Pre-release disclosure draft");
      expect(response.headers.get("x-robots-tag")).toBeNull();
      expect(html).toContain("support@example.test");
      await expect(
        admin.saveProfile({ profile: emptyWebsiteProfile, revision: 0 })
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });
    it("escapes structured data as well as visible operator strings", () => {
      const doc = publicDocument("/", {
        ...emptyWebsiteProfile,
        operatorName: "</script><script>alert(1)</script>",
      });
      expect(doc.html).toContain("\\u003c/script>");
      expect(doc.html).not.toContain("<script>alert(1)</script>");
    });
    it("provides a complete sitemap and leaves public policy pages crawlable", async () => {
      const robots = await (await fetch(origin + "/robots.txt")).text();
      expect(robots).not.toContain("Disallow: /privacy");
      expect(robots).toContain("Disallow: /request-status/");
      const xml = await (await fetch(origin + "/sitemap.xml")).text();
      expect(xml).toContain(origin + "/privacy");
      expect(xml).not.toContain("/request-status/");
      expect(
        (
          await fetch(origin + "/privacy-policy", { redirect: "manual" })
        ).headers.get("location")
      ).toBe("/privacy");
    });
    it("rejects cross-origin, forged and oversized form submissions", async () => {
      expect((await post(form(), "https://untrusted.example")).status).toBe(
        403
      );
      expect((await post(form({ formToken: "forged" }))).status).toBe(400);
      expect((await post(form({ message: "x".repeat(20000) }))).status).toBe(
        413
      );
      expect(await state.db.select().from(websiteRequests)).toHaveLength(0);
    });
    it("checks signed form timing and makes double submissions idempotent", async () => {
      expect(validFormToken(makeFormToken())).toBe(false);
      expect(
        validFormToken(makeFormToken(Date.now() - 3 * 60 * 60 * 1000))
      ).toBe(false);
      const body = form();
      const a = await post(body),
        b = await post(body);
      expect(a.status).toBe(303);
      expect(b.status).toBe(303);
      expect(a.headers.get("location")).toBe(b.headers.get("location"));
      expect(a.headers.get("location")).toBe(
        "/request-status/" + formReceiptToken(body.get("formToken")!)
      );
      expect(await state.db.select().from(websiteRequests)).toHaveLength(1);
      const receipt = await fetch(origin + a.headers.get("location"));
      const html = await receipt.text();
      expect(receipt.status).toBe(200);
      expect(html).toContain("Thank you for contacting us.");
      expect(html).toContain("within two business days");
      expect(html).not.toContain("saved-request receipt");
      expect(html).not.toContain("requester@example.test");
      expect(html).not.toContain("Please remove my contact");
      expect(receipt.headers.get("referrer-policy")).toBe("no-referrer");
      expect(receipt.headers.get("x-robots-tag")).toContain("noindex");
    });
    it("returns truthful error and missing-reference states", async () => {
      const response = await fetch(
        origin + "/request-status/" + "1".repeat(64)
      );
      expect(response.status).toBe(404);
      expect(await response.text()).toContain("Request not found");
      expect((await post(form({ website: "bot.example" }))).status).toBe(400);
      expect((await post(form())).status).toBe(429);
    });
    it("stores the real request privately and permits a documented admin status update, not data erasure", async () => {
      const inbox = await admin.requests();
      expect(inbox.items).toHaveLength(1);
      expect(inbox.items[0].email).toBe("requester@example.test");
      expect(inbox.items[0]).not.toHaveProperty("receiptHash");
      expect(inbox.items[0].emailState).toBe("pending");
      expect(inbox.items[0].emailAttempts).toBe(0);
      const r = inbox.items[0];
      await expect(
        customer.updateRequest({
          id: r.id,
          updatedAtMs: r.updatedAtMs,
          state: "closed",
          note: "Forged request",
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(
        await admin.updateRequest({
          id: r.id,
          updatedAtMs: r.updatedAtMs,
          state: "under_review",
          note: "Awaiting verification through the supplied email.",
        })
      ).toEqual({ success: true, dataDeleted: false });
      expect((await admin.requests()).items[0].state).toBe("under_review");
      await expect(
        admin.updateRequest({
          id: r.id,
          updatedAtMs: r.updatedAtMs,
          state: "closed",
          note: "Concurrent stale action",
        })
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(
        (
          await state.db
            .select()
            .from(websiteRequests)
            .where(eq(websiteRequests.id, r.id))
        )[0].message
      ).toContain("remove my contact");
    });
    it("keeps both new tables default-deny at the database layer", async () => {
      const result = await engine.query<{ relrowsecurity: boolean }>(
        "select relrowsecurity from pg_class where relnamespace='app_private'::regnamespace and relname in ('website_profile','website_requests')"
      );
      expect(result.rows).toHaveLength(2);
      expect(result.rows.every(r => r.relrowsecurity)).toBe(true);
    });
  }
);
