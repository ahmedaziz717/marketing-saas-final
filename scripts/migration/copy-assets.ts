import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { assetBucket, normalizeStorageKey, storageClient } from '../../server/storage';
import { collectAssetKeys, validateSnapshot, type Snapshot } from './tables';

async function main() {
  const path = process.argv[2];
  if (!path) throw new Error('Supply a reviewed snapshot');
  const bytes = await readFile(path);
  const digest = (buffer: Uint8Array) => createHash('sha256').update(buffer).digest('hex');
  if (digest(bytes) !== (await readFile(path + '.sha256', 'utf8')).trim()) throw new Error('Snapshot checksum mismatch');
  const snapshot: Snapshot = JSON.parse(bytes.toString());
  validateSnapshot(snapshot);
  const keys = collectAssetKeys(snapshot).map(normalizeStorageKey);
  if (!process.argv.includes('--apply')) return void console.log(JSON.stringify({ dryRun: true, assets: keys.length }));
  const sourceUrl = process.env.SOURCE_FORGE_API_URL;
  const sourceKey = process.env.SOURCE_FORGE_API_KEY;
  if (!sourceUrl || !sourceKey || new URL(sourceUrl).protocol !== 'https:') throw new Error('Secure source storage configuration is required');
  const client = storageClient();
  const bucket = assetBucket();
  const { data: configuration, error: bucketError } = await client.storage.getBucket(bucket);
  if (bucketError || !configuration || configuration.public) throw new Error('Target bucket must exist and be private');
  let copied = 0;
  for (const key of keys) {
    const presign = new URL('v1/storage/presign/get', sourceUrl.replace(/\/+$/, '') + '/');
    presign.searchParams.set('path', key);
    const source = await fetch(presign, { headers: { Authorization: `Bearer ${sourceKey}` }, signal: AbortSignal.timeout(30_000) });
    if (!source.ok) throw new Error('Source asset could not be resolved');
    const { url } = await source.json() as { url: string };
    if (new URL(url).protocol !== 'https:') throw new Error('Source download requires HTTPS');
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error('Source asset could not be downloaded');
    const data = new Uint8Array(await response.arrayBuffer());
    // Never overwrite a conflicting object. A rerun verifies already copied bytes.
    let { data: existing, error } = await client.storage.from(bucket).download(key);
    if (!existing) {
      if (String((error as { status?: number; statusCode?: string } | null)?.status || (error as { statusCode?: string } | null)?.statusCode) !== '404') throw new Error('Target asset existence check failed');
      const upload = await client.storage.from(bucket).upload(key, data, { contentType: response.headers.get('content-type') || 'application/octet-stream', upsert: false });
      if (upload.error) throw new Error('Target asset upload failed');
      ({ data: existing, error } = await client.storage.from(bucket).download(key));
    }
    if (error || !existing || digest(new Uint8Array(await existing.arrayBuffer())) !== digest(data)) throw new Error('Target asset checksum mismatch');
    copied++;
    console.log(JSON.stringify({ verifiedAssets: copied, total: keys.length }));
  }
}
main().catch(() => { console.error('Asset copy stopped. Check credentials, private bucket, missing objects and checksums before resuming. Existing target objects were not overwritten.'); process.exitCode = 1; });
