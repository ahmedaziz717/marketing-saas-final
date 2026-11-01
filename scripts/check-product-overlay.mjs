import { build } from "esbuild";
import sharp from "sharp";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import {
  readFile,
  readdir,
  writeFile,
  mkdir,
  mkdtemp,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { inlineBuiltFonts } from "./inline-built-fonts.mjs";

const executable = [
  process.env.CHROME_BIN,
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
].find(p => p && existsSync(p));
if (!executable)
  throw new Error("Set CHROME_BIN to run overlay browser checks");
const bundle = await build({
  entryPoints: ["scripts/fixtures/product-overlay-editor.tsx"],
  bundle: true,
  write: false,
  outfile: "fixture.js",
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [
    {
      name: "offline-overlay-fixture",
      setup(api) {
        api.onResolve({ filter: /^@\/lib\/trpc$/ }, () => ({
          path: path.resolve("scripts/fixtures/product-overlay-trpc.ts"),
        }));
        api.onResolve({ filter: /^\.\/ActionCredits$/ }, () => ({
          path: "credits",
          namespace: "fixture",
        }));
        api.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
          contents: "export const ActionCredits = () => null;",
          loader: "js",
        }));
      },
    },
  ],
});
const js = bundle.outputFiles.find(file => file.path.endsWith(".js")).text;
const cssFiles = (await readdir("dist/public/assets")).filter(p =>
  p.endsWith(".css")
);
const css = await inlineBuiltFonts(
  (
    await Promise.all(
      cssFiles.map(p => readFile(`dist/public/assets/${p}`, "utf8"))
    )
  ).join("\n")
);
const source = await sharp("server/__fixtures__/product-overlay/image816.png")
  .trim()
  .png()
  .toBuffer();
const background = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080"><rect width="1080" height="1080" fill="#182544"/><text x="60" y="120" fill="white" font-size="54">Fixture headline</text><text x="60" y="1000" fill="#92bbff" font-size="30">Preserved background and logo area</text></svg>'
);
const cases = [
  { width: 1440, height: 1000, mobile: false, applied: false },
  { width: 375, height: 812, mobile: true, applied: false },
  { width: 320, height: 640, mobile: true, applied: false },
  { width: 1440, height: 1000, mobile: false, applied: true },
];
const fixture = applied => ({
  aligned: 0,
  saved: [],
  data: {
    width: 1080,
    height: 1080,
    applied,
    automaticFailure: applied ? undefined : "alignment_unavailable",
    revision: "fixture-revision",
    designUrl: `data:image/svg+xml;base64,${background.toString("base64")}`,
    layers: [
      {
        left: 583,
        top: 350,
        width: 442,
        height: 654,
        aspect: 384 / 568,
        sourceWidth: 384,
        sourceHeight: 568,
        preview: `data:image/png;base64,${source.toString("base64")}`,
      },
    ],
    replacementSources: [],
  },
});
const profile = await mkdtemp(path.join(tmpdir(), "overlay-browser-"));
const chrome = spawn(
  executable,
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] }
);
let socket;
try {
  const endpoint = await new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(
      () => reject(new Error("Chrome startup timed out")),
      15000
    );
    chrome.once("error", reject);
    chrome.stderr.on("data", b => {
      output += b;
      const match = output.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
  });
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let next = 0;
  const pending = new Map();
  socket.addEventListener("message", event => {
    const value = JSON.parse(event.data);
    const waiter = pending.get(value.id);
    if (!waiter) return;
    pending.delete(value.id);
    clearTimeout(waiter.timer);
    value.error
      ? waiter.reject(new Error(JSON.stringify(value.error)))
      : waiter.resolve(value.result);
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++next;
      const timer = setTimeout(
        () => reject(new Error(method + " timed out")),
        20000
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
  const page = (method, params) => send(method, params, sessionId);
  const evaluate = async expression => {
    const result = await page("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails)
      throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const click = label =>
    evaluate(
      `Array.from(document.querySelectorAll('button')).find(b=>b.textContent===${JSON.stringify(label)}).click()`
    );
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  await page("Page.enable");
  await mkdir("artifacts/product-overlay", { recursive: true });
  const results = [];
  for (const item of cases) {
    await page("Emulation.setDeviceMetricsOverride", {
      width: item.width,
      height: item.height,
      mobile: item.mobile,
      deviceScaleFactor: 1,
    });
    await page("Page.navigate", { url: "about:blank" });
    await pause(40);
    const { frameTree } = await page("Page.getFrameTree");
    await page("Page.setDocumentContent", {
      frameId: frameTree.frame.id,
      html: `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css} *{animation:none!important;transition:none!important}</style><div id="root"></div>`,
    });
    await evaluate(
      `window.__overlayFixture=${JSON.stringify(fixture(item.applied))};${js}`
    );
    for (let i = 0; i < 80; i++) {
      if (await evaluate(`!!document.querySelector('button')`)) break;
      await pause(50);
    }
    await click("Adjust original product");
    await pause(150);
    const beginManualIfNeeded = async () => {
      if (item.applied) return;
      assert.equal(
        await evaluate(
          `!!document.querySelector('img[alt="Original product 1"]')`
        ),
        false,
        "unprepared overlay must not replace the complete design"
      );
      assert.equal(
        await evaluate(
          `Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Save as new version').disabled`
        ),
        true
      );
      await click("Place manually at native size");
      await pause(40);
    };
    const resetForEditing = async () => {
      await click("Reset placement");
      await pause(40);
      await beginManualIfNeeded();
    };
    await beginManualIfNeeded();

    assert.equal(
      await evaluate(
        `document.querySelector('img[alt="Original product 1"]')?.complete`
      ),
      true
    );
    const initial = await evaluate(
      `(()=>{const p=document.querySelector('img[alt="Original product 1"]');const r=p.getBoundingClientRect();const d=document.querySelector('[role="dialog"]');return {left:p.style.left,top:p.style.top,x:r.x+r.width/2,y:r.y+r.height/2,overflow:d.scrollWidth>d.clientWidth+1};})()`
    );
    assert.equal(initial.overflow, false, "dialog has horizontal overflow");
    const name = `${item.width}x${item.height}-${item.applied ? "applied" : "failed"}`;
    await writeFile(
      `artifacts/product-overlay/${name}.png`,
      Buffer.from(
        (await page("Page.captureScreenshot", { format: "png" })).data,
        "base64"
      )
    );
    if (item.mobile) {
      await page("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: initial.x, y: initial.y }],
      });
      await page("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: initial.x - 20, y: initial.y - 15 }],
      });
      await page("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    } else {
      await page("Input.dispatchMouseEvent", {
        type: "mousePressed",
        x: initial.x,
        y: initial.y,
        button: "left",
        clickCount: 1,
      });
      await page("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: initial.x - 20,
        y: initial.y - 15,
        button: "left",
        buttons: 1,
      });
      await page("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        x: initial.x - 20,
        y: initial.y - 15,
        button: "left",
        clickCount: 1,
      });
    }
    await pause(50);
    assert.notEqual(
      await evaluate(
        `document.querySelector('img[alt="Original product 1"]').style.left`
      ),
      initial.left,
      "drag did not move product"
    );
    await resetForEditing();
    await pause(40);
    assert.equal(
      await evaluate(
        `document.querySelector('img[alt="Original product 1"]')?.style.left`
      ),
      initial.left
    );
    // Resize through a real pointer on the scaled canvas, not synthetic input values.
    const handle = await evaluate(
      `(()=>{const h=document.querySelector('[aria-label="Resize product from nw corner"]');const r=h.getBoundingClientRect();const p=document.querySelector('img[alt="Original product 1"]');return {x:r.x+r.width/2,y:r.y+r.height/2,width:parseFloat(p.style.width)};})()`
    );
    if (item.mobile) {
      await page("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: handle.x, y: handle.y }],
      });
      await page("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: handle.x + 12, y: handle.y + 18 }],
      });
      await page("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    } else {
      await page("Input.dispatchMouseEvent", {
        type: "mousePressed",
        x: handle.x,
        y: handle.y,
        button: "left",
        clickCount: 1,
      });
      await page("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: handle.x + 12,
        y: handle.y + 18,
        button: "left",
        buttons: 1,
      });
      await page("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        x: handle.x + 12,
        y: handle.y + 18,
        button: "left",
        clickCount: 1,
      });
    }
    await pause(50);
    const resized = await evaluate(
      `(()=>{const p=document.querySelector('img[alt="Original product 1"]');return {width:parseFloat(p.style.width),height:parseFloat(p.style.height)};})()`
    );
    assert.notEqual(
      resized.width,
      handle.width,
      "corner did not resize product"
    );
    assert.ok(
      Math.abs(resized.width / resized.height - 384 / 568) < 0.003,
      "corner resize distorted source proportions"
    );
    await resetForEditing();
    await pause(40);
    await evaluate(
      `Array.from(document.querySelectorAll('label')).find(l=>l.textContent.includes('Compare with original design')).querySelector('input').click()`
    );
    await pause(30);
    assert.equal(
      await evaluate(
        `!!document.querySelector('img[alt="Original product 1"]')`
      ),
      false
    );
    await resetForEditing();
    await pause(30);
    assert.equal(
      await evaluate(
        `!!document.querySelector('img[alt="Original product 1"]')`
      ),
      true
    );
    await evaluate(
      `(()=>{const i=document.querySelector('[aria-label="height in pixels"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'700');i.dispatchEvent(new Event('input',{bubbles:true}));})()`
    );
    await pause(30);
    assert.ok(
      Math.abs(
        parseFloat(
          await evaluate(
            `document.querySelector('img[alt="Original product 1"]').style.height`
          )
        ) -
          (700 / 1080) * 100
      ) < 0.001
    );
    assert.equal(
      await evaluate(
        `Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Save as new version').disabled`
      ),
      true
    );
    const resetVisible = await evaluate(
      `(()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Reset placement');b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;})()`
    );
    assert.equal(
      resetVisible,
      true,
      "reset action must remain reachable by scrolling"
    );
    await writeFile(
      `artifacts/product-overlay/${name}-controls.png`,
      Buffer.from(
        (await page("Page.captureScreenshot", { format: "png" })).data,
        "base64"
      )
    );
    const calls = await evaluate(
      `({aligned:window.__overlayFixture.aligned,saves:window.__overlayFixture.saved.length})`
    );
    assert.deepEqual(calls, { aligned: 0, saves: 0 });
    await resetForEditing();
    results.push({
      name,
      passed: true,
      drag: item.mobile ? "touch" : "mouse",
      ...calls,
    });
    console.log(
      `PASS ${name}: visible, draggable, resettable; proportional mouse/touch resizing; consent retained; no paid/save calls`
    );
  }
  await writeFile(
    "artifacts/product-overlay/results.json",
    JSON.stringify(results, null, 2)
  );
  await send("Browser.close");
} finally {
  socket?.close();
  chrome.kill();
  if (
    !path.resolve(profile).startsWith(path.resolve(tmpdir()) + path.sep) ||
    !path.basename(profile).startsWith("overlay-browser-")
  )
    throw new Error("Unexpected temporary profile path");
  await rm(profile, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 200,
  });
}
