import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
import { tableDefinitions, validateSnapshot, type Snapshot } from '../scripts/migration/tables';
import { importSnapshot } from '../scripts/migration/import-postgres';
import { users, organizations, organizationMemberships, brandKits, brandAssets } from '../drizzle/schema';

const state = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({ getDb: async () => state.db, closeDb: async () => {} }));
import { resolveAuthUser } from './auth/supabase';
import { canReadAsset } from './_core/storageProxy';
import { requireOrganizationRole } from './lib/access';

let engine: PGlite;
beforeAll(async () => {
  engine = new PGlite();
  await engine.exec(readFileSync('drizzle/postgres/0000_long_mad_thinker.sql', 'utf8'));
  state.db = drizzle(engine);
}, 30_000);
afterAll(async () => { await engine?.close(); });

const identity = '11111111-1111-4111-8111-111111111111';
function sourceSnapshot(): Snapshot {
  const snapshot: Snapshot = { version: 1, exportedAt: new Date().toISOString(), tables: Object.fromEntries(tableDefinitions.map(table => [table.name, []])) };
  snapshot.tables.users = [{ id: 40, openId: 'legacy-owner', name: 'Owner', email: 'owner@example.test', loginMethod: 'manus', role: 'admin', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', lastSignedIn: '2026-01-01T00:00:00.000Z' }];
  snapshot.tables.organizations = [{ id: 70, name: 'Original Company', slug: 'original-company', createdByUserId: 40, createdAtMs: 1 }];
  snapshot.tables.organization_memberships = [{ id: 80, organizationId: 70, userId: 40, role: 'owner', status: 'active', createdAtMs: 1 }];
  return snapshot;
}
function targetAdapter() {
  // PGlite runs PostgreSQL itself. The tiny adapter exposes the same parameterized
  // query and transaction boundary used by postgres-js, without a cloud account.
  return { begin: (operation: any) => engine.transaction(tx => operation({ unsafe: async (query: string, params: any[] = []) => (await tx.query(query, params)).rows })) } as any;
}

describe('PostgreSQL migration and tenant preservation', () => {
  it('imports all tables atomically, preserves company IDs, and advances identity sequences', async () => {
    const counts = await importSnapshot(targetAdapter(), sourceSnapshot());
    expect(counts.organizations).toBe(1);
    const [owner] = await state.db.select().from(users).where(eq(users.id, 40));
    expect(owner).toMatchObject({ id: 40, role: 'admin', authUserId: null });
    const [next] = await state.db.insert(users).values({ openId: 'second-user', email: 'second@example.test' }).returning({ id: users.id });
    expect(next.id).toBe(41);
    expect((await requireOrganizationRole(40, 70)).membership.role).toBe('owner');
    await expect(requireOrganizationRole(41, 70)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('refuses a nonempty target and leaves existing company data intact', async () => {
    await expect(importSnapshot(targetAdapter(), sourceSnapshot())).rejects.toThrow('empty');
    expect(await state.db.select().from(organizations)).toHaveLength(1);
    expect(await state.db.select().from(users)).toHaveLength(2);
  });
  it('rejects unknown columns, missing tables and active jobs instead of silently dropping data', () => {
    const drift = sourceSnapshot(); drift.tables.users[0].newSourceField = true;
    expect(() => validateSnapshot(drift)).toThrow('drift');
    const missing = sourceSnapshot(); delete missing.tables.products;
    expect(() => validateSnapshot(missing)).toThrow('tables');
    const active = sourceSnapshot();
    const jobColumns = tableDefinitions.find(table => table.name === 'creative_jobs')!.columns;
    active.tables.creative_jobs = [{ ...Object.fromEntries(jobColumns.map(column => [column.name, null])), id: 1, status: 'queued' }];
    expect(() => validateSnapshot(active)).toThrow('active generation');
  });
  it('requires explicit migration mapping and never grants roles from client metadata', async () => {
    await expect(resolveAuthUser({ id: identity, email: 'owner@example.test', email_confirmed_at: '2026-09-01' })).rejects.toThrow('mapping');
    await state.db.update(users).set({ authUserId: identity }).where(eq(users.id, 40));
    expect(await resolveAuthUser({ id: identity, email: 'owner@example.test', email_confirmed_at: '2026-09-01' })).toMatchObject({ id: 40, role: 'admin' });
    expect(await resolveAuthUser({ id: '22222222-2222-4222-8222-222222222222', email: 'unverified@example.test' })).toBeNull();
    expect(await resolveAuthUser({ id: '33333333-3333-4333-8333-333333333333', email: 'new@example.test', email_confirmed_at: '2026-09-01', user_metadata: { role: 'admin' } } as any)).toMatchObject({ role: 'user' });
  });
  it('serves an asset only to an active member of the company that owns its database record', async () => {
    const [kit] = await state.db.insert(brandKits).values({ organizationId: 70, name: 'Brand', colors: [], fonts: [], updatedByUserId: 40, updatedAtMs: 1 }).returning({ id: brandKits.id });
    await state.db.insert(brandAssets).values({ organizationId: 70, brandKitId: kit.id, name: 'Logo', type: 'logo', storageKey: 'legacy-logo.png', url: '/manus-storage/legacy-logo.png', mimeType: 'image/png', uploadedByUserId: 40, createdAtMs: 1 });
    expect(await canReadAsset(40, 'legacy-logo.png')).toBe(true);
    expect(await canReadAsset(41, 'legacy-logo.png')).toBe(false);
    expect(await canReadAsset(40, 'unregistered-key.png')).toBe(false);
    await state.db.update(organizationMemberships).set({ status: 'suspended' }).where(eq(organizationMemberships.id, 80));
    expect(await canReadAsset(40, 'legacy-logo.png')).toBe(false);
  });
});
