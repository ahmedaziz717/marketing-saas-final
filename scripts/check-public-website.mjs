import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const pause = ms => new Promise(r => setTimeout(r, ms));
const probe = createServer();
probe.listen(0, "127.0.0.1");
await once(probe, "listening");
const port = probe.address().port;
await new Promise(r => probe.close(r));
const origin = `http://127.0.0.1:${port}`;
// No real account or provider connection is used. The production public renderer
// is served by the real built app; only its local CSS is inlined for offline Chrome.
const child = spawn(process.execPath, ["dist/index.js"], {
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(port),
    APP_ORIGIN: origin,
  },
  stdio: ["ignore", "ignore", "pipe"],
});
child.stderr.on("data", () => {});
const chromePath = [
  process.env.CHROME_BIN,
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
].find(p => p && existsSync(p));
assert.ok(chromePath, "Chrome is required");
const profile = await mkdtemp(path.join(tmpdir(), "frame-public-chrome-"));
let chrome, socket;
try {
  let ready = false;
  for (let n = 0; n < 100; n++) {
    try {
      if ((await fetch(origin + "/")).status === 200) {
        ready = true;
        break;
      }
    } catch {}
    await pause(100);
  }
  assert.ok(ready, "Built public site must start");
  const paths = [
    "/",
    "/product",
    "/product/create",
    "/product/activate",
    "/product/measure",
    "/product/optimize",
    "/integrations",
    "/pricing",
    "/about",
    "/contact",
    "/privacy",
    "/terms",
    "/data-deletion",
    "/security",
  ];
  const documents = new Map();
  for (const url of paths) {
    const r = await fetch(origin + url);
    const html = await r.text();
    assert.equal(r.status, 200, url);
    assert.match(html, /<h1/);
    assert.match(html, /href="\/privacy"/);
    assert.ok(
      !html.includes('id="root"'),
      "Public page must not be a blank SPA shell"
    );
    assert.equal(r.headers.get("set-cookie"), null);
    assert.match(
      r.headers.get("content-security-policy"),
      /frame-ancestors 'none'/
    );
    documents.set(url, html);
  }
  const cssResponse = await fetch(origin + "/website/site.css");
  assert.equal(cssResponse.status, 200);
  const css = await cssResponse.text();
  assert.match(css, /\.hero/);
  // Check actual document links rather than just a predetermined URL list.
  for (const html of documents.values())
    for (const match of html.matchAll(/href="(\/[^"#]*)"/g)) {
      const href = match[1].replaceAll("&amp;", "&");
      if (
        href.startsWith("/website/") ||
        href === "/login" ||
        paths.includes(href.split("?")[0])
      )
        continue;
      throw new Error("Unexpected public destination " + href);
    }
  chrome = spawn(
    chromePath,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] }
  );
  const endpoint = await new Promise((resolve, reject) => {
    let out = "";
    const timeout = setTimeout(
      () => reject(new Error("No Chrome endpoint")),
      15000
    );
    chrome.stderr.on("data", c => {
      out += c;
      const m = out.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (m) {
        clearTimeout(timeout);
        resolve(m[1]);
      }
    });
    chrome.once("error", reject);
  });
  socket = new WebSocket(endpoint);
  await new Promise((r, j) => {
    socket.addEventListener("open", r, { once: true });
    socket.addEventListener("error", j, { once: true });
  });
  let seq = 0;
  const pending = new Map();
  socket.addEventListener("message", e => {
    const m = JSON.parse(e.data);
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    clearTimeout(p.timer);
    m.error
      ? p.reject(new Error(JSON.stringify(m.error)))
      : p.resolve(m.result);
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++seq,
        timer = setTimeout(
          () => reject(new Error("CDP timeout " + method)),
          15000
        );
      pending.set(id, { resolve, reject, timer });
      socket.send(
        JSON.stringify({
          id,
          method,
          params,
          ...(sessionId ? { sessionId } : {}),
        })
      );
    });
  const { targetId } = await send("Target.createTarget", {
    url: "about:blank",
  });
  const { sessionId } = await send("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  const page = (m, p) => send(m, p, sessionId);
  await page("Page.enable");
  await page("Runtime.enable");
  const evaluate = async expression => {
    const r = await page("Runtime.evaluate", {
      expression,
      returnByValue: true,
    });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  await mkdir("artifacts/public-website", { recursive: true });
  const results = [];
  for (const width of [1440, 1024, 375, 320])
    for (const url of width === 1024 || width === 320
      ? ["/", "/pricing", "/contact", "/data-deletion"]
      : paths) {
      await page("Emulation.setDeviceMetricsOverride", {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await page("Page.navigate", { url: "about:blank" });
      await pause(25);
      const { frameTree } = await page("Page.getFrameTree");
      const html = documents
        .get(url)
        .replace(
          /<link rel="stylesheet"[^>]+\/>/,
          "<style>" + css + "</style>"
        );
      await page("Page.setDocumentContent", {
        frameId: frameTree.frame.id,
        html,
      });
      await pause(35);
      const layout = await evaluate(
        `({width:innerWidth,scroll:document.documentElement.scrollWidth,h1:document.querySelector('h1').textContent,css:getComputedStyle(document.querySelector('body')).fontFamily,forms:[...document.querySelectorAll('form')].length,scripts:[...document.scripts].filter(s=>s.type!=='application/ld+json').length,links:[...document.querySelectorAll('main a,footer a')].filter(a=>{const r=a.getBoundingClientRect();return r.width&& (r.right>innerWidth+2||r.left < -2)}).map(a=>a.textContent)})`
      );
      // Keep actionable diagnostics even when a host font exposes an intrinsic
      // form/grid width issue that did not occur on the developer machine.
      if (layout.scroll > width + 2) {
        const overflow = await evaluate(
          `Array.from(document.querySelectorAll('body *')).filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > innerWidth + 2 && !el.closest('.form-trap'); }).map(el => ({ tag: el.tagName, className: typeof el.className === 'string' ? el.className : '', width: el.getBoundingClientRect().width, right: el.getBoundingClientRect().right, minWidth: getComputedStyle(el).minWidth })).slice(0, 30)`
        );
        await writeFile(
          `artifacts/public-website/overflow-${url.slice(1).replaceAll("/", "-") || "home"}-${width}.json`,
          JSON.stringify(overflow, null, 2)
        );
        console.error("Offscreen element diagnostics", overflow);
      }
      assert.ok(
        layout.scroll <= width + 2,
        `Overflow ${url} ${width}: ${JSON.stringify(layout)}`
      );
      assert.equal(layout.scripts, 0, "No executable client JS is required");
      assert.equal(layout.links.length, 0, `Offscreen links ${url} ${width}`);
      if (url === "/") {
        await evaluate(`document.querySelector('.faq-list summary').click()`);
        assert.equal(
          await evaluate(`document.querySelector('.faq-list details').open`),
          true
        );
        if (width < 800) {
          await evaluate(
            `document.querySelector('.mobile-nav summary').click()`
          );
          assert.equal(
            await evaluate(`document.querySelector('.mobile-nav').open`),
            true
          );
          const rect = await evaluate(
            `(()=>{const r=document.querySelector('.mobile-nav nav').getBoundingClientRect();return {left:r.left,right:r.right}})()`
          );
          assert.ok(rect.left >= 0 && rect.right <= width);
          await evaluate(
            `document.querySelector('.mobile-nav summary').click()`
          );
        }
      }
      if (layout.forms) {
        assert.equal(
          await evaluate(`document.querySelector('form').checkValidity()`),
          false
        );
        assert.equal(
          await evaluate(
            `document.querySelector('form').getAttribute('action')`
          ),
          "/public/request"
        );
        if (url === "/data-deletion")
          assert.equal(
            await evaluate(
              `document.querySelector('select[name=topic]').value`
            ),
            "deletion"
          );
      }
      const { contentSize } = await page("Page.getLayoutMetrics");
      const png = await page("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: true,
        clip: {
          x: 0,
          y: 0,
          width,
          height: Math.min(contentSize.height, 13000),
          scale: 1,
        },
      });
      await writeFile(
        `artifacts/public-website/${url === "/" ? "home" : url.slice(1).replaceAll("/", "-")}-${width}.png`,
        Buffer.from(png.data, "base64")
      );
      results.push({ path: url, width, passed: true });
    }
  await writeFile(
    "artifacts/public-website/results.json",
    JSON.stringify({ cases: results.length, results }, null, 2)
  );
  console.log(
    `Public website checks passed: ${paths.length} guest HTTP documents, ${results.length} desktop/mobile cases, no executable JavaScript, navigation and form validation.`
  );
} finally {
  socket?.close();
  chrome?.kill("SIGTERM");
  child.kill("SIGTERM");
  await pause(200);
  if (child.exitCode === null) child.kill("SIGKILL");
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
