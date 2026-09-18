import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerAuthRoutes } from "./routes";
import { authClient, resolveAuthUser } from "./supabase";
vi.mock("./supabase", () => ({
  authClient: vi.fn(),
  resolveAuthUser: vi.fn(),
}));
const handlers = new Map<string, any>();
registerAuthRoutes({
  post: (path: string, ...h: any[]) => handlers.set(path, h.at(-1)),
  get: () => {},
} as any);
const user = { id: "verified-user", email_confirmed_at: "2026-01-01" };
const auth = {
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
