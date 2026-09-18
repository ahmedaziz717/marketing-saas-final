import { getTableColumns } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import * as schema from '../../drizzle/schema';

// Parent rows precede children. Keep this list explicit so new Manus tables must
// be reviewed before another snapshot is exported.
export const tables = [
  schema.users, schema.organizations, schema.organizationMemberships,
  schema.organizationInvites, schema.brandKits, schema.brandAssets,
  schema.websiteCrawlJobs, schema.websiteCrawlPages, schema.products,
  schema.productVariants, schema.productImages, schema.campaignBriefs,
  schema.creativeJobs, schema.creativeVariants, schema.reviewComments,
  schema.metaConnections, schema.publishRequests, schema.activityEvents,
];
export const tableDefinitions = tables.map(table => ({
  name: getTableConfig(table).name,
  columns: Object.values(getTableColumns(table)).filter(column => column.name !== 'authUserId').map(column => ({ name: column.name, type: column.dataType })),
}));
export type Snapshot = {
  version: 1; exportedAt: string;
  tables: Record<string, Array<Record<string, unknown>>>;
};

export function validateSnapshot(snapshot: Snapshot) {
  if (snapshot.version !== 1) throw new Error('Unsupported snapshot version');
  const expected = tableDefinitions.map(table => table.name).sort();
  if (JSON.stringify(Object.keys(snapshot.tables).sort()) !== JSON.stringify(expected)) throw new Error('Snapshot tables differ from the reviewed schema');
  for (const { name, columns } of tableDefinitions) {
    const names = columns.map(column => column.name).sort();
    const ids = new Set();
    for (const row of snapshot.tables[name]) {
      if (JSON.stringify(Object.keys(row).sort()) !== JSON.stringify(names)) throw new Error(`Schema drift in ${name}`);
      if (!Number.isSafeInteger(row.id) || Number(row.id) < 1 || ids.has(row.id)) throw new Error(`Invalid or duplicate ID in ${name}`);
      ids.add(row.id);
    }
  }
  if (snapshot.tables.creative_jobs.some(row => ['running', 'queued'].includes(String(row.status))) || snapshot.tables.publish_requests.some(row => row.status === 'publishing')) {
    throw new Error('Wait for active generation and publishing jobs to finish before taking a migration snapshot');
  }
}

export function collectAssetKeys(snapshot: Snapshot) {
  const keys = new Set<string>();
  function visit(value: unknown) {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (['storageKey', 'imageStorageKey'].includes(key) && typeof child === 'string' && child) keys.add(child);
      else if (['imageUrl', 'url'].includes(key) && typeof child === 'string' && child.startsWith('/manus-storage/')) keys.add(child.slice('/manus-storage/'.length));
      else visit(child);
    }
  }
  visit(snapshot.tables);
  return [...keys].sort();
}
