import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import express, { type Express, type ErrorRequestHandler } from "express";
import { randomBytes, randomUUID } from "node:crypto";
import { rateLimit } from "express-rate-limit";
import {
  PUBLIC_PATHS,
  websiteRequestSchema,
  type WebsiteProfile,
} from "../../shared/publicWebsite";
import { PublicWebsite } from "./Website";
import { ARTICLES } from "./content";
import {
  makeFormToken,
  validFormToken,
  formReceiptToken,
  readWebsiteProfile,
  receiptHash,
  requestReceipt,
} from "../lib/publicWebsite";
import { websiteRequests } from "../../drizzle/websiteSchema";
import { getDb } from "../db";
import { requireSameOrigin } from "../auth/routes";

export const publicOrigin = () => {
  try {
    const u = new URL(
      process.env.APP_ORIGIN || "https://frame-staging.onrender.com"
    );
    return ["https:", "http:"].includes(u.protocol)
      ? u.origin
      : "https://frame-staging.onrender.com";
  } catch {
    return "https://frame-staging.onrender.com";
  }
};
const titles: Record<string, string> = {
  "/": "Frame | Create. Activate. Measure. Optimize.",
  "/product": "The Frame platform | A connected marketing workspace",
  "/product/create": "Create | Frame Content Studio & Asset Library",
  "/product/activate": "Activate | Frame publishing & channels",
  "/product/measure": "Measure | Frame marketing analytics",
  "/product/optimize": "Optimize | Frame product roadmap",
  "/integrations": "Integrations | Frame",
  "/pricing": "Proposed pricing | Frame",
  "/about": "About Frame | Business information",
  "/contact": "Contact Frame | Support & privacy requests",
  "/privacy": "Privacy notice | Frame",
  "/terms": "Preview terms | Frame",
  "/data-deletion": "Data deletion instructions | Frame",
  "/security": "Security & trust | Frame",
};
export function publicDocument(
  path: string,
  profile: WebsiteProfile,
  extra: Partial<React.ComponentProps<typeof PublicWebsite>> = {}
) {
  const title = titles[path] || "Request status | Frame";
  const description =
    ARTICLES[path]?.intro ||
    "Create content, activate approved campaigns and measure performance in Frame. Explore current preview capabilities and the roadmap for marketing optimization.";
  const nonce = randomBytes(16).toString("base64");
  const privatePage = path.startsWith("/request-status/");
  const noindex =
    privatePage || path === "/contact" || !profile.disclosuresApproved;
  const canonical = publicOrigin() + (privatePage ? "/contact" : path);
  const structured = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Frame",
    url: publicOrigin(),
    description,
    ...(profile.operatorName
      ? {
          publisher: {
            "@type": "Organization",
            name: profile.operatorName,
            ...(profile.operatorWebsite
              ? { url: profile.operatorWebsite }
              : {}),
          },
        }
      : {}),
  };
  const html =
    "<!doctype html>" +
    renderToStaticMarkup(
      <html lang="en">
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>{title}</title>
          <meta name="description" content={description} />
          <meta
            name="robots"
            content={noindex ? "noindex, follow" : "index, follow"}
          />
          <meta name="theme-color" content="#faf8f4" />
          <link rel="canonical" href={canonical} />
          <meta property="og:type" content="website" />
          <meta property="og:site_name" content="Frame" />
          <meta property="og:title" content={title} />
          <meta property="og:description" content={description} />
          <meta property="og:url" content={canonical} />
          <meta name="twitter:card" content="summary" />
          <link rel="icon" href="/website/favicon.svg" type="image/svg+xml" />
          <link rel="stylesheet" href="/website/site.css?v=public-20260921" />
          {!privatePage && (
            <script
              type="application/ld+json"
              nonce={nonce}
              dangerouslySetInnerHTML={{
                __html: JSON.stringify(structured).replace(/</g, "\\u003c"),
              }}
            />
          )}
        </head>
        <body>
          <PublicWebsite
            path={path}
            profile={profile}
            formToken={makeFormToken()}
            {...extra}
          />
        </body>
      </html>
    );
  return { html, nonce, privatePage, noindex };
}
export function registerPublicWebsite(app: Express) {
  const render = async (
    res: express.Response,
    path: string,
    extra: Partial<React.ComponentProps<typeof PublicWebsite>> = {},
    status = 200
  ) => {
    const { profile } = await readWebsiteProfile();
    const doc = publicDocument(path, profile, extra);
    res
      .status(status)
      .set({
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store",
        "Referrer-Policy": doc.privatePage ? "no-referrer" : "strict-origin",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Content-Security-Policy": `default-src 'none'; style-src 'self'; img-src 'self' data:; script-src 'nonce-${doc.nonce}'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
        ...(doc.noindex ? { "X-Robots-Tag": "noindex, follow" } : {}),
      })
      .send(doc.html);
  };
  for (const path of PUBLIC_PATHS)
    app.get(path, (req, res, next) => {
      const topic =
        typeof req.query.topic === "string" &&
        ["access", "demo", "support", "privacy", "deletion"].includes(
          req.query.topic
        )
          ? req.query.topic
          : "support";
      void render(res, path, { topic }).catch(next);
    });
  for (const [from, to] of Object.entries({
    "/privacy-policy": "/privacy",
    "/terms-of-service": "/terms",
    "/data-deletion-instructions": "/data-deletion",
  }))
    app.get(from, (_req, res) => res.redirect(308, to));
  app.get("/request-status/:token", async (req, res, next) => {
    try {
      const receipt = await requestReceipt(req.params.token);
      await render(
        res,
        "/request-status/receipt",
        { receipt },
        receipt ? 200 : 404
      );
    } catch {
      try {
        await render(
          res,
          "/request-status/receipt",
          { unavailable: true },
          503
        );
      } catch (error) {
        next(error);
      }
    }
  });
  app.get("/robots.txt", (_req, res) =>
    res
      .type("text")
      .send(
        `User-agent: *\nDisallow: /app\nDisallow: /api/\nDisallow: /media/\nDisallow: /manus-storage/\nDisallow: /request-status/\nDisallow: /public/request\nDisallow: /login\nDisallow: /signup\nSitemap: ${publicOrigin()}/sitemap.xml\n`
      )
  );
  app.get("/sitemap.xml", (_req, res) =>
    res
      .type("application/xml")
      .send(
        `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${PUBLIC_PATHS.map(p => `<url><loc>${publicOrigin().replace(/&/g, "&amp;")}${p}</loc></url>`).join("")}</urlset>`
      )
  );
  // Registered before the application's large upload parsers, with a bounded public body.
  app.post(
    "/public/request",
    requireSameOrigin,
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 5,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      handler: (_req, res, next) => {
        void render(
          res,
          "/contact",
          {
            error:
              "Too many submissions. Please wait 15 minutes before trying again.",
          },
          429
        ).catch(next);
      },
    }),
    express.urlencoded({ limit: "16kb", extended: false }),
    async (req, res, next) => {
      try {
        const parsed = websiteRequestSchema.safeParse(req.body);
        if (
          !parsed.success ||
          parsed.data.website ||
          !validFormToken(parsed.data.formToken)
        )
          return void (await render(
            res,
            "/contact",
            {
              error:
                "Please complete the required fields and submit again. Your form may have expired. No request was saved.",
            },
            400
          ));
        const db = await getDb();
        if (!db)
          return void (await render(
            res,
            "/contact",
            {
              error:
                "The request service is temporarily unavailable. Nothing was submitted; please try again later.",
            },
            503
          ));
        const { name, email, topic, workspace, message } = parsed.data;
        const token = formReceiptToken(parsed.data.formToken),
          now = Date.now();
        await db
          .insert(websiteRequests)
          .values({
            id: randomUUID(),
            receiptHash: receiptHash(token),
            name,
            email,
            topic,
            workspace,
            message,
            state: "received",
            createdAtMs: now,
            updatedAtMs: now,
          })
          .onConflictDoNothing({ target: websiteRequests.receiptHash });
        res
          .set({
            "Cache-Control": "no-store",
            "Referrer-Policy": "no-referrer",
          })
          .redirect(303, `/request-status/${token}`);
      } catch {
        try {
          await render(
            res,
            "/contact",
            {
              error:
                "We could not confirm that your request was saved. Please retry or contact the published support address.",
            },
            503
          );
        } catch (error) {
          next(error);
        }
      }
    }
  );
  const bodyErrors: ErrorRequestHandler = (error, _req, res, next) => {
    if (error?.type === "entity.too.large") {
      void render(
        res,
        "/contact",
        {
          error:
            "Your message is too large. Use at most 4,000 characters and do not attach files.",
        },
        413
      ).catch(next);
    } else next(error);
  };
  app.use("/public/request", bodyErrors);
}
