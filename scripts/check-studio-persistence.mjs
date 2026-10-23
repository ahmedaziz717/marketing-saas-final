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

// Exercise actual Studio components and browser history with synthetic data in
// an isolated profile. No production accounts, submissions or model calls.
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
  entryPoints: ["scripts/fixtures/channel-workspace.tsx"],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  loader: { ".css": "empty" },
  alias: Object.fromEntries(
    [
      "@/_core/hooks/useAuth",
      "@/hooks/useWorkspace",
      "@/components/WorkspaceGate",
    ].map(id => [
      id,
      path.resolve("scripts/fixtures/channel-workspace-stubs.tsx"),
    ])
  ),
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
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    res.end(js);
    return;
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(
    `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}\n*{animation:none!important;transition:none!important;scroll-behavior:auto!important}</style></head><body><div id="root"></div><script>window.__fixtureQuery="?page=creative-editor";window.__fixtureBrowserHistory=true;</script><script src="/fixture.js"></script></body></html>`
  );
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = await mkdtemp(
  path.join(tmpdir(), "frame-studio-draft-chrome-")
);
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
  socket.addEventListener("message", event => {
    const m = JSON.parse(event.data);
    if (m.method === "Runtime.exceptionThrown")
      console.error(JSON.stringify(m.params));
  });

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

  const waitFor = async expression => {
    for (let i = 0; i < 150; i++) {
      if (await evaluate(`Boolean(${expression})`)) return;
      await new Promise(r => setTimeout(r, 50));
    }
    throw new Error(
      "Browser assertion timed out: " +
        expression +
        "; " +
        (await evaluate("document.body.innerText.slice(0,2000)"))
    );
  };
  const click = async name => {
    await evaluate(
      `(()=>{const name=${JSON.stringify(name)};const b=Array.from(document.querySelectorAll("button")).find(b=>b.getAttribute("aria-label")===name||b.textContent.trim()===name||b.querySelector("strong")?.textContent.trim()===name);if(!b)throw Error("Missing button: "+name);b.click();})()`
    );
  };
  const fill = async (label, value) => {
    await evaluate(
      `(()=>{const input=${inputExpression(label)};if(!input)throw Error("Missing input");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event("input",{bubbles:true}));})()`
    );
  };
  const inputExpression = label =>
    `Array.from(document.querySelectorAll('input')).find(i=>i.getAttribute('aria-label')===${JSON.stringify(label)})`;
  const showSources = async () => {
    await click("Open Subject & sources category");
    await waitFor(
      'Array.from(document.querySelectorAll("button")).some(b=>b.textContent.includes("Page URL"))'
    );
    await click("Page URL");
    await waitFor(inputExpression("Page URL"));
  };
  await mkdir("artifacts/studio-persistence", { recursive: true });
  for (const width of [1705, 375])
    for (const theme of ["light", "dark"]) {
      await page("Emulation.setDeviceMetricsOverride", {
        width,
        height: 800,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await page("Page.navigate", { url: origin });
      await waitFor(inputExpression("Creative name"));
      await evaluate(
        'localStorage.clear();localStorage.setItem("theme",' +
          JSON.stringify(theme) +
          ")"
      );
      await page("Page.reload");
      await waitFor(inputExpression("Creative name"));
      await fill("Creative name", "Retained " + width + " " + theme);
      await showSources();
      await fill("Page URL", "https://example.test/services/managed-it");
      await click("Service");
      await waitFor(
        'Object.values(localStorage).some(v=>v.includes("https://example.test/services/managed-it"))'
      );
      await page("Page.navigate", { url: origin + "/app/analytics/studio" });
      await waitFor('document.body.innerText.includes("Insights Studio")');
      await evaluate("history.back()");
      await waitFor(
        inputExpression("Creative name") +
          "?.value===" +
          JSON.stringify("Retained " + width + " " + theme)
      );
      await evaluate("history.forward()");
      await waitFor('document.body.innerText.includes("Insights Studio")');
      await evaluate("history.back()");
      await waitFor(
        inputExpression("Creative name") +
          "?.value===" +
          JSON.stringify("Retained " + width + " " + theme)
      );
      await showSources();
      await waitFor(
        inputExpression("Page URL") +
          '?.value==="https://example.test/services/managed-it"'
      );
      await page("Page.reload");
      await waitFor(inputExpression("Creative name"));
      await showSources();
      await waitFor(
        inputExpression("Page URL") +
          '?.value==="https://example.test/services/managed-it"'
      );
      const shot = await page("Page.captureScreenshot", { format: "png" });
      await writeFile(
        "artifacts/studio-persistence/" + width + "-" + theme + ".png",
        Buffer.from(shot.data, "base64")
      );
      if (await evaluate("window.__fixtureMutations.length"))
        throw new Error("Restoration submitted a mutation");
      await evaluate("window.confirm=()=>false");
      await click("Reset setup");
      await waitFor(
        inputExpression("Page URL") +
          '?.value==="https://example.test/services/managed-it"'
      );
      await evaluate("window.confirm=()=>true");
      await click("Reset setup");
      await showSources();
      await waitFor(inputExpression("Page URL") + '?.value===""');
      if (await evaluate("window.__fixtureMutations.length"))
        throw new Error("Reset submitted a mutation");
      console.log(
        "PASS " +
          width +
          " " +
          theme +
          ": Studio URL/name survive switching, Back/Forward and refresh; Reset requires confirmation; zero submissions"
      );
    }
  await send("Browser.close");
} finally {
  socket?.close();
  chrome.kill("SIGTERM");
  await new Promise(resolve => server.close(resolve));
  if (
    path.dirname(path.resolve(profile)) !== path.resolve(tmpdir()) ||
    !path.basename(profile).startsWith("frame-studio-draft-chrome-")
  )
    throw new Error("Unexpected temporary profile path");
  await rm(profile, {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 200,
  });
}
