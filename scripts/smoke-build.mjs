import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as pause } from 'node:timers/promises';
import assert from 'node:assert/strict';

const probe = createServer();
probe.listen(0, '127.0.0.1');
await once(probe, 'listening');
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['dist/index.js'], {
  env: { ...process.env, NODE_ENV: 'production', PORT: String(port), APP_ORIGIN: origin },
  stdio: ['ignore', 'ignore', 'pipe'],
});
child.stderr.on('data', () => {});
const exited = once(child, 'exit');
try {
  let page;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error('Built server exited before startup');
    try { page = await fetch(`${origin}/login`); break; } catch { await pause(100); }
  }
  assert.equal(page?.status, 200, 'Login page must load for a guest');
  const html = await page.text();
  const bundle = html.match(/src="(\/assets\/[^" ]+\.js)"/);
  assert.ok(bundle, 'Production HTML must reference its application bundle');
  const script = await fetch(origin + bundle[1]);
  assert.equal(script.status, 200, 'Public app bundle must not hit the private-media authentication gate');
  assert.match(script.headers.get('content-type') || '', /javascript/);
  assert.equal((await fetch(`${origin}/media/private.png`)).status, 401);
  assert.equal((await fetch(`${origin}/manus-storage/private.png`)).status, 401);
  assert.equal((await fetch(`${origin}/api/auth/email`, { method: 'POST', headers: { origin: 'https://untrusted.example' } })).status, 403);
  const health = await fetch(`${origin}/healthz`);
  assert.equal(health.status, process.argv.includes('--allow-unconfigured-db') ? 503 : 200);
  console.log('Production HTTP smoke passed: public bundles, private media, origin checks, and database health.');
} finally {
  child.kill('SIGTERM');
  const timeout = setTimeout(() => child.kill('SIGKILL'), 5000);
  await exited;
  clearTimeout(timeout);
}
