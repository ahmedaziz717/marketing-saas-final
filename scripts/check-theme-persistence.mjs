import { inlineBuiltFonts } from "./inline-built-fonts.mjs";
import { build } from "esbuild";
import { createServer } from "node:http";
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

// Test the real theme provider in isolated Chrome tabs, without accounts or
// production data. Include real storage events, refreshes and OS media changes.
const executable = [
  process.env.CHROME_BIN,
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/opt/google/chrome/chrome",
].find(file => file && existsSync(file));
if (!executable)
  throw new Error(
    "Chrome/Chromium is required for appearance checks. Set CHROME_BIN."
  );
const bundle = await build({
  entryPoints: ["scripts/fixtures/theme-persistence.tsx"],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
});
const js = bundle.outputFiles[0].text;
const cssFiles = (await readdir("dist/public/assets")).filter(file =>
  file.endsWith(".css")
);
if (!cssFiles.length)
  throw new Error("Build the application before running browser checks.");
let css = (
  await Promise.all(
    cssFiles.map(file =>
      readFile(path.join("dist/public/assets", file), "utf8")
    )
  )
).join("\n");
css = await inlineBuiltFonts(css);
const server = createServer((req, res) => {
  if (req.url === "/fixture.js") {
    res.setHeader("Content-Type", "application/javascript");
    res.end(js);
    return;
  }
  res.setHeader("Content-Type", "text/html");
  res.end(
    `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}\n*{animation:none!important;transition:none!important;scroll-behavior:auto!important}</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>`
  );
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = await mkdtemp(path.join(tmpdir(), "frame-theme-chrome-"));
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
      () => reject(new Error(`Chrome debugging endpoint did not start: ${stderr.slice(-1500)}`)),
      30000
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

  const evaluate = async (expression, session = sessionId) => {
    const result = await send(
      "Runtime.evaluate",
      { expression, returnByValue: true, awaitPromise: true },
      session
    );
    if (result.exceptionDetails)
      throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const waitFor = async (expected, session = sessionId) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const actual = await evaluate(
        'document.querySelector("#appearance")?.textContent',
        session
      );
      if (actual === expected) return;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error(`Theme did not settle to ${expected}`);
  };
  const click = id =>
    evaluate(`document.getElementById(${JSON.stringify(id)}).click()`);
  await mkdir("artifacts/theme-persistence", { recursive: true });
  for (const width of [1586, 375]) {
    await page("Emulation.setDeviceMetricsOverride", {
      width,
      height: 750,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await page("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-color-scheme", value: "light" }],
    });
    await page("Page.navigate", { url: origin });
    await waitFor(width === 1586 ? "system/light" : "light/light");
    for (const choice of ["dark", "light", "system"]) {
      await click(choice);
      await waitFor(`${choice}/${choice === "dark" ? "dark" : "light"}`);
      await page("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-color-scheme", value: "dark" }],
      });
      const expected = `${choice}/${choice === "system" ? "dark" : choice}`;
      await waitFor(expected);
      await click("navigate");
      await waitFor("light/light");
      await click("navigate");
      await waitFor(expected);
      await page("Page.reload");
      await waitFor(expected);
      await page("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-color-scheme", value: "light" }],
      });
      await waitFor(`${choice}/${choice === "dark" ? "dark" : "light"}`);
      console.log(
        `PASS ${width} ${choice}: explicit selection, OS change, public/workspace navigation, refresh`
      );
    }
    await click("dark");
    await waitFor("dark/dark");
    await evaluate(
      'window.dispatchEvent(new StorageEvent("storage", {key:"evokeloop-appearance",newValue:"light",storageArea:localStorage}))'
    );
    await waitFor("dark/dark");
    await evaluate(
      'window.dispatchEvent(new StorageEvent("storage", {key:"evokeloop-appearance",newValue:null,storageArea:localStorage}))'
    );
    await waitFor("dark/dark");
    const second = await send("Target.createTarget", { url: origin });
    const attached = await send("Target.attachToTarget", {
      targetId: second.targetId,
      flatten: true,
    });
    await waitFor("dark/dark", attached.sessionId);
    await evaluate(
      'document.getElementById("light").click()',
      attached.sessionId
    );
    await waitFor("light/light", attached.sessionId);
    await waitFor("light/light");
    await send("Target.closeTarget", { targetId: second.targetId });
    console.log(
      `PASS ${width}: stale/deleted events ignored, actual second-tab choice synchronized`
    );
    const screenshot = await page("Page.captureScreenshot", { format: "png" });
    await writeFile(
      `artifacts/theme-persistence/${width}.png`,
      Buffer.from(screenshot.data, "base64")
    );
  }
  await send("Browser.close");
} finally {
  socket?.close();
  chrome.kill("SIGTERM");
  await new Promise(resolve => server.close(resolve));
  await rm(profile, {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 200,
  });
}
