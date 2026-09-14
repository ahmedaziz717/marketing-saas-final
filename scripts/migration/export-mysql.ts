import 'dotenv/config';
import mysql from 'mysql2/promise';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { tableDefinitions, validateSnapshot, type Snapshot } from './tables';

async function main() {
  const source = process.env.SOURCE_DATABASE_URL;
  if (!source || !/^mysql:\/\//.test(source)) throw new Error('SOURCE_DATABASE_URL must be the read-only source MySQL connection');
  const output = resolve(process.argv[2] || 'migration-data/snapshot.json');
  const connection = await mysql.createConnection({ uri: source, timezone: 'Z', supportBigNumbers: true });
  try {
    await connection.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
    const [discovered] = await connection.query('SHOW TABLES');
    const expected = new Set(tableDefinitions.map(table => table.name));
    const unexpected = (discovered as Record<string, string>[]).map(row => Object.values(row)[0]).filter(name => !expected.has(name) && !name.startsWith('__drizzle'));
    if (unexpected.length) throw new Error('Unreviewed source tables found; update the migration mapping first');
    const snapshot: Snapshot = { version: 1, exportedAt: new Date().toISOString(), tables: {} };
    for (const { name, columns } of tableDefinitions) {
      const [rows] = await connection.query(`SELECT * FROM \`${name}\` ORDER BY id`);
      snapshot.tables[name] = (rows as Record<string, unknown>[]).map(row => {
        for (const column of columns) if (column.type === 'json' && typeof row[column.name] === 'string') row[column.name] = JSON.parse(String(row[column.name]));
        return row;
      });
    }
    validateSnapshot(snapshot);
    const serialized = JSON.stringify(snapshot);
    await mkdir(dirname(output), { recursive: true, mode: 0o700 });
    await writeFile(output, serialized, { mode: 0o600, flag: 'wx' });
    await writeFile(output + '.sha256', createHash('sha256').update(serialized).digest('hex') + '\n', { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify({ snapshot: output, rows: Object.fromEntries(Object.entries(snapshot.tables).map(([name, rows]) => [name, rows.length])) }));
  } finally { await connection.rollback(); await connection.end(); }
}
main().catch(() => { console.error('Source export failed. Check source schema, active jobs, connection settings, and output path; no source data was changed.'); process.exitCode = 1; });
