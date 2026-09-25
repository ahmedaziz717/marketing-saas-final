import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("./db", () => ({
  getDb: async () => state.db,
  closeDb: async () => {},
}));
import { appRouter } from "./routers";
import {
  activityEvents,
  organizations,
  organizationMemberships,
  users,
} from "../drizzle/schema";
import { appendActivity, verifyActivityChain } from "./lib/activity";
import { eq } from "drizzle-orm";
import type { TrpcContext } from "./_core/context";
let engine: PGlite, org: number, foreign: number, ownerId: number;
let owner: ReturnType<typeof appRouter.createCaller>,
  admin: typeof owner,
  creator: typeof owner,
  reviewer: typeof owner,
  publisher: typeof owner,
  outsider: typeof owner;
beforeAll(async () => {
  engine = new PGlite();
  for (const file of readdirSync("drizzle/postgres")
    .filter(f => f.endsWith(".sql"))
    .sort())
    await engine.exec(readFileSync("drizzle/postgres/" + file, "utf8"));
  state.db = drizzle(engine);
  const people = await state.db
    .insert(users)
    .values(
      ["owner", "admin", "creator", "reviewer", "publisher", "outsider"].map(
        name => ({ openId: "billing-" + name, name })
      )
    )
    .returning();
  ownerId = people[0].id;
  const workspaces = await state.db
    .insert(organizations)
    .values(
      ["billing", "other"].map(slug => ({
        slug,
        name: slug,
        createdByUserId: ownerId,
        createdAtMs: Date.now(),
      }))
    )
    .returning();
  org = workspaces[0].id;
  foreign = workspaces[1].id;
  await state.db
    .insert(organizationMemberships)
    .values(
      people.map((user: any, i: number) => ({
        userId: user.id,
        organizationId: i === 5 ? foreign : org,
        status: "active",
        role: i === 5 ? "owner" : user.name,
        createdAtMs: Date.now(),
      }))
    );
  [owner, admin, creator, reviewer, publisher, outsider] = people.map(
    (user: any) =>
      appRouter.createCaller({ user, req: {}, res: {} } as TrpcContext)
  );
});
afterAll(async () => {
  vi.restoreAllMocks();
  await engine?.close();
});
async function event(
  action: string,
  entityType: string,
  entityId: string,
  at: string,
  payload?: Record<string, unknown>,
  failed = false,
  workspace = org
) {
  const spy = vi.spyOn(Date, "now").mockReturnValue(Date.parse(at));
  try {
    await appendActivity({
      organizationId: workspace,
      actorUserId: ownerId,
      action,
      entityType,
      entityId,
      payload,
      outcome: failed ? "failure" : "success",
    });
  } finally {
    spy.mockRestore();
  }
}
describe.sequential("workspace billing preview and audit-backed usage", () => {
  it("does not silently select a paid subscription or fabricate credits", async () => {
    const result = await owner.billing.summary({
      organizationId: org,
      month: "2026-09",
    });
    expect(result.selectedPreviewPlanId).toBeNull();
    expect(result.chargesEnabled).toBe(false);
    expect(result.enforcement).toBe(false);
    expect(result.creditsUsed).toBeNull();
    expect(result.usage.every(m => m.quantity === 0)).toBe(true);
    expect(result.inventory.activeSeats).toBe(5);
  });
  it("allows membership-scoped entitlement reads without granting billing access", async () => {
    expect(
      (
        await creator.billing.entitlements({ organizationId: org })
      ).features.find(f => f.feature.id === "attribution")?.access
    ).toBe("planned");
    for (const user of [creator, reviewer, publisher, outsider])
      await expect(
        user.billing.summary({ organizationId: org, month: "2026-09" })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      outsider.billing.entitlements({ organizationId: org })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("saves only an authorized explicit preview and retains audit integrity", async () => {
    for (const user of [creator, reviewer, publisher, outsider])
      await expect(
        user.billing.selectPreviewPlan({
          organizationId: org,
          planId: "scale",
          revision: 0,
          previewOnly: true,
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await owner.billing.selectPreviewPlan({
      organizationId: org,
      planId: "growth",
      revision: 0,
      previewOnly: true,
    });
    const result = await owner.billing.summary({
      organizationId: org,
      month: "2026-09",
    });
    expect(result.selectedPreviewPlanId).toBe("growth");
    expect(result.revision).toBeGreaterThan(0);
    expect(result.enforcement).toBe(false);
    expect(result.chargesEnabled).toBe(false);
    await expect(
      admin.billing.selectPreviewPlan({
        organizationId: org,
        planId: "launch",
        revision: 0,
        previewOnly: true,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await owner.billing.selectPreviewPlan({
      organizationId: org,
      planId: "growth",
      revision: 0,
      previewOnly: true,
    });
    expect(
      (await owner.billing.summary({ organizationId: org, month: "2026-09" }))
        .revision
    ).toBe(result.revision);
    await admin.billing.selectPreviewPlan({
      organizationId: org,
      planId: "scale",
      revision: result.revision,
      previewOnly: true,
    });
    expect(
      verifyActivityChain(
        await state.db
          .select()
          .from(activityEvents)
          .where(eq(activityEvents.organizationId, org))
      )
    ).toBe(true);
  });
  it("rejects invalid plan identifiers and non-preview writes", async () => {
    await expect(
      owner.billing.selectPreviewPlan({
        organizationId: org,
        planId: "free" as any,
        revision: 0,
        previewOnly: true,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      owner.billing.selectPreviewPlan({
        organizationId: org,
        planId: "growth",
        revision: 0,
        previewOnly: false as any,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("counts retained successful output events once with UTC boundaries and tenant isolation", async () => {
    await event(
      "creative_generation.completed",
      "creative_job",
      "1",
      "2026-09-01T00:00:00Z",
      { variantCount: 3 }
    );
    await event(
      "creative_generation.completed",
      "creative_job",
      "1",
      "2026-09-02T00:00:00Z",
      { variantCount: 3 }
    );
    await event(
      "creative_generation.completed",
      "creative_job",
      "1",
      "2026-10-01T00:00:00Z",
      { variantCount: 3 }
    );
    await event(
      "creative_generation.completed",
      "creative_job",
      "2",
      "2026-09-30T23:59:59Z",
      { variantCount: 2 }
    );
    await event(
      "creative_generation.completed",
      "creative_job",
      "3",
      "2026-09-12T00:00:00Z",
      { variantCount: 8 },
      true
    );
    await event(
      "creative_generation.completed",
      "creative_job",
      "4",
      "2026-09-12T00:00:00Z",
      { variantCount: "not a number" }
    );
    await event(
      "creative_generation.completed",
      "creative_job",
      "5",
      "2026-09-12T00:00:00Z",
      { variantCount: 90 },
      false,
      foreign
    );
    await event(
      "publication.ai_drafted",
      "publication",
      "caption1",
      "2026-09-12T00:00:00Z"
    );
    await event(
      "publication.ai_drafted",
      "publication",
      "caption1",
      "2026-09-13T00:00:00Z"
    );
    await event(
      "asset_library.uploaded",
      "library_asset",
      "asset:1",
      "2026-09-12T00:00:00Z"
    );
    await event(
      "website_crawl.review_ready",
      "website_crawl_job",
      "scan1",
      "2026-09-12T00:00:00Z"
    );
    await event(
      "creative_generation.completed",
      "creative_job",
      "new-month",
      "2026-10-01T00:00:00Z",
      { variantCount: 1 }
    );
    const result = await owner.billing.summary({
      organizationId: org,
      month: "2026-09",
    });
    expect(result.usage.map(m => m.quantity)).toEqual([5, 1, 1, 1]);
    const october = await owner.billing.summary({
      organizationId: org,
      month: "2026-10",
    });
    expect(october.usage.map(m => m.quantity)).toEqual([1, 0, 0, 0]);
  });
  it("does not allow malformed month queries", async () => {
    await expect(
      owner.billing.summary({ organizationId: org, month: "2026-13" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
