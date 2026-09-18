import { describe, it, expect, vi, afterEach } from "vitest";
import { safeReturnPath, requireSameOrigin } from "./auth/routes";
import { normalizeStorageKey } from "./storage";
import { authClient } from "./auth/supabase";
import { createServerClient } from "@supabase/ssr";

vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn(() => ({})) }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("independent authentication boundaries", () => {
  it.each([
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "/\nevil.test",
    "/\t/evil.test",
  ])("rejects external or ambiguous login return paths: %s", path => {
    expect(safeReturnPath(path)).toBe("/app");
  });
  it("retains a company invitation or creative route after signing in", () => {
    expect(safeReturnPath("/invite/abc?next=review")).toBe(
      "/invite/abc?next=review"
    );
  });
  it("rejects cross-origin writes even if cookies are present", () => {
    vi.stubEnv("APP_ORIGIN", "https://frame.example.test");
    const next = vi.fn();
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    requireSameOrigin(
      {
        method: "POST",
        headers: { origin: "https://evil.test", cookie: "session=present" },
      } as any,
      res,
      next
    );
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
  it("writes Supabase refresh cookies as HttpOnly with correct Express millisecond expiry", () => {
    vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test-publishable");
    vi.stubEnv("NODE_ENV", "production");
    const res: any = { cookie: vi.fn(), setHeader: vi.fn() };
    authClient({ headers: { cookie: "sb-test=value" } } as any, res);
    const options = vi.mocked(createServerClient).mock.calls[0][2] as any;
    options.cookies.setAll([
      { name: "sb-test", value: "refreshed", options: { maxAge: 60 } },
    ]);
    expect(res.cookie).toHaveBeenCalledWith(
      "sb-test",
      "refreshed",
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 60_000,
      })
    );
  });
  it.each([
    "../other.png",
    "/absolute.png",
    "org-1/../other.png",
    "org-1\\other.png",
  ])("rejects unsafe storage paths: %s", key => {
    expect(() => normalizeStorageKey(key)).toThrow();
  });
});

describe("closed authentication responses", () => {
  it.each(["headersSent", "writableEnded", "destroyed"])(
    "ignores late cookie writes when %s",
    flag => {
      vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
      vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test-publishable");
      const res: any = { [flag]: true, cookie: vi.fn(), setHeader: vi.fn() };
      authClient({ headers: { cookie: "sb-test=value" } } as any, res);
      const options = vi.mocked(createServerClient).mock.calls[0][2] as any;
      expect(() =>
        options.cookies.setAll([
          { name: "sb-test", value: "refreshed", options: {} },
        ])
      ).not.toThrow();
      expect(res.setHeader).not.toHaveBeenCalled();
      expect(res.cookie).not.toHaveBeenCalled();
    }
  );
});
