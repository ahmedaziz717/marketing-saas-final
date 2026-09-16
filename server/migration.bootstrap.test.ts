import { it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { buildBootstrapSql } from '../scripts/migration/supabase-bootstrap.mjs';

it('bootstraps private cloud storage and tables without replaying migrations on app startup', async () => {
  const engine = new PGlite();
  try {
    // Stand-ins for the platform-owned roles and storage bucket catalog.
    await engine.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE SCHEMA storage;
      CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean NOT NULL DEFAULT false);`);
    await engine.exec(buildBootstrapSql());
    await migrate(drizzle(engine), { migrationsFolder: 'drizzle/postgres' });
    expect((await engine.query('SELECT * FROM drizzle.__drizzle_migrations')).rows).toHaveLength(1);
    expect((await engine.query("SELECT tablename FROM pg_tables WHERE schemaname = 'app_private'")).rows).toHaveLength(18);
    expect((await engine.query('SELECT id, public FROM storage.buckets')).rows).toEqual([{ id: 'frame-assets', public: false }]);
    expect((await engine.query(`SELECT
      has_schema_privilege('anon', 'app_private', 'USAGE') AS anonymous_access,
      has_table_privilege('authenticated', 'app_private.users', 'SELECT') AS customer_direct_access`)).rows)
      .toEqual([{ anonymous_access: false, customer_direct_access: false }]);
    await expect(engine.exec(buildBootstrapSql())).rejects.toThrow('Fresh bootstrap refused');
  } finally { await engine.close(); }
}, 30_000);
