import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { beforeAll, afterAll, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("./db", () => ({ getDb: async () => state.db }));
import {
  users,
  organizations,
  organizationMemberships,
  products,
  productImages,
  brandKits,
} from "../drizzle/schema";
import { mcpWorkspaceRead } from "./lib/mcpWorkspaceRead";
const engine = new PGlite();
const guard = vi.fn(async () => {});
const service = mcpWorkspaceRead(1, guard);
beforeAll(async () => {
  state.db = drizzle(engine);
  await migrate(state.db, { migrationsFolder: "drizzle/postgres" });
  await state.db.insert(users).values([
    { id: 1, openId: "mcp-read-owner" },
    { id: 2, openId: "mcp-read-outsider" },
  ]);
  await state.db
    .insert(organizations)
    .values(
      [1, 2].map(id => ({
        id,
        name: `Read Org ${id}`,
        slug: `mcp-read-${id}`,
        createdByUserId: 1,
        createdAtMs: 1,
      }))
    );
  await state.db
    .insert(organizationMemberships)
    .values({
      organizationId: 1,
      userId: 1,
      role: "owner",
      status: "active",
      createdAtMs: 1,
    });
  await state.db
    .insert(products)
    .values(
      [1, 2, 3].map(id => ({
        id,
        organizationId: id === 3 ? 2 : 1,
        name: `Product ${id}`,
        dedupeKey: `mcp-product-${id}`,
        productUrl: "https://source.test/private?token=secret",
        specifications: {},
        provenance: { secret: "do-not-expose" },
        status: "approved",
        createdAtMs: 1,
        updatedAtMs: 1,
        mediaGroups: [
          {
            id: "case",
            name: "Case",
            role: "optional_component",
            eligible: true,
            declaredImages: 10,
            component: {
              sourceCode: "CASE-ONE",
              kind: "Chassis",
              amountMeaning: "unknown",
            },
          },
        ],
      }))
    );
  await state.db.insert(productImages).values(
    Array.from({ length: 12 }, (_, index) => ({
      organizationId: index === 11 ? 2 : 1,
      productId: index === 11 ? 3 : 1,
      sourceUrl: "https://source.test/private?token=secret",
      storageKey: "private/storage/key",
      url:
        index === 1
          ? "https://images.test/signed?token=secret"
          : `https://images.test/${index}.png`,
      isPrimary: index === 0 ? 1 : 0,
      createdAtMs: 1,
      media: {
        width: 700,
        height: 700,
        hasAlpha: true,
        retired: index === 0,
        candidates: ["https://source.test/private?token=secret"],
        selectedSourceUrl: "https://source.test/private?token=secret",
        references: [
          { groupId: "case", imageId: `view-${index}`, position: index },
        ],
        unavailableCandidates: 0,
      },
    }))
  );
  await state.db
    .insert(brandKits)
    .values(
      [1, 2].map(id => ({
        organizationId: id,
        name: `Brand ${id}`,
        voice: `Voice ${id}`,
        colors: ["#123456"],
        fonts: ["Inter"],
        status: "active",
        updatedByUserId: 1,
        updatedAtMs: 1,
        businessProfile: { secret: "do-not-expose" },
      }))
    );
}, 30000);
afterAll(async () => {
  await engine.close();
});

it("pages only owned products with bounded safe media and stable source identities", async () => {
  const first = await service.catalog({ organizationId: 1, limit: 1 });
  expect(first.items.map(p => p.id)).toEqual([1]);
  expect(first.nextAfterId).toBe(1);
  const product = first.items[0];
  expect(product.images).toHaveLength(8);
  expect(product.imagesTruncated).toBe(true);
  expect(product.images[0]).toMatchObject({
    url: null,
    width: 700,
    references: [{ imageId: "view-1", groupId: "case", position: 1 }],
  });
  expect(product.groups[0]).toMatchObject({
    component: { sourceCode: "CASE-ONE", kind: "Chassis" },
  });
  expect(JSON.stringify(first)).not.toMatch(
    /secret|storageKey|sourceUrl|candidates|provenance|view-0/
  );
  const second = await service.catalog({
    organizationId: 1,
    limit: 1,
    afterId: first.nextAfterId,
  });
  expect(second.items.map(p => p.id)).toEqual([2]);
  expect(second.nextAfterId).toBeNull();
});

it("reads only the explicit owned brand DTO", async () => {
  const result = await service.brand({ organizationId: 1 });
  expect(result.brand).toMatchObject({
    name: "Brand 1",
    voice: "Voice 1",
    status: "active",
  });
  expect(result.brand).not.toHaveProperty("businessProfile");
  expect(result.brand).not.toHaveProperty("updatedByUserId");
});

it("rejects foreign workspace and absent membership before invoking the connection guard", async () => {
  guard.mockClear();
  await expect(service.catalog({ organizationId: 2 })).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  await expect(
    mcpWorkspaceRead(2, guard).brand({ organizationId: 1 })
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(guard).not.toHaveBeenCalled();
});

it("rechecks connection scope/revocation inside the transaction on every read", async () => {
  const deny = vi.fn(async (tx: unknown, organizationId: number) => {
    expect(tx).toBeTruthy();
    expect(organizationId).toBe(1);
    throw new Error("Connection revoked");
  });
  await expect(
    mcpWorkspaceRead(1, deny).catalog({ organizationId: 1 })
  ).rejects.toThrow("Connection revoked");
  await expect(
    mcpWorkspaceRead(1, deny).brand({ organizationId: 1 })
  ).rejects.toThrow("Connection revoked");
  expect(deny).toHaveBeenCalledTimes(2);
});

it("rejects revoked membership immediately and does not call the connection guard", async () => {
  await state.db
    .update(organizationMemberships)
    .set({ status: "suspended" })
    .where(eq(organizationMemberships.userId, 1));
  guard.mockClear();
  try {
    await expect(service.catalog({ organizationId: 1 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(service.brand({ organizationId: 1 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(guard).not.toHaveBeenCalled();
  } finally {
    await state.db
      .update(organizationMemberships)
      .set({ status: "active" })
      .where(eq(organizationMemberships.userId, 1));
  }
});

it("rejects invalid bounds and unknown instructions before querying", async () => {
  for (const input of [
    { organizationId: 1, limit: 31 },
    { organizationId: 1, limit: 0 },
    { organizationId: 1, afterId: -1 },
    { organizationId: 1, instructions: "fetch https://evil.test" },
  ])
    await expect(service.catalog(input)).rejects.toThrow();
  await expect(
    service.brand({ organizationId: 1, extra: true })
  ).rejects.toThrow();
});

it("rejects a non-authoring role and makes no network calls for allowed reads", async () => {
  await state.db
    .update(organizationMemberships)
    .set({ role: "reviewer" })
    .where(eq(organizationMemberships.userId, 1));
  try {
    await expect(service.brand({ organizationId: 1 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  } finally {
    await state.db
      .update(organizationMemberships)
      .set({ role: "owner" })
      .where(eq(organizationMemberships.userId, 1));
  }
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("Network forbidden"));
  try {
    await service.catalog({ organizationId: 1 });
    await service.brand({ organizationId: 1 });
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    fetch.mockRestore();
  }
});
