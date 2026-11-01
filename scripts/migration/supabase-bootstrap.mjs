import { readMigrationFiles } from 'drizzle-orm/migrator';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Apply this only to a fresh project. Recording the hashes of the SQL actually
// applied keeps subsequent `pnpm db:migrate` deployments in sync with Drizzle.
export function buildBootstrapSql() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const migrations = readMigrationFiles({ migrationsFolder: path.join(root, 'drizzle/postgres') });
  if (!migrations.length) throw new Error('No reviewed PostgreSQL migrations found');
  return [
    `DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'app_private') THEN
        RAISE EXCEPTION 'Fresh bootstrap refused: app_private already exists';
      END IF;
    END $$;`,
    'CREATE SCHEMA IF NOT EXISTS drizzle;',
    'CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint);',
    ...migrations.flatMap(migration => [
      ...migration.sql,
      `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('${migration.hash}', ${migration.folderMillis});`,
    ]),
    'REVOKE ALL ON SCHEMA app_private, drizzle FROM PUBLIC, anon, authenticated;',
    'REVOKE ALL ON ALL TABLES IN SCHEMA app_private, drizzle FROM PUBLIC, anon, authenticated;',
    'REVOKE ALL ON ALL SEQUENCES IN SCHEMA app_private, drizzle FROM PUBLIC, anon, authenticated;',
    `INSERT INTO storage.buckets (id, name, public)
     VALUES ('frame-assets', 'frame-assets', false) ON CONFLICT (id) DO NOTHING;`,
    `DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'frame-assets' AND public) THEN
        RAISE EXCEPTION 'The frame-assets bucket must be private';
      END IF;
    END $$;`,
  ].join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(buildBootstrapSql());
}
