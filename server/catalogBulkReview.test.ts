import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("./db", () => ({ getDb: async () => state.db }));
import { catalogRouter } from "./routers/catalog";
import {
  activityEvents,
  organizationMemberships,
  organizations,
  products,
  users,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

let engine: PGlite;
let owner: ReturnType<typeof catalogRouter.createCaller>;
let creator: typeof owner;
let outsider: typeof owner;
let organizationId: number;
let otherOrganizationId: number;
let userId: number;
beforeAll(async () => {
  engine = new PGlite();
  for (const file of ["0000_long_mad_thinker.sql", "0001_wooden_gideon.sql"])
    await engine.exec(readFileSync(`drizzle/postgres/${file}`, "utf8"));
  await engine.exec(
    readFileSync("drizzle/postgres/0018_structured_product_facts.sql", "utf8")
  );
  state.db = drizzle(engine);
  const people = await state.db
    .insert(users)
    .values([
      { openId: "bulk-owner" },
      { openId: "bulk-creator" },
      { openId: "bulk-outsider" },
    ])
    .returning();
  userId = people[0].id;
  const orgs = await state.db
    .insert(organizations)
    .values([
      {
        name: "Catalog",
        slug: "bulk-catalog",
        createdByUserId: userId,
        createdAtMs: 1,
      },
      {
        name: "Other",
        slug: "bulk-other",
        createdByUserId: userId,
        createdAtMs: 1,
      },
    ])
    .returning();
  organizationId = orgs[0].id;
  otherOrganizationId = orgs[1].id;
  await state.db.insert(organizationMemberships).values([
    { organizationId, userId, role: "owner", status: "active", createdAtMs: 1 },
    {
      organizationId,
      userId: people[1].id,
      role: "creator",
      status: "active",
      createdAtMs: 1,
    },
  ]);
  [owner, creator, outsider] = people.map((user: any) =>
    catalogRouter.createCaller({
      user,
      req: {} as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    })
  );
}, 30000);
beforeEach(async () => {
  await state.db.delete(activityEvents);
  await state.db.delete(products);
});
afterAll(async () => {
  await engine.close();
});

async function add(values: Array<Partial<typeof products.$inferInsert>>) {
  return state.db
    .insert(products)
    .values(
      values.map((value, i) => ({
        organizationId,
        name: `Product ${i}`,
        dedupeKey: `product-${i}`,
        productUrl: `https://example.test/products/${i}`,
        recordType: "standalone",
        category: "Shoes",
        status: "pending",
        specifications: {},
        provenance: {},
        createdAtMs: 1,
        updatedAtMs: 1,
        ...value,
      }))
    )
    .returning();
}

it("approves every filtered match beyond one page and audits the actual set atomically", async () => {
  const matching = Array.from({ length: 225 }, (_, i) => ({
    name: `Sale shoe ${i}`,
  }));
  const seeded = await add([
    ...matching,
    { name: "Sale service", recordType: "service" },
    { name: "Sale hat", category: "Hats" },
    { name: "Sale rejected", status: "rejected" },
    { name: "Other shoe" },
    { name: "Sale other tenant", organizationId: otherOrganizationId },
  ]);
  const filter = {
    kind: "products" as const,
    search: "Sale",
    category: "Shoes",
    status: "pending" as const,
  };
  const page = await owner.overview({ organizationId, ...filter });
  expect(page.total).toBe(225);
  expect(page.products).toHaveLength(60);
  expect(
    await owner.bulkReview({ organizationId, filter, decision: "approved" })
  ).toEqual({ updated: 225 });
  const rows = await state.db.select().from(products);
  expect(rows.filter((row: any) => row.status === "approved")).toHaveLength(
    225
  );
  expect(
    seeded
      .slice(225)
      .map((item: any) => rows.find((row: any) => row.id === item.id)?.status)
  ).toEqual(["pending", "pending", "rejected", "pending", "pending"]);
  const [event] = await state.db.select().from(activityEvents);
  expect(event.entityId.length).toBeLessThanOrEqual(120);
  expect(event.payload).toMatchObject({ count: 225, filter });
  expect(event.payload.productIds).toHaveLength(225);
  expect(
    await owner.bulkReview({ organizationId, filter, decision: "approved" })
  ).toEqual({ updated: 0 });
  expect(await state.db.select().from(activityEvents)).toHaveLength(1);
});

it("treats search wildcards literally and scopes service approval separately", async () => {
  const rows = await add([
    { name: "100%_exact", recordType: "service" },
    { name: "10000exact", recordType: "service" },
    { name: "100%_exact product" },
  ]);
  const filter = { kind: "services" as const, search: "%_" };
  expect(
    (await owner.overview({ organizationId, ...filter })).products.map(
      row => row.id
    )
  ).toEqual([rows[0].id]);
  expect(
    await owner.bulkReview({ organizationId, filter, decision: "approved" })
  ).toEqual({ updated: 1 });
  expect(
    (
      await state.db.select().from(products).where(eq(products.id, rows[1].id))
    )[0].status
  ).toBe("pending");
});

it("rejects unauthorized review and cross-workspace IDs without partially updating", async () => {
  const rows = await add([{}, { organizationId: otherOrganizationId }]);
  for (const caller of [creator, outsider]) {
    await expect(
      caller.bulkReview({
        organizationId,
        filter: { kind: "products" },
        decision: "approved",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  }
  await expect(
    owner.bulkReview({
      organizationId,
      productIds: rows.map((row: any) => row.id),
      decision: "approved",
    })
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(
    (await state.db.select().from(products)).every(
      (row: any) => row.status === "pending"
    )
  ).toBe(true);
  expect(await state.db.select().from(activityEvents)).toHaveLength(0);
  expect(
    await owner.bulkReview({
      organizationId,
      productIds: [rows[0].id, rows[0].id],
      decision: "approved",
    })
  ).toEqual({ updated: 1 });
});

it("requires one explicit selection scope", async () => {
  await expect(
    owner.bulkReview({ organizationId, decision: "approved" })
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  await expect(
    owner.bulkReview({
      organizationId,
      productIds: [1],
      filter: {},
      decision: "approved",
    })
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
});

it("rolls back approvals if the audit record cannot be saved", async () => {
  await add([{}, {}]);
  await engine.exec(
    `ALTER TABLE app_private.activity_events ADD CONSTRAINT reject_bulk_test CHECK (action <> 'catalog.bulk_approved')`
  );
  try {
    await expect(
      owner.bulkReview({
        organizationId,
        filter: { kind: "products" },
        decision: "approved",
      })
    ).rejects.toThrow();
    expect(
      (await state.db.select().from(products)).every(
        (row: any) => row.status === "pending"
      )
    ).toBe(true);
  } finally {
    await engine.exec(
      `ALTER TABLE app_private.activity_events DROP CONSTRAINT reject_bulk_test`
    );
  }
});
