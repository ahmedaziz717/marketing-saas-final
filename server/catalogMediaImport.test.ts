import { beforeAll, afterAll, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { users, organizations, productImages } from "../drizzle/schema";
import { catalogEntrySchema } from "../shared/catalog";
import { catalogImageEligible, catalogDefaultImage, galleryGroups } from "../shared/catalogMedia";
const state = vi.hoisted(() => ({
  bytes: new Map<string, Buffer>(),
  writes: 0,
}));
vi.mock("./lib/websiteCrawler", () => ({
  safeFetchImage: async (url: string) => {
    const data = state.bytes.get(url);
    if (!data) throw new Error("HTTP 404");
    return { data, contentType: "image/png" };
  },
}));
vi.mock("./storage", () => ({
  storagePut: async () => {
    state.writes++;
    return {
      key: `original-${state.writes}.png`,
      url: `/media/${state.writes}`,
    };
  },
}));
import { importCatalogEntry } from "./lib/catalogImport";
const engine = new PGlite();
let db: any;
beforeAll(async () => {
  db = drizzle(engine);
  await migrate(db, { migrationsFolder: "drizzle/postgres" });
  await db.insert(users).values({ id: 770, openId: "media-test" });
  for (const id of [770, 771])
    await db
      .insert(organizations)
      .values({
        id,
        name: `Org ${id}`,
        slug: `media-${id}`,
        createdByUserId: 770,
        createdAtMs: 1,
      });
  for (const [name, width] of [
    ["small", 60],
    ["large", 600],
    ["back", 500],
    ["original", 1000],
    ["equal", 600],
    ["smaller", 200],
  ] as const)
    state.bytes.set(
      `https://images.test/${name}.png`,
      await sharp({
        create: {
          width,
          height: width,
          channels: 4,
          background: { r: 20, g: 40, b: 60, alpha: 0.5 },
        },
      })
        .png()
        .toBuffer()
    );
}, 30000);
afterAll(() => engine.close());
const entry = () =>
  catalogEntrySchema.parse({
    name: "System",
    productUrl: "https://shop.test/system",
    imageUrl: "https://images.test/small.png",
    mediaGroups: [
      {
        id: "system",
        name: "System gallery",
        role: "system",
        expectedCount: 2,
        images: [
          {
            id: "front",
            candidates: [
              "https://images.test/small.png",
              "https://images.test/large.png",
            ],
          },
          { id: "back", candidates: ["https://images.test/back.png"] },
        ],
      },
      {
        id: "case",
        name: "Optional case",
        role: "optional_component",
        images: [
          {
            id: "front",
            candidates: [
              "https://images.test/small.png",
              "https://images.test/large.png",
            ],
          },
        ],
      },
      {
        id: "missing",
        name: "Unavailable gallery",
        role: "base_component",
        expectedCount: 8,
        images: [],
      },
    ],
  });
it("imports measured resolutions, deduplicates media without losing roles, and preserves IDs on resync", async () => {
  const product = await importCatalogEntry(db, 770, entry());
  const rows = await db
    .select()
    .from(productImages)
    .where(eq(productImages.productId, product.id));
  expect(rows).toHaveLength(2);
  const front = rows.find((row: any) => row.sourceUrl.endsWith("large.png"));
  expect(front.media).toMatchObject({
    width: 600,
    height: 600,
    hasAlpha: true,
  });
  expect(front.media.references.map((ref: any) => ref.groupId)).toEqual([
    "system",
    "case",
  ]);
  expect(product.mediaGroups).toHaveLength(3);
  expect(product.mediaGroups![2]).toMatchObject({
    expectedCount: 8,
    declaredImages: 0,
  });
  const count = state.writes;
  await importCatalogEntry(db, 770, entry());
  expect(state.writes).toBe(count);
  const upgraded = entry();
  upgraded.mediaGroups![0].images[0].candidates.push(
    "https://images.test/original.png"
  );
  await importCatalogEntry(db, 770, upgraded);
  const next = await db
    .select()
    .from(productImages)
    .where(eq(productImages.id, front.id));
  expect(next[0].media.width).toBe(1000);
  expect(next[0].storageKey).not.toBe(front.storageKey);
  expect(next[0].media.references).toHaveLength(2);
  expect(
    await db
      .select()
      .from(productImages)
      .where(eq(productImages.organizationId, 771))
  ).toEqual([]);
});

it.each(["original", "equal", "smaller"])("splits divergent shared gallery views (%s) without changing the unaffected system image", async variant => {
  const initial = entry(); initial.productUrl = `https://shop.test/divergent-${variant}`;
  const product = await importCatalogEntry(db, 770, initial);
  const load = () => db.select().from(productImages).where(eq(productImages.productId, product.id));
  const original = (await load()).find((row: any) => row.media.references.some((ref: any) => ref.groupId === "system" && ref.imageId === "front"));
  const changed = entry(); changed.productUrl = initial.productUrl;
  changed.mediaGroups![1].images[0].candidates = [`https://images.test/${variant}.png`];
  await importCatalogEntry(db, 770, changed);
  const rows = await load();
  const system = rows.find((row: any) => row.media.references.some((ref: any) => ref.groupId === "system" && ref.imageId === "front"));
  const option = rows.find((row: any) => row.media.references.some((ref: any) => ref.groupId === "case"));
  expect(system.id).toBe(original.id);
  expect(system.storageKey).toBe(original.storageKey);
  expect(system.sourceUrl).toBe(original.sourceUrl);
  expect(option.id).not.toBe(system.id);
  expect(option.sourceUrl).toBe(`https://images.test/${variant}.png`);
  expect(system.media.references.map((ref: any) => ref.groupId)).toEqual(["system"]);
  const count = state.writes;
  await importCatalogEntry(db, 770, changed);
  expect(state.writes).toBe(count);
  const identity = (items: any[]) => items.map(row => ({ id: row.id, refs: row.media.references })).sort((a, b) => a.id - b.id);
  expect(identity(await load())).toEqual(identity(rows));
  await importCatalogEntry(db, 770, initial);
  const reunited = await load();
  expect(reunited.find((row: any) => row.id === original.id).media.references.map((ref: any) => ref.groupId)).toEqual(["system", "case"]);
  expect(reunited.find((row: any) => row.id === option.id).media).toMatchObject({ retired: true, references: [] });
  const retired = reunited.find((row: any) => row.id === option.id);
  expect(catalogImageEligible(retired, product.mediaGroups)).toBe(false);
  expect(catalogDefaultImage(retired, product.mediaGroups)).toBe(false);
  expect(galleryGroups(reunited, product.mediaGroups).find(group => group.id === "retired")?.images.map(row => row.id)).toContain(option.id);
});
