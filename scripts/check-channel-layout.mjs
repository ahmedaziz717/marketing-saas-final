import { inlineLiveBrandImages } from "./brand-fixture-assets.mjs";
import { build } from "esbuild";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// Render actual channel pages with synthetic data in an offline Chrome document.
// No application auth bypass, provider credentials or remote writes are involved.
const executable = [
  process.env.CHROME_BIN,
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/opt/google/chrome/chrome",
].find(file => file && existsSync(file));
if (!executable)
  throw new Error(
    "Chrome/Chromium is required for dialog layout checks. Set CHROME_BIN."
  );
const bundle = await build({
  entryPoints: ["scripts/fixtures/channel-workspace.tsx"],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: {
    "@/_core/hooks/useAuth": path.resolve(
      "scripts/fixtures/channel-workspace-stubs.tsx"
    ),
    "@/hooks/useWorkspace": path.resolve(
      "scripts/fixtures/channel-workspace-stubs.tsx"
    ),
    "@/components/WorkspaceGate": path.resolve(
      "scripts/fixtures/channel-workspace-stubs.tsx"
    ),
  },
});
const js = bundle.outputFiles[0].text;
const cssFiles = (await readdir("dist/public/assets")).filter(file =>
  file.endsWith(".css")
);
if (!cssFiles.length)
  throw new Error("Build the application before running browser checks.");
const css = (
  await Promise.all(
    cssFiles.map(file =>
      readFile(path.join("dist/public/assets", file), "utf8")
    )
  )
).join("\n");
const profile = await mkdtemp(path.join(tmpdir(), "frame-channel-chrome-"));
const chrome = spawn(
  executable,
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: ["ignore", "ignore", "pipe"] }
);
let socket;
try {
  const endpoint = await new Promise((resolve, reject) => {
    let stderr = "";
    const timer = setTimeout(
      () => reject(new Error("Chrome debugging endpoint did not start")),
      15000
    );
    chrome.once("error", error => {
      clearTimeout(timer);
      reject(error);
    });
    chrome.stderr.on("data", chunk => {
      stderr += chunk;
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    chrome.once("exit", code => {
      clearTimeout(timer);
      reject(
        new Error(`Chrome exited early (${code}): ${stderr.slice(-1500)}`)
      );
    });
  });
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (
      ["Runtime.exceptionThrown", "Runtime.consoleAPICalled"].includes(
        message.method
      )
    )
      console.error(JSON.stringify(message.params));
    if (!message.id || !pending.has(message.id)) return;
    const entry = pending.get(message.id);
    pending.delete(message.id);
    clearTimeout(entry.timer);
    if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
    else entry.resolve(message.result);
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Chrome command timed out: ${method}`));
      }, 20000);
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
  const page = (method, params) => send(method, params, sessionId);
  await page("Page.enable");
  await page("Runtime.enable");
  await mkdir("artifacts/channel-layout", { recursive: true });
  const results = [];
  const cases = [
    ...[
      "login",
      "signup",
      "reset-password",
      "publishing",
      "social",
      "advertising",
      "analytics",
      "analytics-ads",
      "analytics-social",
      "advertising-empty",
      "social-empty",
      "navigation",
      "navigation-ten",
      "product-home",
      "studio-overview",
      "advertising-overview",
      "social-overview",
      "billing-usage",
      "billing-plans",
      "planned-attribution",
      "optimize-overview",
    ].flatMap(page => [
      { width: 1705, height: 864, role: "owner", page },
      { width: 375, height: 750, role: "owner", page },
    ]),
    { width: 320, height: 568, role: "creator", page: "publishing" },
    { width: 375, height: 750, role: "creator", page: "billing-usage" },
    { width: 375, height: 750, role: "creator", page: "publishing" },
  ];
  for (const item of cases) {
    await page("Emulation.setDeviceMetricsOverride", {
      width: item.width,
      height: item.height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    // Render only locally authored fixture bytes in an empty browser document.
    // No localhost navigation, real account or provider request is needed.
    await page("Page.navigate", { url: "about:blank" });
    await new Promise(resolve => setTimeout(resolve, 100));
    const { frameTree } = await page("Page.getFrameTree");
    await page("Page.setDocumentContent", {
      frameId: frameTree.frame.id,
      html: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css} *{animation:none!important;transition:none!important;scroll-behavior:auto!important}</style></head><body><div id="root"></div></body></html>`,
    });
    const params = new URLSearchParams();
    Object.entries(item).forEach(([key, value]) =>
      params.set(key, String(value))
    );
    await page("Runtime.evaluate", {
      expression:
        `window.__fixtureQuery=${JSON.stringify(params.toString())};` + js,
    });
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      const check = await page("Runtime.evaluate", {
        expression:
          'Boolean(window.runChannelRegression && document.querySelector("h1"))',
        returnByValue: true,
      });
      if (check.result.value) {
        ready = true;
        break;
      }
    }
    if (!ready) {
      const diagnostic = await page("Runtime.evaluate", {
        expression:
          "JSON.stringify({body:document.body.innerText,html:document.documentElement.outerHTML.slice(-1000),ready:typeof window.runChannelRegression,url:location.href})",
        returnByValue: true,
      });
      console.error(JSON.stringify(diagnostic));
      const image = await page("Page.captureScreenshot", { format: "png" });
      await writeFile(
        "artifacts/channel-layout/error.png",
        Buffer.from(image.data, "base64")
      );
      throw new Error("Channel fixture did not render");
    }
    const evaluation = await page("Runtime.evaluate", {
      expression: "window.runChannelRegression()",
      awaitPromise: true,
      returnByValue: true,
    });
    const report = evaluation.result?.value;
    if (!report)
      throw new Error(
        `Fixture returned no test result: ${JSON.stringify(evaluation)}`
      );
    await page("Runtime.evaluate", { expression: inlineLiveBrandImages });
    await new Promise(resolve => setTimeout(resolve, 60));
    const name = `${item.page}-${item.width}x${item.height}-${item.role}`;
    const image = await page("Page.captureScreenshot", { format: "png" });
    await writeFile(
      `artifacts/channel-layout/${name}.png`,
      Buffer.from(image.data, "base64")
    );
    results.push({ name, ...report });
    if (report.width !== item.width || report.height !== item.height)
      throw new Error(`Incorrect test viewport: ${JSON.stringify(report)}`);
    if (!report.passed) throw new Error(`FAIL ${name}: ${report.error}`);
    console.log(
      `PASS ${name}: real page render, reachable workflow controls, no overflow`
    );
  }
  await writeFile(
    "artifacts/channel-layout/results.json",
    JSON.stringify(results, null, 2)
  );
  await send("Browser.close");
} finally {
  socket?.close();
  chrome.kill("SIGTERM");
  await rm(profile, {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 200,
  });
}
