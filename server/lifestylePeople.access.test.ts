import { afterAll, beforeAll, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import {
  brandAssets,
  brandKits,
  users,
  organizations,
} from "../drizzle/schema";
import {
  defaultCreativeSetup,
  type PersonReference,
} from "../shared/creativeBuilder";
import { loadInputs } from "./routers/creativeBuilder";
let engine: PGlite,
  db: any,
  organizationId: number,
  otherOrg: number,
  assetId: number;
beforeAll(async () => {
  engine = new PGlite();
  for (const file of readdirSync("drizzle/postgres")
    .filter(f => f.endsWith(".sql"))
    .sort())
    await engine.exec(readFileSync("drizzle/postgres/" + file, "utf8"));
  db = drizzle(engine);
  const [user] = await db
    .insert(users)
    .values({ openId: "model-reference-test" })
    .returning();
  const orgs = await db
    .insert(organizations)
    .values(
      ["one", "two"].map(slug => ({
        name: slug,
        slug,
        createdByUserId: user.id,
        createdAtMs: 1,
      }))
    )
    .returning();
  organizationId = orgs[0].id;
  otherOrg = orgs[1].id;
  const [kit] = await db
    .insert(brandKits)
    .values({
      organizationId,
      name: "Test brand",
      colors: [],
      fonts: [],
      updatedByUserId: user.id,
      updatedAtMs: 1,
    })
    .returning();
  const [asset] = await db
    .insert(brandAssets)
    .values({
      organizationId,
      brandKitId: kit.id,
      name: "Test child",
      type: "reference",
      storageKey: "test.png",
      url: "/test.png",
      mimeType: "image/png",
      status: "approved",
      metadata: { kind: "lifestyle_person", gender: "male", age: "child" },
      uploadedByUserId: user.id,
      createdAtMs: 1,
    })
    .returning();
  assetId = asset.id;
}, 30_000);
afterAll(async () => {
  await engine?.close();
});
const draft = (people: PersonReference[]) => ({
  ...defaultCreativeSetup(),
  shot: "multiple" as const,
  people,
});
it("validates every uploaded person in a mixed group and rejects foreign or unapproved references", async () => {
  const setup = draft([
    { kind: "library", id: "female-black-0" },
    { kind: "asset", assetId },
  ]);
  expect(
    (await loadInputs(db, organizationId, setup)).personAssets.map(a => a.id)
  ).toEqual([assetId]);
  await db
    .update(brandAssets)
    .set({ status: "pending" })
    .where(eq(brandAssets.id, assetId));
  await expect(loadInputs(db, organizationId, setup)).rejects.toMatchObject({
    code: "PRECONDITION_FAILED",
  });
  await db
    .update(brandAssets)
    .set({ status: "approved", organizationId: otherOrg })
    .where(eq(brandAssets.id, assetId));
  await expect(loadInputs(db, organizationId, setup)).rejects.toMatchObject({
    code: "PRECONDITION_FAILED",
  });
  await db
    .update(brandAssets)
    .set({ organizationId })
    .where(eq(brandAssets.id, assetId));
});
it("checks saved reference ages for kids vs adult settings", async () => {
  const setup = draft([{ kind: "asset", assetId }]);
  await expect(
    loadInputs(db, organizationId, { ...setup, shot: "child" })
  ).resolves.toBeTruthy();
  await expect(
    loadInputs(db, organizationId, { ...setup, shot: "male" })
  ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
});
it("rejects using a favorite and its original library identity as two different models", async () => {
  await db
    .update(brandAssets)
    .set({
      metadata: {
        kind: "lifestyle_person",
        gender: "male",
        age: "child",
        libraryId: "boys-child-a-0",
      },
    })
    .where(eq(brandAssets.id, assetId));
  await expect(
    loadInputs(
      db,
      organizationId,
      draft([
        { kind: "asset", assetId },
        { kind: "library", id: "boys-child-a-0" },
      ])
    )
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
});
