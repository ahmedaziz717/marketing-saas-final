import { createClient } from '@supabase/supabase-js';

export function storageClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('Asset storage is not configured');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export const assetBucket = () => process.env.SUPABASE_STORAGE_BUCKET || 'frame-assets';

export function normalizeStorageKey(key: string): string {
  if (!key || key.startsWith('/') || key.includes('\\') || /[\x00-\x1f?#]/.test(key) || key.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error('Invalid asset key');
  }
  return key;
}

export function assetUrl(key: string) {
  return '/media/' + normalizeStorageKey(key).split('/').map(encodeURIComponent).join('/');
}

export async function storagePut(relKey: string, data: Buffer | Uint8Array | string, contentType = 'application/octet-stream') {
  const base = normalizeStorageKey(relKey);
  const dot = base.lastIndexOf('.');
  const suffix = crypto.randomUUID();
  const key = dot > base.lastIndexOf('/') ? `${base.slice(0, dot)}_${suffix}${base.slice(dot)}` : `${base}_${suffix}`;
  const bytes = typeof data === 'string' ? Buffer.from(data) : data;
  const { error } = await storageClient().storage.from(assetBucket()).upload(key, bytes, { contentType, upsert: false });
  if (error) throw new Error('Asset upload failed');
  return { key, url: assetUrl(key) };
}

export async function storageGet(relKey: string) {
  const key = normalizeStorageKey(relKey);
  return { key, url: assetUrl(key) };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const key = normalizeStorageKey(relKey);
  const { data, error } = await storageClient().storage.from(assetBucket()).createSignedUrl(key, 120);
  if (error || !data?.signedUrl) throw new Error('Stored asset is unavailable');
  return data.signedUrl;
}

export async function storageGetBase64(relKey: string, maxBytes = 15 * 1024 * 1024): Promise<string> {
  const url = await storageGetSignedUrl(relKey);
  const resp = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!resp.ok) throw new Error(`Stored source image could not be read (${resp.status})`);
  const contentLength = Number(resp.headers.get("content-length") ?? "0");
  if (contentLength > maxBytes) throw new Error("Stored source image exceeds the generation input limit");
  const bytes = Buffer.from(await resp.arrayBuffer());
  if (bytes.length > maxBytes) throw new Error("Stored source image exceeds the generation input limit");
  return bytes.toString("base64");
}
