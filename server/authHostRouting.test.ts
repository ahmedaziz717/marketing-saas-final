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
import express from "express";
import { once } from "node:events";
import { request as httpRequest } from "node:http";
import { registerSiteRouting } from "./lib/siteRouting";
import { registerAuthRoutes, requireSameOrigin } from "./auth/routes";
import { authClient, resolveAuthUser } from "./auth/supabase";
import { dashboardHref } from "./lib/siteOrigins";

vi.mock("./auth/supabase", () => ({
  authClient: vi.fn(),
  resolveAuthUser: vi.fn(),
}));

const origin = "https://frame-staging.onrender.com";
const host = "frame-staging.onrender.com";
const auth = {
  signInWithPassword: vi.fn(),
  signInWithOtp: vi.fn(),
};
function configure() {
  vi.stubEnv("APP_ORIGIN", origin);
  vi.stubEnv("PUBLIC_SITE_ORIGIN", "");
}
let server: ReturnType<express.Express["listen"]>, port: number;
beforeAll(async () => {
  configure();
  const app = express();
  registerSiteRouting(app);
  app.use(express.json());
  app.use("/api", requireSameOrigin);
  registerAuthRoutes(app);
  app.get("*", (req, res) => res.send("served " + req.path));
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  port = (server.address() as { port: number }).port;
});
beforeEach(() => {
  configure();
  vi.mocked(authClient).mockReturnValue({ auth } as any);
  const user = { id: "test-user", email_confirmed_at: "2026-09-23" };
  auth.signInWithPassword.mockResolvedValue({ data: { user }, error: null });
  auth.signInWithOtp.mockResolvedValue({ error: null });
  vi.mocked(resolveAuthUser).mockResolvedValue({ id: 1 } as any);
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
});
function request(
  requestHost: string,
  path: string,
  method = "GET",
  headers: Record<string, string> = {},
  body?: object
) {
  return new Promise<{
    status: number;
    headers: import("node:http").IncomingHttpHeaders;
    body: string;
  }>((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers: {
          host: requestHost,
          "Content-Type": "application/json",
          ...headers,
        },
      },
      res => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", chunk => (data += chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode!, headers: res.headers, body: data })
        );
      }
    );
    req.on("error", reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
}

describe("login on custom domains before the domain cutover", () => {
  it.each(["/login", "/signup", "/app"] as const)(
    "links %s directly to the configured app origin",
    path => {
      expect(dashboardHref(path)).toBe(origin + path);
    }
  );
  it.each([
    "/login?next=%2Fapp%2Fcatalog",
    "/signup",
    "/reset-password",
    "/app/library?view=needs_review",
    "/invite/test-invite",
  ])("redirects %s before rendering a form on the wrong origin", async path => {
    for (const alias of ["evokeloop.com", "app.evokeloop.com"]) {
      const res = await request(alias, path);
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(origin + path);
      expect(res.headers["cache-control"]).toContain("no-store");
      expect(res.headers["referrer-policy"]).toBe("no-referrer");
      expect(res.headers["set-cookie"]).toBeUndefined();
    }
  });
  it("keeps the canonical login and public website available", async () => {
    expect((await request(host, "/login")).status).toBe(200);
    expect((await request("evokeloop.com", "/")).status).toBe(200);
    expect((await request("internal", "/healthz")).status).toBe(200);
  });
  it("handles HEAD like GET and ignores a spoofed forwarded host", async () => {
    const res = await request("evokeloop.com", "/login", "HEAD", {
      "x-forwarded-host": "evil.test",
    });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(origin + "/login");
  });
  it.each([
    "/api/auth/password",
    "/api/auth/email",
    "/api/auth/email/confirm",
    "/api/trpc/example",
  ])("never replays a POST to %s from an alias", async path => {
    const res = await request(
      "evokeloop.com",
      path,
      "POST",
      { origin },
      { email: "test@example.test", password: "test-password" }
    );
    expect(res.status).toBe(403);
    expect(res.headers.location).toBeUndefined();
    expect(authClient).not.toHaveBeenCalled();
  });
  it.each([
    "https://evokeloop.com",
    "https://app.evokeloop.com",
    "https://evil.test",
    "null",
    "",
  ])("still rejects an untrusted Origin: %s", async from => {
    const res = await request(
      host,
      "/api/auth/password",
      "POST",
      from ? { origin: from } : {},
      { email: "test@example.test", password: "test-password" }
    );
    expect(res.status).toBe(403);
    expect(authClient).not.toHaveBeenCalled();
  });
  it("allows password login on the canonical host and returns the dashboard", async () => {
    const res = await request(
      host,
      "/api/auth/password",
      "POST",
      { origin },
      { email: "test@example.test", password: "test-password" }
    );
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ redirectTo: "/app" });
    expect(auth.signInWithPassword).toHaveBeenCalledOnce();
  });
  it("keeps email sign-in and its callback on the canonical host", async () => {
    const res = await request(
      host,
      "/api/auth/email",
      "POST",
      { origin },
      { email: "test@example.test" }
    );
    expect(res.status).toBe(200);
    expect(auth.signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          shouldCreateUser: false,
          emailRedirectTo: origin + "/api/auth/callback?next=%2Fapp",
        }),
      })
    );
  });
  it("preserves token-hash confirmation links without redeeming them on GET", async () => {
    const path = "/api/auth/email/confirm?token_hash=" + "a".repeat(64);
    const res = await request("evokeloop.com", path);
    expect(res.headers.location).toBe(origin + path);
    expect(authClient).not.toHaveBeenCalled();
  });
  it("restarts PKCE flows whose host-only verifier cannot transfer", async () => {
    const res = await request(
      "evokeloop.com",
      "/api/auth/callback?code=test-code"
    );
    expect(res.headers.location).toBe(origin + "/login?error=signin");
    expect(authClient).not.toHaveBeenCalled();
  });
});
