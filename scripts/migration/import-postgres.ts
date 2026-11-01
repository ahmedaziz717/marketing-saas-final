import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import postgres from 'postgres';
import { tableDefinitions, validateSnapshot, type Snapshot } from './tables';

export async function importSnapshot(target: ReturnType<typeof postgres>, snapshot: Snapshot) {
  validateSnapshot(snapshot);
  return target.begin(async tx => {
    // Lock all reviewed tables before checking for emptiness: a staging signup
    // cannot race the import and acquire a legacy user's numeric ID.
    for (const { name } of tableDefinitions) await tx.unsafe(`LOCK TABLE app_private."${name}" IN ACCESS EXCLUSIVE MODE`);
    for (const { name } of tableDefinitions) {
      const [count] = await tx.unsafe(`SELECT count(*)::int AS count FROM app_private."${name}"`);
      if (count.count) throw new Error('Target database must be empty');
    }
    for (const { name, columns } of tableDefinitions) {
      const rows = snapshot.tables[name];
      for (const row of rows) {
        const values = columns.map(column => column.type === 'json' && row[column.name] !== null ? JSON.stringify(row[column.name]) : row[column.name]);
        await tx.unsafe(`INSERT INTO app_private."${name}" (${columns.map(column => `"${column.name}"`).join(',')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(',')})`, values as never[]);
      }
      const [count] = await tx.unsafe(`SELECT count(*)::int AS count FROM app_private."${name}"`);
      if (count.count !== rows.length) throw new Error(`Row count mismatch in ${name}`);
      await tx.unsafe(`SELECT setval(pg_get_serial_sequence('app_private.${name}', 'id'), COALESCE((SELECT max(id) FROM app_private."${name}"), 1), EXISTS(SELECT 1 FROM app_private."${name}"))`);
    }
    return Object.fromEntries(tableDefinitions.map(({ name }) => [name, snapshot.tables[name].length]));
  });
}

async function main() {
  const input = process.argv[2];
  if (!input) throw new Error('Supply a snapshot path');
  const bytes = await readFile(input);
  if (createHash('sha256').update(bytes).digest('hex') !== (await readFile(input + '.sha256', 'utf8')).trim()) throw new Error('Snapshot checksum mismatch');
  const snapshot: Snapshot = JSON.parse(bytes.toString());
  validateSnapshot(snapshot);
  if (!process.argv.includes('--apply')) return void console.log(JSON.stringify({ dryRun: true, tables: Object.fromEntries(Object.entries(snapshot.tables).map(([name, rows]) => [name, rows.length])) }));
  const url = process.env.DATABASE_MIGRATION_URL;
  if (!url || !/^postgres(?:ql)?:\/\//.test(url)) throw new Error('A separate target PostgreSQL migration connection is required');
  const target = postgres(url, { prepare: false, max: 1 });
  try { console.log(JSON.stringify({ imported: await importSnapshot(target, snapshot) })); }
  finally { await target.end(); }
}
if (process.argv[1]?.endsWith('import-postgres.ts')) main().catch(() => { console.error('Target import failed; verify checksum, schema, connection, and empty target. The transaction was rolled back.'); process.exitCode = 1; });
