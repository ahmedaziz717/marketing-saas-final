import "dotenv/config";
import { registerSiteRouting } from "../lib/siteRouting";
import { registerPublicWebsite } from "../public/routes";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerAuthRoutes, requireSameOrigin } from "../auth/routes";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { sql } from "drizzle-orm";
import { registerChannelOAuth } from "../lib/channelConnections";
import { getDb, closeDb } from "../db";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  app.set("trust proxy", 1);
  const server = createServer(app);
  registerSiteRouting(app);
  registerPublicWebsite(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.use(
    "/api",
    (_req, res, next) => {
      res.set("Cache-Control", "private, no-store");
      next();
    },
    requireSameOrigin
  );
  app.get("/healthz", async (_req, res) => {
    try {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.execute(sql`select 1 from app_private.users limit 1`);
      res.set("Cache-Control", "no-store").json({ ok: true });
    } catch {
      res.status(503).json({ ok: false });
    }
  });
  registerStorageProxy(app);
  registerAuthRoutes(app);
  registerChannelOAuth(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port =
    process.env.NODE_ENV === "production"
      ? preferredPort
      : await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
  process.on("SIGTERM", () => {
    server.close(() => {
      void closeDb().finally(() => process.exit(0));
    });
  });
}

startServer().catch(() => {
  console.error("Application startup failed");
  process.exitCode = 1;
});
