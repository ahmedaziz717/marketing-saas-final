import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import express from "express";
import { once } from "node:events";
import { request as httpRequest } from "node:http";
import { registerSiteRouting } from "./lib/siteRouting";
import {
  dashboardHref,
  requirePublicSiteOrigin,
  siteOrigins,
} from "./lib/siteOrigins";
import { requireSameOrigin } from "./auth/routes";
import { publicDocument } from "./public/routes";
import { emptyWebsiteProfile } from "../shared/publicWebsite";
const A = "https://app.evokeloop.com",
  W = "https://evokeloop.com",
  OLD = "frame-staging.onrender.com";
function configure() {
  vi.stubEnv("APP_ORIGIN", A);
  vi.stubEnv("PUBLIC_SITE_ORIGIN", W);
  vi.stubEnv("LEGACY_SITE_ORIGINS", "https://" + OLD);
}
afterEach(() => vi.unstubAllEnvs());
describe("domain configuration", () => {
  it("preserves existing combined-host behavior", () => {
    vi.stubEnv("APP_ORIGIN", "https://old.example.test");
    vi.stubEnv("PUBLIC_SITE_ORIGIN", "");
    expect(siteOrigins().split).toBe(false);
    expect(dashboardHref("/login")).toBe("/login");
  });
  it.each([
    "https://example.test/path",
    "https://example.test?x=1",
    "https://example.test#x",
    "https://user:secret@example.test",
    "javascript:alert(1)",
    "example.test",
  ])("rejects invalid configured origin %s", value => {
    configure();
    vi.stubEnv("PUBLIC_SITE_ORIGIN", value);
    expect(() => siteOrigins()).toThrow();
  });
  it("requires HTTPS except local production smoke tests", () => {
    configure();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PUBLIC_SITE_ORIGIN", "http://evokeloop.com");
    expect(() => siteOrigins()).toThrow();
    vi.stubEnv("PUBLIC_SITE_ORIGIN", "http://127.0.0.1:3020");
    expect(() => siteOrigins()).not.toThrow();
  });
  it("normalizes origins and isolates public canonical metadata", () => {
    configure();
    vi.stubEnv("APP_ORIGIN", A + "/");
    const { html } = publicDocument("/", emptyWebsiteProfile);
    expect(html).toContain('href="https://evokeloop.com/"');
    expect(html).toContain('href="https://app.evokeloop.com/login"');
    expect(html).toContain('href="/privacy"');
  });
});
describe("domain routing and cross-origin safety", () => {
  let server: ReturnType<express.Express["listen"]>, port: number;
  beforeAll(async () => {
    configure();
    const app = express();
    app.set("trust proxy", 1);
    registerSiteRouting(app);
    app.post("/api/example", requireSameOrigin, (_q, r) =>
      r.json({ accepted: "app" })
    );
    app.post("/public/request", requirePublicSiteOrigin, (_q, r) =>
      r.json({ accepted: "site" })
    );
    app.get("*", (q, r) => r.type("text").send("served " + q.path));
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    port = (server.address() as any).port;
    vi.unstubAllEnvs();
  });
  afterAll(async () => {
    await new Promise<void>(r => server.close(() => r()));
  });
  const request = (
    host: string,
    path: string,
    method = "GET",
    headers: Record<string, string> = {}
  ) => {
    configure();
    return new Promise<{
      status: number;
      location?: string;
      headers: any;
      body: string;
    }>((resolve, reject) => {
      const q = httpRequest(
        {
          hostname: "127.0.0.1",
          port,
          path,
          method,
          headers: { host, ...headers },
        },
        r => {
          let body = "";
          r.setEncoding("utf8");
          r.on("data", c => (body += c));
          r.on("end", () =>
            resolve({
              status: r.statusCode!,
              location: r.headers.location,
              headers: r.headers,
              body,
            })
          );
        }
      );
      q.on("error", reject);
      q.end();
    });
  };
  it.each(["/", "/privacy", "/product/create", "/contact?topic=privacy"])(
    "serves public route %s",
    async p => {
      expect((await request("evokeloop.com", p)).status).toBe(200);
    }
  );
  it.each([
    "/app",
    "/app/library?view=needs_review",
    "/signup",
    "/login?next=%2Fapp%2Fcatalog",
    "/reset-password",
    "/invite/token",
    "/media/image",
  ])("moves app links safely %s", async p => {
    for (const h of ["evokeloop.com", OLD]) {
      const r = await request(h, p);
      expect(r.location).toBe(A + p);
      expect(r.headers["cache-control"]).toContain("no-store");
      expect(r.headers["referrer-policy"]).toBe("no-referrer");
      expect(r.headers["set-cookie"]).toBeUndefined();
    }
  });
  it("opens the dashboard at the app root", async () => {
    expect(
      (await request("app.evokeloop.com", "/?from=bookmark")).location
    ).toBe(A + "/app?from=bookmark");
  });
  it.each([
    "/privacy",
    "/product",
    "/contact",
    "/data-deletion",
    "/request-status/opaque",
  ])("keeps public pages on website %s", async p => {
    expect((await request("app.evokeloop.com", p)).location).toBe(W + p);
  });
  it("moves the old homepage", async () => {
    expect((await request(OLD, "/")).location).toBe(W + "/");
  });
  it("preserves hash email confirmation paths without verification on GET", async () => {
    const p = "/api/auth/recovery/confirm?token_hash=" + "a".repeat(64);
    expect((await request(OLD, p)).location).toBe(A + p);
  });
  it("does not transfer old PKCE verifiers", async () => {
    expect((await request(OLD, "/api/auth/callback?code=old")).location).toBe(
      A + "/login?error=signin"
    );
  });
  it("retains app routes and noindex", async () => {
    const r = await request("app.evokeloop.com", "/app/creatives/saved");
    expect(r.status).toBe(200);
    expect(r.headers["x-robots-tag"]).toBe("noindex, nofollow");
  });
  it("blocks dashboard indexing", async () => {
    expect((await request("app.evokeloop.com", "/robots.txt")).body).toBe(
      "User-agent: *\nDisallow: /\n"
    );
  });
  it("does not serve an SPA for unknown public paths", async () => {
    expect((await request("evokeloop.com", "/not-a-page")).status).toBe(404);
  });
  it("ignores forwarded-host spoofing", async () => {
    expect(
      (
        await request("evil.test", "/app", "GET", {
          "x-forwarded-host": "app.evokeloop.com",
        })
      ).status
    ).toBe(421);
    expect(
      (
        await request("evokeloop.com", "/app", "GET", {
          "x-forwarded-host": "evil.test",
        })
      ).location
    ).toBe(A + "/app");
  });
  it.each(["//evil.test", "/\\evil.test"])(
    "rejects ambiguous path %s",
    async p => {
      expect((await request(OLD, p)).status).toBe(400);
    }
  );
  it("accepts internal health probes", async () => {
    expect((await request("internal", "/healthz")).status).toBe(200);
  });
  it("isolates public form and app API origins", async () => {
    expect(
      (await request("evokeloop.com", "/public/request", "POST", { origin: W }))
        .status
    ).toBe(200);
    expect(
      (
        await request("app.evokeloop.com", "/api/example", "POST", {
          origin: A,
        })
      ).status
    ).toBe(200);
    for (const [h, p, o] of [
      ["evokeloop.com", "/public/request", A],
      ["app.evokeloop.com", "/api/example", W],
      ["evokeloop.com", "/api/example", A],
      [OLD, "/api/example", "https://" + OLD],
      ["app.evokeloop.com", "/public/request", W],
    ]) {
      const r = await request(h!, p!, "POST", { origin: o! });
      expect(r.status).toBe(403);
      expect(r.location).toBeUndefined();
    }
  });
});
