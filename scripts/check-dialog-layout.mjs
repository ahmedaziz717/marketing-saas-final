import { build } from "esbuild";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// Test the actual dialog, action component and production CSS in Chrome without
// adding a browser automation dependency or using real accounts/provider data.
const executable = [process.env.CHROME_BIN, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/opt/google/chrome/chrome"].find(file => file && existsSync(file));
if (!executable) throw new Error("Chrome/Chromium is required for dialog layout checks. Set CHROME_BIN.");
const bundle = await build({ entryPoints: ["scripts/fixtures/asset-review-dialog.tsx"], bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' } });
const js = bundle.outputFiles[0].text;
const cssFiles = (await readdir("dist/public/assets")).filter(file => file.endsWith(".css"));
if (!cssFiles.length) throw new Error("Build the application before running browser checks.");
const css = (await Promise.all(cssFiles.map(file => readFile(path.join("dist/public/assets", file), "utf8")))).join("\n");
const originalRule = '[role="dialog"] button.w-full {position:fixed;left:50%;bottom:1.5rem;z-index:60;width:min(calc(100vw - 3rem),52rem);transform:translateX(-50%)}';
const server = createServer((req, res) => {
  if (req.url === "/fixture.js") { res.setHeader("Content-Type", "application/javascript"); res.end(js); return; }
  res.setHeader("Content-Type", "text/html");
  const reproduce = new URL(req.url, "http://localhost").searchParams.has("reproduce");
  res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}\n*{animation:none!important;transition:none!important;scroll-behavior:auto!important}${reproduce ? originalRule : ""}</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>`);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = await mkdtemp(path.join(tmpdir(), "frame-dialog-chrome-"));
const chrome = spawn(executable, ["--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
let socket;
try {
  const endpoint = await new Promise((resolve, reject) => {
    let stderr = "";
    const timer = setTimeout(() => reject(new Error("Chrome debugging endpoint did not start")), 15000);
    chrome.once("error", error => { clearTimeout(timer); reject(error); });
    chrome.stderr.on("data", chunk => { stderr += chunk; const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
    chrome.once("exit", code => { clearTimeout(timer); reject(new Error(`Chrome exited early (${code}): ${stderr.slice(-1500)}`)); });
  });
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const entry = pending.get(message.id); pending.delete(message.id); clearTimeout(entry.timer);
    if (message.error) entry.reject(new Error(JSON.stringify(message.error))); else entry.resolve(message.result);
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Chrome command timed out: ${method}`)); }, 20000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const page = (method, params) => send(method, params, sessionId);
  await page("Page.enable");
  await mkdir("artifacts/dialog-layout", { recursive: true });
  const results = [];
  const cases = [
    { width: 1705, height: 864, role: "owner", reproduce: true },
    { width: 1705, height: 864, role: "owner" },
    { width: 1024, height: 768, role: "owner" },
    { width: 375, height: 750, role: "owner" },
    { width: 320, height: 568, role: "owner" },
    { width: 864, height: 400, role: "owner" },
    { width: 375, height: 750, role: "creator" },
    { width: 1024, height: 768, role: "reviewer", state: "needs_review" },
    { width: 375, height: 750, role: "reviewer" },
  ];
  for (const item of cases) {
    await page("Emulation.setDeviceMetricsOverride", { width: item.width, height: item.height, deviceScaleFactor: 1, mobile: false });
    const url = new URL(origin); Object.entries(item).forEach(([key, value]) => url.searchParams.set(key, String(value)));
    await page("Page.navigate", { url: url.toString() });
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      const check = await page("Runtime.evaluate", { expression: 'Boolean(window.runDialogRegression && document.querySelector("[aria-label=\\"Asset review actions\\"]"))', returnByValue: true });
      if (check.result.value) { ready = true; break; }
    }
    if (!ready) throw new Error("Dialog fixture did not render");
    const evaluation = await page("Runtime.evaluate", { expression: "window.runDialogRegression()", awaitPromise: true, returnByValue: true });
    const report = evaluation.result?.value;
    if (!report) throw new Error(`Fixture returned no test result: ${JSON.stringify(evaluation)}`);
    const name = `${item.width}x${item.height}-${item.role}-${item.state ?? "draft"}${item.reproduce ? "-original-bug" : ""}`;
    const image = await page("Page.captureScreenshot", { format: "png" });
    await writeFile(`artifacts/dialog-layout/${name}.png`, Buffer.from(image.data, "base64"));
    results.push({ name, ...report });
    if (report.width !== item.width || report.height !== item.height) throw new Error(`Incorrect test viewport: ${JSON.stringify(report)}`);
    if (item.reproduce) {
      if (report.passed || !report.error.includes("normal flow")) throw new Error("The layout test must reproduce the original fixed-button defect");
      console.log("PASS: original overlapping-button defect reproduced by browser regression check");
    } else {
      if (!report.passed) throw new Error(`FAIL ${name}: ${report.error}`);
      console.log(`PASS ${name}: no overlap, no horizontal overflow, correct approval visibility, reachable actions`);
    }
  }
  await writeFile("artifacts/dialog-layout/results.json", JSON.stringify(results, null, 2));
  await send("Browser.close");
} finally {
  socket?.close();
  chrome.kill("SIGTERM");
  await new Promise(resolve => server.close(resolve));
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
}
