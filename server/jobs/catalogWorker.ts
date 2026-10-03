import { and, asc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { users, websiteCrawlJobs } from "../../drizzle/schema";
import { getDb } from "../db";
import { crawlRouter } from "../routers/crawl";
import type { TrpcContext } from "../_core/context";
import {
  canonicalizeUrl,
  mergeDiscoveredUrls,
  parseSitemap,
  safeFetchText,
  sameSite,
} from "../lib/websiteCrawler";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export async function processNextWebsiteJob(db: Database) {
  const job = await db.transaction(async tx => {
    const [found] = await tx
      .select()
      .from(websiteCrawlJobs)
      .where(
        and(
          eq(websiteCrawlJobs.background, 1),
          inArray(websiteCrawlJobs.status, [
            "discovering",
            "crawling",
            "analyzing",
          ]),
          or(
            isNull(websiteCrawlJobs.leaseUntil),
            lt(websiteCrawlJobs.leaseUntil, Date.now())
          )
        )
      )
      .orderBy(asc(websiteCrawlJobs.updatedAtMs))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!found) return null;
    await tx
      .update(websiteCrawlJobs)
      .set({ leaseUntil: Date.now() + 600000 })
      .where(eq(websiteCrawlJobs.id, found.id));
    return found;
  });
  if (!job) return false;
  try {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, job.createdByUserId));
    const { requireOrganizationRole } = await import("../lib/access");
    await requireOrganizationRole(job.createdByUserId, job.organizationId, [
      "owner",
      "admin",
    ]);
    if (job.status === "discovering") {
      const state = job.discovery ?? { pending: [], visited: [], failures: [] };
      const target = state.pending[0];
      let urls = job.discoveredUrls;
      if (target) {
        try {
          const response = await safeFetchText(target);
          if (response.status >= 400)
            throw new Error(`HTTP ${response.status}`);
          const maps = target.endsWith("/robots.txt")
            ? Array.from(response.text.matchAll(/^sitemap:\s*(.+)$/gim), m =>
                m[1].trim()
              )
            : parseSitemap(response.text).sitemapLocs;
          for (const value of maps) {
            try {
              const url = canonicalizeUrl(new URL(value, job.sourceUrl));
              if (
                sameSite(url, job.sourceUrl) &&
                !state.visited.includes(url) &&
                !state.pending.includes(url)
              )
                state.pending.push(url);
            } catch {
              /* Ignore invalid sitemap references. */
            }
          }
          if (!target.endsWith("/robots.txt"))
            urls = mergeDiscoveredUrls(
              urls,
              parseSitemap(response.text).pageLocs,
              job.sourceUrl,
              job.maxPages
            );
        } catch {
          state.failures.push(target);
        }
        state.pending.shift();
        state.visited.push(target);
      }
      if (urls.length >= job.maxPages || state.visited.length > 5000)
        throw new Error(
          "The site exceeded safe discovery limits. Connect its store API for complete coverage."
        );
      await db
        .update(websiteCrawlJobs)
        .set({
          discovery: state,
          discoveredUrls: urls,
          pagesDiscovered: urls.length,
          status: state.pending.length ? "discovering" : "crawling",
          updatedAtMs: Date.now(),
        })
        .where(
          and(
            eq(websiteCrawlJobs.id, job.id),
            eq(websiteCrawlJobs.status, "discovering")
          )
        );
    } else {
      const caller = crawlRouter.createCaller({
        user,
        catalogWorker: true,
        req: {} as TrpcContext["req"],
        res: {} as TrpcContext["res"],
      });
      const input = {
        organizationId: job.organizationId,
        jobId: job.id,
        batchSize: 1,
      };
      if (job.status === "crawling") await caller.processBatch(input);
      else await caller.analyzeBatch(input);
    }
  } catch (error) {
    await db
      .update(websiteCrawlJobs)
      .set({
        status: "failed",
        errorMessage:
          error instanceof Error
            ? error.message
            : "Scan interrupted. Resume to retry.",
        updatedAtMs: Date.now(),
      })
      .where(
        and(
          eq(websiteCrawlJobs.id, job.id),
          inArray(websiteCrawlJobs.status, [
            "discovering",
            "crawling",
            "analyzing",
          ])
        )
      );
  } finally {
    await db
      .update(websiteCrawlJobs)
      .set({ leaseUntil: null })
      .where(eq(websiteCrawlJobs.id, job.id));
  }
  return true;
}
