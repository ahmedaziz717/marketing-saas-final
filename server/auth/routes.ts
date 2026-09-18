import type { Express, RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { authClient, resolveAuthUser } from "./supabase";

export function safeReturnPath(value: unknown): string {
  return typeof value === "string" && /^\/(?!\/)[^\\\x00-\x20]*$/.test(value)
    ? value
    : "/app";
}

export const requireSameOrigin: RequestHandler = (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (
    !process.env.APP_ORIGIN ||
    req.headers.origin !== process.env.APP_ORIGIN
  ) {
    res.status(403).json({ error: "Request origin is not permitted." });
    return;
  }
  next();
};

export function registerAuthRoutes(app: Express) {
  const limiter = () =>
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 20,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: "Too many attempts. Please try again in 15 minutes." },
    });
  // Email scanners may GET links. Only a deliberate form POST redeems recovery.
  app.get("/api/auth/recovery/confirm", (req, res) => {
    const token = z
      .string()
      .regex(/^[a-fA-F0-9]{40,128}$/)
      .safeParse(req.query.token_hash);
    res.set({
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      "X-Robots-Tag": "noindex, nofollow",
    });
    if (!token.success) return void res.redirect("/login?error=expired");
    res
      .type("html")
      .send(
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Reset your Frame password</title><style>body{background:#faf7f2;color:#16121c;font:16px system-ui;margin:0;min-height:100vh;display:grid;place-items:center}main{background:white;border:1px solid #ddd;border-radius:20px;padding:36px;max-width:420px;margin:24px}p{line-height:1.6;color:#625c70}button{background:#6331d6;color:white;border:0;border-radius:24px;padding:14px 24px;font:inherit;cursor:pointer;width:100%}a{color:#6331d6}</style></head><body><main><strong>Frame</strong><h1>Reset your password</h1><p>Click below to verify your email link and choose a new password.</p><form method="post" action="/api/auth/recovery/confirm"><input type="hidden" name="token_hash" value="${token.data}"><button type="submit">Continue to set password</button></form><p>If you did not request this, you can close this page.</p></main></body></html>`
      );
  });
  app.post("/api/auth/recovery/confirm", limiter(), async (req, res) => {
    const token = z
      .string()
      .regex(/^[a-fA-F0-9]{40,128}$/)
      .safeParse(req.body.token_hash);
    res.set("Cache-Control", "private, no-store");
    if (!token.success) return void res.redirect(303, "/login?error=expired");
    try {
      const { data, error } = await authClient(req, res).auth.verifyOtp({
        token_hash: token.data,
        type: "recovery",
      });
      if (
        error ||
        !data.user?.email_confirmed_at ||
        !(await resolveAuthUser(data.user))
      )
        return void res.redirect(303, "/login?error=expired");
      res.redirect(303, "/reset-password");
    } catch {
      res.redirect(303, "/login?error=signin");
    }
  });
  app.post("/api/auth/password", limiter(), async (req, res) => {
    const input = z
      .object({
        email: z.string().trim().email(),
        password: z.string().min(1).max(1024),
        returnTo: z.string().optional(),
      })
      .safeParse(req.body);
    if (!input.success)
      return void res
        .status(400)
        .json({ error: "Enter your email and password." });
    try {
      const client = authClient(req, res);
      const { data, error } = await client.auth.signInWithPassword({
        email: input.data.email.toLowerCase(),
        password: input.data.password,
      });
      if (error || !data.user || !data.user.email_confirmed_at)
        return void res.status(401).json({
          error:
            "Email or password is incorrect. You can also sign in with an emailed link.",
        });
      if (!(await resolveAuthUser(data.user)))
        throw new Error("Account unavailable");
      res
        .set("Cache-Control", "no-store")
        .json({ redirectTo: safeReturnPath(input.data.returnTo) });
    } catch {
      res.status(503).json({
        error: "Sign-in is temporarily unavailable. Please try again.",
      });
    }
  });
  app.post("/api/auth/password/reset", limiter(), async (req, res) => {
    const input = z
      .object({
        email: z.string().trim().email(),
        returnTo: z.string().optional(),
      })
      .safeParse(req.body);
    if (!input.success)
      return void res
        .status(400)
        .json({ error: "Enter a valid email address." });
    try {
      const callback = new URL("/api/auth/callback", process.env.APP_ORIGIN);
      callback.searchParams.set(
        "next",
        "/reset-password?next=" +
          encodeURIComponent(safeReturnPath(input.data.returnTo))
      );
      const { error } = await authClient(req, res).auth.resetPasswordForEmail(
        input.data.email.toLowerCase(),
        { redirectTo: callback.toString() }
      );
      // Do not distinguish an unknown email from an existing account.
      if (error) console.warn("Password reset email request was not accepted");
      res.set("Cache-Control", "no-store").json({ success: true });
    } catch {
      res.status(503).json({
        error: "Password reset is temporarily unavailable. Please try again.",
      });
    }
  });
  app.post("/api/auth/password/update", limiter(), async (req, res) => {
    const input = z
      .object({
        password: z.string().min(12).max(128),
        returnTo: z.string().optional(),
      })
      .safeParse(req.body);
    if (!input.success)
      return void res
        .status(400)
        .json({ error: "Use a password between 12 and 128 characters." });
    try {
      const client = authClient(req, res);
      const { data: identity, error: identityError } =
        await client.auth.getUser();
      if (identityError || !identity.user?.email_confirmed_at)
        return void res.status(401).json({
          error:
            "Open a new password-reset email in the browser where you requested it.",
        });
      if (!(await resolveAuthUser(identity.user)))
        return void res.status(403).json({
          error: "Your account is not ready. Please contact support.",
        });
      const { error } = await client.auth.updateUser({
        password: input.data.password,
      });
      if (error)
        return void res.status(400).json({
          error:
            "Password could not be saved. Choose a different strong password or request a fresh reset link.",
        });
      // Revoke other refresh sessions after a credential change; retain this browser.
      await client.auth.signOut({ scope: "others" });
      res
        .set("Cache-Control", "no-store")
        .json({ redirectTo: safeReturnPath(input.data.returnTo) });
    } catch {
      res.status(503).json({
        error:
          "Password could not be saved. Please request a new reset link and try again.",
      });
    }
  });
  app.post("/api/auth/email", limiter(), async (req, res) => {
    const input = z
      .object({ email: z.email(), returnTo: z.string().optional() })
      .safeParse(req.body);
    if (!input.success)
      return void res
        .status(400)
        .json({ error: "Enter a valid email address." });
    try {
      const returnTo = safeReturnPath(input.data.returnTo);
      const callback = new URL("/api/auth/callback", process.env.APP_ORIGIN);
      callback.searchParams.set("next", returnTo);
      const { error } = await authClient(req, res).auth.signInWithOtp({
        email: input.data.email.trim().toLowerCase(),
        options: {
          shouldCreateUser: process.env.AUTH_SIGNUP_ENABLED === "true",
          emailRedirectTo: callback.toString(),
        },
      });
      // Do not reveal whether an address already has an account.
      if (error) console.warn("Sign-in email request was not accepted");
      res.set("Cache-Control", "no-store").json({ success: true });
    } catch {
      res.status(503).json({
        error: "Sign-in is temporarily unavailable. Please try again.",
      });
    }
  });
  app.post("/api/auth/verify", limiter(), async (req, res) => {
    const input = z
      .object({
        email: z.email(),
        token: z.string().regex(/^\d{6,10}$/),
        returnTo: z.string().optional(),
      })
      .safeParse(req.body);
    if (!input.success)
      return void res
        .status(400)
        .json({ error: "Enter the code from your email." });
    try {
      const client = authClient(req, res);
      const { data, error } = await client.auth.verifyOtp({
        email: input.data.email.trim().toLowerCase(),
        token: input.data.token,
        type: "email",
      });
      if (error || !data.user)
        return void res
          .status(401)
          .json({ error: "That code is invalid or has expired." });
      if (!(await resolveAuthUser(data.user)))
        throw new Error("Unverified account");
      res
        .set("Cache-Control", "no-store")
        .json({ redirectTo: safeReturnPath(input.data.returnTo) });
    } catch {
      res
        .status(503)
        .json({ error: "Your account is not ready. Please contact support." });
    }
  });
  app.get("/api/auth/callback", async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (req.query.error) {
      const expired = req.query.error_code === "otp_expired";
      res.redirect(expired ? "/login?error=expired" : "/login?error=signin");
      return;
    }
    try {
      if (typeof req.query.code !== "string") throw new Error("Missing code");
      const { data, error } = await authClient(
        req,
        res
      ).auth.exchangeCodeForSession(req.query.code);
      if (error || !data.user || !(await resolveAuthUser(data.user)))
        throw new Error("Invalid session");
      res.redirect(safeReturnPath(req.query.next));
    } catch {
      res.redirect("/login?error=signin");
    }
  });
}
