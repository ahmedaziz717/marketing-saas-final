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

type SigningFailure = { category: 'transient' | 'access' | 'missing' | 'unknown'; status?: number; retryAfterMs?: number };

// Never log the provider error: it can contain signed URLs, keys, or credentials.
function signingFailure(error: unknown): SigningFailure {
  const value = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const numericStatus = Number(value.status ?? value.statusCode);
  const status = Number.isInteger(numericStatus) && numericStatus >= 100 && numericStatus <= 599 ? numericStatus : undefined;
  const code = String(value.code ?? value.statusCode ?? '');
  const message = typeof value.message === 'string' ? value.message : '';
  if (status === 401 || status === 403 || /^(AccessDenied|Unauthorized|Forbidden)$/i.test(code)) return { category: 'access', status };
  if (status === 404 || /^(NoSuchKey|NoSuchBucket|NotFound|ObjectNotFound)$/i.test(code) || /^Object not found$/i.test(message)) return { category: 'missing', status };
  const transient = status === 429 || (status !== undefined && status >= 500) || code === '08P01' || (code === 'DatabaseError' && /\b08P01\b/.test(message));
  if (!transient) return { category: 'unknown', status };
  // Current storage SDK drops headers; respect Retry-After if a future version exposes it.
  const headers = value.headers;
  let retryAfter: unknown;
  if (headers instanceof Headers) retryAfter = headers.get('retry-after');
  else if (headers && typeof headers === 'object') retryAfter = (headers as Record<string, unknown>)['retry-after'] ?? (headers as Record<string, unknown>)['Retry-After'];
  let retryAfterMs: number | undefined;
  if (typeof retryAfter === 'string' || typeof retryAfter === 'number') {
    const seconds = Number(retryAfter);
    const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(String(retryAfter)) - Date.now();
    if (Number.isFinite(delay)) retryAfterMs = Math.min(2000, Math.max(0, delay));
  }
  return { category: 'transient', status, retryAfterMs };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const key = normalizeStorageKey(relKey);
  const bucket = storageClient().storage.from(assetBucket());
  for (let attempt = 1; attempt <= 3; attempt++) {
    let failure: SigningFailure;
    try {
      const { data, error } = await bucket.createSignedUrl(key, 120);
      if (!error && data?.signedUrl) return data.signedUrl;
      failure = signingFailure(error);
    } catch (error) {
      failure = signingFailure(error);
    }
    console.warn('Asset signing failed', { category: failure.category, status: failure.status, attempt });
    if (failure.category === 'transient' && attempt < 3) {
      const delay = Math.min(2000, failure.retryAfterMs ?? (250 * 2 ** (attempt - 1) + Math.random() * 250));
      await new Promise(resolve => setTimeout(resolve, delay));
      continue;
    }
    const detail = {
      transient: 'Asset storage is temporarily busy. Please try again shortly.',
      access: 'Access to this asset was denied. Check its permissions.',
      missing: 'This asset could not be found. Choose another asset or restore it.',
      unknown: 'The asset could not be read. Please try again or contact support.',
    }[failure.category];
    throw new Error(`Stored asset is unavailable. ${detail}`);
  }
  throw new Error('Stored asset is unavailable');
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
