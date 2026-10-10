import { beforeAll, beforeEach, afterAll, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync } from "node:fs";
import { randomBytes, createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  users,
  organizations,
  organizationMemberships,
} from "../../drizzle/schema";
import { platformAccounts } from "../../drizzle/platformSchema";
const state = vi.hoisted(() => ({
  db: null as any,
  createUser: vi.fn(),
  signIn: vi.fn(),
}));
vi.mock("../db", () => ({ getDb: async () => state.db }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { admin: { createUser: state.createUser } } }),
}));
vi.mock("./supabase", () => ({
  authClient: () => ({ auth: { signInWithPassword: state.signIn } }),
  resolveAuthUser: async () => ({ id: 2 }),
}));
import { registerAccountActivation } from "./accountActivation";
const handlers = new Map<string, any>();
registerAccountActivation(
  { post: (p: string, ...h: any[]) => handlers.set(p, h.at(-1)) } as any,
  (() => {}) as any
);
let engine: PGlite;
beforeAll(async () => {
  engine = new PGlite();
  for (const e of JSON.parse(
    readFileSync("drizzle/postgres/meta/_journal.json", "utf8")
  ).entries)
    await engine.exec(readFileSync(`drizzle/postgres/${e.tag}.sql`, "utf8"));
  state.db = drizzle(engine);
  await state.db.insert(users).values([
    { id: 1, openId: "admin", email: "admin@example.com" },
    { id: 2, openId: "invited", email: "invited@example.com" },
  ]);
}, 30000);
afterAll(async () => {
  await engine?.close();
  vi.unstubAllEnvs();
});
beforeEach(() => {
  state.createUser.mockReset().mockResolvedValue({ data: {}, error: null });
  state.signIn
    .mockReset()
    .mockResolvedValue({
      data: {
        user: {
          id: "auth-user",
          email: "invited@example.com",
          email_confirmed_at: "2026-01-01",
        },
      },
      error: null,
    });
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SECRET_KEY", "test");
});
async function fixture(expired = false) {
  const token = randomBytes(32).toString("hex");
  const [org] = await state.db
    .insert(organizations)
    .values({
      name: "Invited workspace",
      slug: token,
      createdByUserId: 1,
      createdAtMs: Date.now(),
    })
    .returning();
  await state.db
    .insert(platformAccounts)
    .values({
      organizationId: org.id,
      ownerEmail: "invited@example.com",
      tierId: "scale",
      enforceCredits: 1,
      inviteHash: createHash("sha256").update(token).digest("hex"),
      inviteExpiresAtMs: Date.now() + (expired ? -1000 : 86400000),
      updatedAtMs: Date.now(),
    });
  return { token, id: org.id };
}
async function call(path: string, body: any) {
  const res: any = {
    set: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  };
  await handlers.get(`/api/auth/account-invite/${path}`)({ body }, res);
  return res;
}
it("views without consuming, activates only invited email and preserves assigned tier", async () => {
  const f = await fixture();
  expect((await call("details", { token: f.token })).json).toHaveBeenCalledWith(
    { email: "invited@example.com", workspace: "Invited workspace" }
  );
  expect(state.createUser).not.toHaveBeenCalled();
  const result = await call("activate", {
    token: f.token,
    password: "test-password-123",
    email: "attacker@example.com",
  });
  expect(result.json).toHaveBeenCalledWith({
    userId: 2,
    organizationId: f.id,
    redirectTo: "/app",
  });
  expect(state.createUser).toHaveBeenCalledWith({
    email: "invited@example.com",
    password: "test-password-123",
    email_confirm: true,
  });
  expect(
    (
      await state.db
        .select()
        .from(platformAccounts)
        .where(eq(platformAccounts.organizationId, f.id))
    )[0]
  ).toMatchObject({ inviteHash: null, tierId: "scale", enforceCredits: 1 });
  expect(
    (
      await state.db
        .select()
        .from(organizationMemberships)
        .where(eq(organizationMemberships.organizationId, f.id))
    )[0]
  ).toMatchObject({ userId: 2, role: "owner" });
  state.createUser.mockClear();
  expect(
    (await call("activate", { token: f.token, password: "test-password-123" }))
      .status
  ).toHaveBeenCalledWith(400);
  expect(state.createUser).not.toHaveBeenCalled();
});
it("rejects expired links and weak passwords before touching Auth", async () => {
  const f = await fixture(true);
  expect(
    (await call("activate", { token: f.token, password: "test-password-123" }))
      .status
  ).toHaveBeenCalledWith(400);
  const valid = await fixture();
  expect(
    (await call("activate", { token: valid.token, password: "short" })).status
  ).toHaveBeenCalledWith(400);
  expect(state.createUser).not.toHaveBeenCalled();
});
it("does not grant access or consume invitation when existing password is wrong", async () => {
  const f = await fixture();
  state.createUser.mockResolvedValue({ error: { code: "email_exists" } });
  state.signIn.mockResolvedValue({
    data: {},
    error: { message: "Wrong password" },
  });
  expect(
    (await call("activate", { token: f.token, password: "wrong-password-123" }))
      .status
  ).toHaveBeenCalledWith(400);
  expect(
    (
      await state.db
        .select()
        .from(platformAccounts)
        .where(eq(platformAccounts.organizationId, f.id))
    )[0].inviteHash
  ).not.toBeNull();
  expect(
    await state.db
      .select()
      .from(organizationMemberships)
      .where(eq(organizationMemberships.organizationId, f.id))
  ).toHaveLength(0);
});
