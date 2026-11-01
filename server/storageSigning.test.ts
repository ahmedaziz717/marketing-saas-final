import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ sign: vi.fn(), from: vi.fn(), client: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.client }));
import { storageGetSignedUrl } from './storage';

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.sign.mockReset();
  mocks.from.mockReturnValue({ createSignedUrl: mocks.sign });
  mocks.client.mockReturnValue({ storage: { from: mocks.from } });
  vi.stubEnv('SUPABASE_URL', 'https://example.test');
  vi.stubEnv('SUPABASE_SECRET_KEY', 'secret-test');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });
const success = { data: { signedUrl: 'https://example.test/private?token=private' }, error: null };
async function complete(promise: Promise<string>) {
  // Attach the rejection handler before advancing timers.
  const outcome = promise.then(value => ({ value }), error => ({ error: error as Error }));
  await vi.runAllTimersAsync();
  return outcome;
}
it('signs once on success', async () => {
  mocks.sign.mockResolvedValue(success);
  expect(await storageGetSignedUrl('org-3/image.png')).toBe(success.data.signedUrl);
  expect(mocks.sign).toHaveBeenCalledTimes(1);
  expect(mocks.sign).toHaveBeenCalledWith('org-3/image.png', 120);
});
it.each([
  { status: 429 }, { statusCode: '503' }, { code: '08P01' },
  { statusCode: 'DatabaseError', message: 'database error, code: 08P01' },
])('recovers safe transient failure %j without changing bucket/key/TTL', async error => {
  mocks.sign.mockResolvedValueOnce({ error }).mockResolvedValue(success);
  const result = await complete(storageGetSignedUrl('org-3/image.png'));
  expect(result).toEqual({ value: success.data.signedUrl });
  expect(mocks.sign.mock.calls).toEqual([['org-3/image.png', 120], ['org-3/image.png', 120]]);
  expect(mocks.client).toHaveBeenCalledTimes(1);
  expect(mocks.from).toHaveBeenCalledTimes(1);
});
it('recovers a thrown 429', async () => {
  mocks.sign.mockRejectedValueOnce({ status: 429 }).mockResolvedValue(success);
  expect(await complete(storageGetSignedUrl('org-3/image.png'))).toEqual({ value: success.data.signedUrl });
});
it('exhausts after three safe signing attempts', async () => {
  mocks.sign.mockResolvedValue({ error: { status: 503 } });
  const result = await complete(storageGetSignedUrl('org-3/image.png'));
  expect('error' in result && result.error.message).toMatch(/temporarily busy/);
  expect(mocks.sign).toHaveBeenCalledTimes(3);
});
it.each([
  [{ status: 403, code: '08P01' }, /denied/],
  [{ statusCode: '404', code: '08P01' }, /not be found/],
  [{ code: 'AccessDenied' }, /denied/],
  [{ code: 'NoSuchKey' }, /not be found/],
  [{ message: 'unknown network failure' }, /contact support/],
] as const)('does not retry denied/missing/unknown errors %j', async (error, message) => {
  mocks.sign.mockResolvedValue({ error });
  await expect(storageGetSignedUrl('org-3/image.png')).rejects.toThrow(message);
  expect(mocks.sign).toHaveBeenCalledTimes(1);
});
it('does not retry an empty success payload', async () => {
  mocks.sign.mockResolvedValue({ data: {}, error: null });
  await expect(storageGetSignedUrl('org-3/image.png')).rejects.toThrow('Stored asset is unavailable');
  expect(mocks.sign).toHaveBeenCalledTimes(1);
});
it('validates path before creating a client', async () => {
  await expect(storageGetSignedUrl('../secret')).rejects.toThrow('Invalid asset key');
  expect(mocks.client).not.toHaveBeenCalled();
});
it('caps Retry-After delays at two seconds', async () => {
  mocks.sign.mockResolvedValueOnce({ error: { status: 429, headers: { 'Retry-After': '120' } } }).mockResolvedValue(success);
  const result = storageGetSignedUrl('org-3/image.png');
  await vi.advanceTimersByTimeAsync(1999);
  expect(mocks.sign).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(await result).toBe(success.data.signedUrl);
});
it('logs and throws only sanitized details', async () => {
  mocks.sign.mockResolvedValue({ error: { status: 403, message: 'https://private.test?token=SECRET org-3/image.png', extra: 'SECRET' } });
  const result = await complete(storageGetSignedUrl('org-3/image.png'));
  const output = JSON.stringify(vi.mocked(console.warn).mock.calls) + ('error' in result ? result.error.message : '');
  expect(output).not.toMatch(/SECRET|private.test|org-3/);
  expect(console.warn).toHaveBeenCalledWith('Asset signing failed', { category: 'access', status: 403, attempt: 1 });
});
