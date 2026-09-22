import type { Express } from "express";
import { PUBLIC_PATHS } from "../../shared/publicWebsite";
import { siteOrigins } from "./siteOrigins";
const publicPaths = new Set<string>([
  ...PUBLIC_PATHS,
  "/privacy-policy",
  "/terms-of-service",
  "/data-deletion-instructions",
  "/robots.txt",
  "/sitemap.xml",
]);
const under = (p: string, prefix: string) =>
  p === prefix || p.startsWith(prefix + "/");
const publicPath = (p: string) =>
  publicPaths.has(p) || under(p, "/request-status") || p === "/public/request";
const appPath = (p: string) =>
  ["/app", "/api", "/media", "/manus-storage", "/invite"].some(v =>
    under(p, v)
  ) || ["/login", "/signup", "/reset-password", "/404"].includes(p);
/** Inert until separate PUBLIC_SITE_ORIGIN and APP_ORIGIN are configured. */
export function registerSiteRouting(app: Express) {
  const s = siteOrigins();
  if (!s.split || !s.app || !s.website) return;
  const dashboard = new URL(s.app),
    website = new URL(s.website);
  if (dashboard.host === website.host)
    throw new Error("Separate sites require different hostnames");
  const oldHosts = new Set<string>();
  for (const value of (process.env.LEGACY_SITE_ORIGINS || "")
    .split(",")
    .filter(Boolean)) {
    const u = new URL(value.trim());
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.search ||
      u.hash ||
      u.pathname !== "/"
    )
      throw new Error("LEGACY_SITE_ORIGINS must contain HTTPS origins only");
    oldHosts.add(u.host);
  }
  if (oldHosts.has(dashboard.host) || oldHosts.has(website.host))
    throw new Error("Canonical sites cannot also be legacy sites");
  app.use((req, res, next) => {
    const read = ["GET", "HEAD"].includes(req.method);
    if (read && req.path === "/healthz") return next();
    const raw = req.originalUrl;
    if (
      !raw.startsWith("/") ||
      raw.startsWith("//") ||
      /[\\\x00-\x20]/.test(raw)
    )
      return void res.status(400).send("Invalid request path.");
    // Do not derive canonical destinations from Origin or X-Forwarded-Host.
    const host = (req.headers.host || "").toLowerCase();
    const isApp = host === dashboard.host || host === dashboard.host + ":443";
    const isSite = host === website.host || host === website.host + ":443";
    const isOld = oldHosts.has(host);
    if (!isApp && !isSite && !isOld)
      return void res
        .status(421)
        .set("Cache-Control", "no-store")
        .send("Unknown site hostname.");
    if (isApp || isOld) res.set("X-Robots-Tag", "noindex, nofollow");
    const redirect = (origin: string, path = raw) => {
      res.set({
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
      });
      res.redirect(302, origin + path);
    };
    const reject = () => {
      res
        .status(403)
        .set("Cache-Control", "no-store")
        .json({
          error:
            "This address has moved. Reload the page at the correct site before submitting.",
        });
    };
    if (isOld) {
      if (!read) return reject();
      // Host-only PKCE verifier cookies cannot move across domains.
      if (
        req.path === "/api/auth/callback" &&
        typeof req.query.code === "string"
      )
        return redirect(dashboard.origin, "/login?error=signin");
      return redirect(
        publicPath(req.path) || under(req.path, "/website")
          ? website.origin
          : dashboard.origin
      );
    }
    if (
      read &&
      (under(req.path, "/website") ||
        under(req.path, "/assets") ||
        req.path === "/favicon.ico")
    )
      return next();
    if (isApp) {
      if (req.path === "/robots.txt" && read)
        return void res.type("text").send("User-agent: *\nDisallow: /\n");
      if (req.path === "/" && read)
        return redirect(
          dashboard.origin,
          "/app" + (raw.includes("?") ? raw.slice(raw.indexOf("?")) : "")
        );
      if (publicPath(req.path))
        return read ? redirect(website.origin) : reject();
      return next();
    }
    if (appPath(req.path)) return read ? redirect(dashboard.origin) : reject();
    if (publicPath(req.path)) return next();
    res.status(404).type("text").send("Page not found.");
  });
}
