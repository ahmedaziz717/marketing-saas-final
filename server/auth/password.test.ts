import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerAuthRoutes } from "./routes";
import { authClient, resolveAuthUser } from "./supabase";
vi.mock("./supabase", () => ({
  authClient: vi.fn(),
  resolveAuthUser: vi.fn(),
}));
const handlers = new Map<string, any>();
const gets = new Map<string, any>();
registerAuthRoutes({
  post: (path: string, ...h: any[]) => handlers.set(path, h.at(-1)),
  get: (path: string, ...h: any[]) => gets.set(path, h.at(-1)),
} as any);
const user = { id: "verified-user", email_confirmed_at: "2026-01-01" };
const auth = {
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  signInWithPassword: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  getUser: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
};
async function request(path: string, body: any) {
  const res: any = {
    status: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    json: vi.fn(),
  };
  await handlers.get("/api/auth/password" + path)({ body }, res);
  return res;
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("APP_ORIGIN", "https://frame.example.test");
  vi.mocked(authClient).mockReturnValue({ auth } as any);
  vi.mocked(resolveAuthUser).mockResolvedValue({ id: 42 } as any);
  auth.signInWithPassword.mockResolvedValue({ data: { user }, error: null });
  auth.getUser.mockResolvedValue({ data: { user }, error: null });
  auth.updateUser.mockResolvedValue({ error: null });
  auth.signOut.mockResolvedValue({ error: null });
  auth.resetPasswordForEmail.mockResolvedValue({ error: null });
});
describe("password authentication", () => {
  it("uses the existing verified identity and rejects external return URLs", async () => {
    const res = await request("", {
      email: "Member@example.test",
      password: "correct-password",
      returnTo: "https://evil.test",
    });
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: "member@example.test",
      password: "correct-password",
    });
    expect(resolveAuthUser).toHaveBeenCalledWith(user);
    expect(res.json).toHaveBeenCalledWith({ redirectTo: "/app" });
  });
  it("does not resolve an account on invalid credentials", async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { message: "wrong" },
    });
    const res = await request("", {
      email: "member@example.test",
      password: "wrong",
    });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(resolveAuthUser).not.toHaveBeenCalled();
  });
  it("never updates credentials without a verified session", async () => {
    auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "expired" },
    });
    const res = await request("/update", { password: "new-long-password" });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
  it("rejects weak passwords before contacting the provider", async () => {
    const res = await request("/update", { password: "short" });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(auth.getUser).not.toHaveBeenCalled();
  });
  it("updates only the authenticated user and revokes other refresh sessions", async () => {
    const res = await request("/update", {
      password: "new-long-password",
      userId: "someone-else",
      returnTo: "/app/settings",
    });
    expect(auth.updateUser).toHaveBeenCalledWith({
      password: "new-long-password",
    });
    expect(resolveAuthUser).toHaveBeenCalledWith(user);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "others" });
    expect(res.json).toHaveBeenCalledWith({ redirectTo: "/app/settings" });
  });
  it("uses the existing PKCE callback for recovery and preserves local destinations", async () => {
    await request("/reset", {
      email: "Member@example.test",
      returnTo: "/invite/abc",
    });
    const [email, options] = auth.resetPasswordForEmail.mock.calls[0];
    expect(email).toBe("member@example.test");
    const callback = new URL(options.redirectTo);
    expect(callback.origin + callback.pathname).toBe(
      "https://frame.example.test/api/auth/callback"
    );
    expect(callback.searchParams.get("next")).toBe(
      "/reset-password?next=%2Finvite%2Fabc"
    );
  });
  it("does not expose whether a reset address exists", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    auth.resetPasswordForEmail.mockResolvedValue({
      error: { message: "unknown account" },
    });
    const res = await request("/reset", { email: "unknown@example.test" });
    expect(res.json).toHaveBeenCalledWith({ success: true });
    warn.mockRestore();
  });
});

it("handles expired callback links without starting session refresh", async () => {
  const res: any = { set: vi.fn().mockReturnThis(), redirect: vi.fn() };
  await gets.get("/api/auth/callback")(
    { query: { error: "access_denied", error_code: "otp_expired" } },
    res
  );
  expect(res.redirect).toHaveBeenCalledWith("/login?error=expired");
  expect(authClient).not.toHaveBeenCalled();
});

describe("recovery email confirmation", () => {
  it.each(["a".repeat(64), "pkce_" + "a".repeat(56)])(
    "does not consume a token on GET, including PKCE: %s",
    async token => {
      const res: any = {
        set: vi.fn().mockReturnThis(),
        type: vi.fn().mockReturnThis(),
        send: vi.fn(),
        redirect: vi.fn(),
      };
      for (let i = 0; i < 3; i++)
        await gets.get("/api/auth/recovery/confirm")(
          { query: { token_hash: token } },
          res
        );
      expect(authClient).not.toHaveBeenCalled();
      expect(res.send).toHaveBeenCalledWith(
        expect.stringContaining('method="post"')
      );
      expect(res.set).toHaveBeenCalledWith(
        expect.objectContaining({ "Referrer-Policy": "strict-origin" })
      );
    }
  );
  it("rejects malformed tokens without reflecting them into HTML", async () => {
    const res: any = { set: vi.fn().mockReturnThis(), redirect: vi.fn() };
    await gets.get("/api/auth/recovery/confirm")(
      { query: { token_hash: "<script>" } },
      res
    );
    expect(res.redirect).toHaveBeenCalledWith("/login?error=expired");
    expect(authClient).not.toHaveBeenCalled();
  });
  it.each(["b".repeat(64), "pkce_" + "b".repeat(56)])(
    "redeems recovery after POST preserving the token: %s",
    async token => {
      auth.verifyOtp.mockResolvedValue({ data: { user }, error: null });
      const res: any = { set: vi.fn().mockReturnThis(), redirect: vi.fn() };
      await handlers.get("/api/auth/recovery/confirm")(
        { body: { token_hash: token } },
        res
      );
      expect(auth.verifyOtp).toHaveBeenCalledWith({
        token_hash: token,
        type: "recovery",
      });
      expect(resolveAuthUser).toHaveBeenCalledWith(user);
      expect(res.redirect).toHaveBeenCalledWith(303, "/reset-password");
    }
  );
  it("does not accept an invalid or consumed recovery token", async () => {
    auth.verifyOtp.mockResolvedValue({
      data: { user: null },
      error: { message: "expired" },
    });
    const res: any = { set: vi.fn().mockReturnThis(), redirect: vi.fn() };
    await handlers.get("/api/auth/recovery/confirm")(
      { body: { token_hash: "b".repeat(64) } },
      res
    );
    expect(resolveAuthUser).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(303, "/login?error=expired");
  });
});

async function emailRequest(path: string, body: any) {
  const res: any = {
    status: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    json: vi.fn(),
  };
  await handlers.get(path)({ body }, res);
  return res;
}
it("signup requires its feature flag and does not create an account when disabled", async () => {
  vi.stubEnv("AUTH_SIGNUP_ENABLED", "false");
  const res = await emailRequest("/api/auth/signup", {
    email: "new@example.test",
  });
  expect(res.status).toHaveBeenCalledWith(403);
  expect(auth.signInWithOtp).not.toHaveBeenCalled();
});
it("signup verifies email then routes directly to password setup preserving the destination", async () => {
  vi.stubEnv("AUTH_SIGNUP_ENABLED", "true");
  auth.signInWithOtp.mockResolvedValue({ error: null });
  await emailRequest("/api/auth/signup", {
    email: "New@example.test",
    returnTo: "/invite/abc",
  });
  const input = auth.signInWithOtp.mock.calls[0][0];
  expect(input.email).toBe("new@example.test");
  expect(input.options.shouldCreateUser).toBe(true);
  expect(input.password).toBeUndefined();
  expect(new URL(input.options.emailRedirectTo).searchParams.get("next")).toBe(
    "/reset-password?next=%2Finvite%2Fabc"
  );
  expect(resolveAuthUser).not.toHaveBeenCalled();
});
it("email login never silently registers new users", async () => {
  auth.signInWithOtp.mockResolvedValue({ error: null });
  await emailRequest("/api/auth/email", { email: "new@example.test" });
  expect(auth.signInWithOtp.mock.calls[0][0].options.shouldCreateUser).toBe(
    false
  );
});
it("does not report successful reset delivery when the provider rate limits it", async () => {
  auth.resetPasswordForEmail.mockResolvedValue({
    error: { status: 429, code: "over_email_send_rate_limit" },
  });
  const res = await request("/reset", { email: "member@example.test" });
  expect(res.status).toHaveBeenCalledWith(429);
  expect(res.json).not.toHaveBeenCalledWith({ success: true });
});

describe("cross-browser email confirmation", () => {
  it("does not exchange or consume a signup link during GET", async () => {
    const res: any = {
      set: vi.fn().mockReturnThis(),
      type: vi.fn().mockReturnThis(),
      send: vi.fn(),
      redirect: vi.fn(),
    };
    await gets.get("/api/auth/callback")(
      {
        query: {
          token_hash: "pkce_" + "a".repeat(56),
          next: "/reset-password?next=%2Fapp",
        },
      },
      res
    );
    expect(authClient).not.toHaveBeenCalled();
    expect(res.send).toHaveBeenCalledWith(
      expect.stringContaining('action="/api/auth/email/confirm"')
    );
  });
  it.each(["/reset-password?next=%2Fapp", "/app", "https://evil.test"])(
    "verifies without a cookie and safely redirects: %s",
    async next => {
      auth.verifyOtp.mockResolvedValue({ data: { user }, error: null });
      const res: any = { set: vi.fn().mockReturnThis(), redirect: vi.fn() };
      await handlers.get("/api/auth/email/confirm")(
        { body: { token_hash: "pkce_" + "b".repeat(56), next } },
        res
      );
      expect(auth.verifyOtp).toHaveBeenCalledWith({
        token_hash: "pkce_" + "b".repeat(56),
        type: "email",
      });
      expect(res.redirect).toHaveBeenCalledWith(
        303,
        next.startsWith("/") ? next : "/app"
      );
    }
  );
  it("does not authenticate an invalid token", async () => {
    auth.verifyOtp.mockResolvedValue({
      data: { user: null },
      error: { code: "otp_expired", status: 403 },
    });
    const res: any = { set: vi.fn().mockReturnThis(), redirect: vi.fn() };
    await handlers.get("/api/auth/email/confirm")(
      { body: { token_hash: "a".repeat(64) } },
      res
    );
    expect(resolveAuthUser).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(303, "/login?error=expired");
  });
  it("escapes a local return path before reflecting it into HTML", async () => {
    const res: any = {
      set: vi.fn().mockReturnThis(),
      type: vi.fn().mockReturnThis(),
      send: vi.fn(),
    };
    await gets.get("/api/auth/email/confirm")(
      { query: { token_hash: "a".repeat(64), next: '/x?value="<tag>&' } },
      res
    );
    expect(res.send).toHaveBeenCalledWith(
      expect.stringContaining("/x?value=&quot;&lt;tag&gt;&amp;")
    );
  });
});
