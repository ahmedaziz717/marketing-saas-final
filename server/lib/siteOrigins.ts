import type { RequestHandler } from "express";
function originSetting(name: string): string | undefined {
  const value = process.env[name];
  if (!value) return;
  try {
    const u = new URL(value);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
    if (
      value !== value.trim() ||
      u.username ||
      u.password ||
      u.search ||
      u.hash ||
      u.pathname !== "/" ||
      !["https:", "http:"].includes(u.protocol) ||
      (process.env.NODE_ENV === "production" &&
        !local &&
        u.protocol !== "https:")
    )
      throw new Error();
    return u.origin;
  } catch {
    throw new Error(
      `${name} must be an origin without credentials, a path, query or fragment`
    );
  }
}
export function siteOrigins() {
  const app = originSetting("APP_ORIGIN");
  const website = originSetting("PUBLIC_SITE_ORIGIN") || app;
  if (process.env.PUBLIC_SITE_ORIGIN && !app)
    throw new Error("APP_ORIGIN is required with PUBLIC_SITE_ORIGIN");
  return { app, website, split: Boolean(app && website && app !== website) };
}
export const websiteOrigin = () =>
  siteOrigins().website || "https://frame-staging.onrender.com";
export function dashboardHref(path: "/login" | "/signup" | "/app") {
  const s = siteOrigins();
  return s.split ? s.app + path : path;
}
/** A marketing form's origin must never authorize dashboard API writes. */
export const requirePublicSiteOrigin: RequestHandler = (req, res, next) => {
  const expected = siteOrigins().website;
  if (!expected || req.headers.origin !== expected) {
    res.status(403).json({ error: "Request origin is not permitted." });
    return;
  }
  next();
};
