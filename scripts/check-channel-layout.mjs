import { inlineBuiltFonts } from "./inline-built-fonts.mjs";
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
  // Styles are loaded from the production CSS bundle below.
  loader: { ".css": "empty" },
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
let css = (
  await Promise.all(
    cssFiles.map(file =>
      readFile(path.join("dist/public/assets", file), "utf8")
    )
  )
).join("\n");
css = await inlineBuiltFonts(css);
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
  await mkdir("artifacts/ad-copy-layout", { recursive: true });
  const results = [];
  const cases = [
    ...[
      "optimization-intelligence",
      "onboarding",
      "account-invite",
      ...[
        "accounts",
        "usage",
        "billing",
        "tiers",
        "models",
        "pricing",
        "finance",
        "audit",
      ].map(section => `admin-${section}`),
      "catalog-home",
      "catalog-import",
      "brand-workspace",
      "workspace-invite",
      "not-found",
      "admin-website",
      ...[
        "team",
        "integrations",
        "activity",
        "notifications",
        "security",
        "data",
        "developer",
        "prompts",
      ].map(section => `settings-${section}`),
      ...["activate", "measure", "optimize"].flatMap(family => [
        `apps-${family}`,
        `workflows-${family}`,
      ]),
      "creative-overview",
      "creative-editor",
      "creative-direction",
      "creative-history",
      "creative-confirmation",
      "creative-scene",
      "creative-type",
      "creative-people",
      "creative-checkpoint",
      "creative-video",
      "insights-studio",
      "optimization-studio",
      "model-picker",
      "brand-kit",
      "directory-creative",
      "platform-admin",
      "login",
      "signup",
      "reset-password",
      "publishing",
      "publishing-live",
      "publishing-approved",
      "activation-failed",
      "activation-unknown",
      "activation-published",
      "activation-processing",
      "activation-scheduled",
      "social",
      "advertising",
      "analytics",
      "report-layout",
      "product-facts",
      "catalog-gallery",
      "gallery-elements-image",
      "gallery-elements-video",
      "gallery-elements-app",
      "catalog-components",
      "catalog-pilot",
      "enhance-image",
      "analytics-ads",
      "analytics-social",
      "advertising-empty",
      "social-empty",
      "navigation",
      "navigation-ten",
      "product-home",
      "apps-directory",
      "workflows-directory",
      "studio-overview",
      "workflow-library",
      "workflow-density",
      "workflow-app-preview",
      "workflow-model-form",
      "studio-channels",
      "video-studio",
      "video-ugc",
      "studio-drafts",
      "studio-post",
      "studio-post-media",
      "studio-post-empty",
      "studio-media",
      "studio-legacy",
      "studio-ad",
      "studio-ad-setup",
      "studio-ad-create",
      "studio-ad-warning",
      "catalog-api-import",
      "google-connect",
      "google-selection",
      "google-empty",
      "google-manage",
      "google-campaigns",
      "google-campaign-new",
      "studio-ad-copy",
      "campaign-plans",
      "asset-library",
      "roadmap",
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
    ...[
      "activation-failed",
      "workflow-density",
      "workflow-app-preview",
      "workflow-model-form",
      "studio-channels",
      "creative-editor",
      "creative-scene",
      "creative-type",
      "creative-people",
      "creative-video",
      "studio-ad-copy",
      "insights-studio",
      "optimization-studio",
    ].map(page => ({ width: 1366, height: 768, role: "owner", page })),
    { width: 768, height: 1024, role: "owner", page: "asset-library" },
    { width: 320, height: 740, role: "owner", page: "asset-library" },
    { width: 1820, height: 943, role: "owner", page: "creative-scene" },
    { width: 1820, height: 943, role: "owner", page: "creative-type" },
    { width: 768, height: 1024, role: "owner", page: "creative-scene" },
    { width: 1906, height: 938, role: "owner", page: "creative-people" },
    { width: 768, height: 1024, role: "owner", page: "creative-people" },
    { width: 320, height: 740, role: "owner", page: "creative-people" },
    ...[
      "studio-ad-warning",
      "catalog-api-import",
      "google-selection",
      "google-manage",
      "google-campaigns",
      "google-campaign-new",
    ].flatMap(page => [
      { width: 1366, height: 768, role: "owner", page },
      { width: 375, height: 600, role: "owner", page },
    ]),
    { width: 320, height: 568, role: "creator", page: "publishing" },
    { width: 375, height: 750, role: "creator", page: "billing-usage" },
    { width: 375, height: 750, role: "creator", page: "publishing" },
  ];
  for (const item of cases
    .flatMap(item => [
      { ...item, theme: "light" },
      { ...item, theme: "dark" },
    ])
    .filter(
      item =>
        !process.env.LAYOUT_PAGES ||
        process.env.LAYOUT_PAGES.split(",").includes(item.page)
    )) {
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
          'Boolean(window.runChannelRegression && document.querySelector("h1, h2"))',
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
    if (["model-picker", "video-ugc", "creative-people"].includes(item.page)) {
      const sheets = Object.fromEntries(
        await Promise.all(
          (await readdir("client/public/people"))
            .filter(f => f.endsWith(".webp"))
            .map(async f => [
              "/people/" + f,
              "data:image/webp;base64," +
                (await readFile("client/public/people/" + f)).toString(
                  "base64"
                ),
            ])
        )
      );
      await page("Runtime.evaluate", {
        expression: `(() => { const sheets = ${JSON.stringify(sheets)}; for (const el of document.querySelectorAll('[role="img"]')) { const url = el.style.backgroundImage.slice(5, -2); if (sheets[url]) el.style.backgroundImage = 'url("' + sheets[url] + '")'; } })()`,
      });
    }
    const sources = await page("Runtime.evaluate", {
      expression: `Array.from(document.querySelectorAll('img')).map(img => img.getAttribute('src')).filter(src => src?.startsWith('/studio-art/'))`,
      returnByValue: true,
    });
    const art = {};
    for (const src of new Set(sources.result.value ?? [])) {
      const file = path.join("client/public", src);
      if (existsSync(file))
        art[src] =
          "data:image/webp;base64," + (await readFile(file)).toString("base64");
    }
    await page("Runtime.evaluate", {
      expression: `(() => { const art = ${JSON.stringify(art)}; for (const img of document.querySelectorAll('img')) { if (art[img.getAttribute('src')]) img.src = art[img.getAttribute('src')]; } })()`,
    });
    await new Promise(resolve => setTimeout(resolve, 60));
    if (
      [
        "creative-editor",
        "creative-scene",
        "creative-type",
        "creative-video",
        "insights-studio",
        "optimization-studio",
        "studio-ad-copy",
      ].includes(item.page) &&
      item.width > 700
    ) {
      if (
        [
          "creative-editor",
          "creative-scene",
          "creative-type",
          "creative-video",
        ].includes(item.page)
      ) {
        // A real section/category click in the fixture should reveal the full tile.
        await new Promise(resolve => setTimeout(resolve, 500));
        const navigation = await page("Runtime.evaluate", {
          expression: `(() => {
            const card = document.querySelector('.journey-editor .cfg-card')?.getBoundingClientRect();
            const nav = document.querySelector('.journey-sections')?.getBoundingClientRect();
            const footer = document.querySelector('.cfg-bottom')?.getBoundingClientRect();
            return {top: card?.top, bottom: card?.bottom, navBottom: nav?.bottom, footerTop: footer?.top,
              passed: !!card && !!nav && !!footer && card.top >= nav.bottom && card.bottom <= footer.top};
          })()`,
          returnByValue: true,
        });
        report.choiceNavigation = navigation.result.value;
        if (!navigation.result.value?.passed) {
          report.passed = false;
          report.error = `Category navigation must reveal the taller choice without sticky controls covering it: ${JSON.stringify(navigation.result.value)}`;
        }
      }
      const spacing = await page("Runtime.evaluate", {
        expression: `(async () => {
          window.scrollTo(0, 0);
          for (let el = document.querySelector('.cfg-root'); el; el = el.parentElement) el.scrollTop = 0;
          await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
          const rect = selector => {
            const r = document.querySelector(selector)?.getBoundingClientRect();
            return r && {top: r.top, bottom: r.bottom, height: r.height};
          };
          return {
            preview: rect('.journey-summary'),
            expanded: document.querySelector('.journey-summary')?.dataset.expanded === 'true',
            choices: rect('.journey-editor .cfg-card'),
            artwork: rect('.journey-editor .cfg-card-art'),
            previewArt: rect('.journey-summary .cfg-preview'),
            sections: rect('.journey-sections > button'),
            sectionDetailsVisible: [...document.querySelectorAll('.journey-sections small, .journey-section-progress')].every(el => el.getBoundingClientRect().height > 0),
            footer: rect('.cfg-bottom'),
            categories: rect('.journey-rail-scroll')
          };
        })()`,
        awaitPromise: true,
        returnByValue: true,
      });
      const layout = spacing.result.value;
      report.aboveFold = layout;
      if (
        !layout?.sections ||
        // Compact navigation retains details and comfortably exceeds a 44px target.
        layout.sections.height < 64 ||
        layout.sections.height > 104 ||
        (item.width > 1000 && !layout.sectionDetailsVisible) ||
        ([
          "creative-editor",
          "creative-scene",
          "creative-type",
          "creative-video",
        ].includes(item.page) &&
          (!layout.previewArt ||
            layout.previewArt.height < 200 ||
            !layout.artwork ||
            layout.artwork.height < 100 ||
            layout.artwork.height > 140))
      ) {
        report.passed = false;
        report.error = `Studio sections and preview retain detail while choice artwork stays compact: ${JSON.stringify(layout)}`;
      }
      if (
        [
          "creative-editor",
          "creative-scene",
          "creative-type",
          "creative-video",
        ].includes(item.page) &&
        (!layout?.expanded ||
          layout.preview?.top < 64 ||
          !layout.choices ||
          !layout.footer ||
          !layout.categories ||
          layout.choices.top + 48 > layout.footer.top)
      ) {
        report.passed = false;
        report.error = `Expanded preview stays open and the choice gallery begins above the footer: ${JSON.stringify(layout)}`;
      }
    }
    if (
      item.width > 700 &&
      [
        "creative-editor",
        "creative-scene",
        "creative-type",
        "creative-video",
        "insights-studio",
        "optimization-studio",
        "studio-ad-setup",
      ].includes(item.page)
    ) {
      const sticky = await page("Runtime.evaluate", {
        expression: `(async () => {
          const root = document.querySelector('.cfg-root');
          const rail = root?.querySelector('.journey-overview');
          const nav = root?.querySelector('.journey-sections');
          if (!rail || !nav) return {passed: false, error: 'Missing shared category rail'};
          const scrolls = [];
          for (let el = root; el; el = el.parentElement) {
            if (el.scrollHeight > el.clientHeight && /auto|scroll/.test(getComputedStyle(el).overflowY)) scrolls.push(el);
          }
          if (!scrolls.length) scrolls.push(document.scrollingElement);
          const positions = scrolls.map(el => el.scrollTop);
          const before = rail.getBoundingClientRect().top;
          scrolls.forEach(el => el.scrollTop = Math.min(el.scrollHeight - el.clientHeight, el.scrollTop + 460));
          await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
          const rect = rail.getBoundingClientRect(), navRect = nav.getBoundingClientRect();
          const footer = root.querySelector('.cfg-bottom, .activation-footer')?.getBoundingClientRect();
          const panel = rail.closest('.journey-panel').getBoundingClientRect();
          const enoughRoom = panel.bottom - rect.height > navRect.bottom + 16;
          const stuck = getComputedStyle(rail).position === 'sticky';
          const offsets = Math.abs(parseFloat(getComputedStyle(root).getPropertyValue('--cfg-sections-height')) - navRect.height) < 1;
          const clearHeader = !enoughRoom || rect.top >= navRect.bottom - 1;
          const clearFooter = !footer || rect.bottom <= footer.top - 4;
          const moved = scrolls.some((el, i) => el.scrollTop > positions[i] + 10);
          const result = {passed: stuck && offsets && clearHeader && clearFooter, before, top: rect.top, bottom: rect.bottom, navBottom: navRect.bottom, footerTop: footer?.top, moved, enoughRoom};
          scrolls.forEach((el, i) => el.scrollTop = positions[i]);
          return result;
        })()`,
        awaitPromise: true,
        returnByValue: true,
      });
      report.stickyNavigation = sticky.result.value;
      if (!sticky.result.value?.passed) {
        report.passed = false;
        report.error =
          "Sticky categories overlap navigation or footer: " +
          JSON.stringify(sticky.result.value);
      }
      const categoryRail = await page("Runtime.evaluate", {
        expression: `(async () => {
          const rail = document.querySelector('.journey-rail-scroll');
          const cards = Array.from(rail.querySelectorAll('.journey-category'));
          const up = document.querySelector('[aria-label="Scroll categories up"]');
          const down = document.querySelector('[aria-label="Scroll categories down"]');
          const wait = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
          const shown = button => button.getClientRects().length > 0;
          await wait();
          const original = rail.scrollTop;
          const roomy = cards.every(card => card.getBoundingClientRect().height >= 90 && card.querySelector('.journey-category-icon svg'));
          rail.scrollTop = 0;
          await wait();
          const overflows = rail.scrollHeight > rail.clientHeight + 2;
          const start = !shown(up) && shown(down) === overflows;
          let scrollButtonWorks = true;
          let end = true;
          let lastReachable = true;
          if (overflows) {
            down.click();
            await new Promise(r => setTimeout(r, 450));
            scrollButtonWorks = rail.scrollTop > 0 && shown(up);
            rail.scrollTop = rail.scrollHeight;
            await wait();
            end = shown(up) && !shown(down);
            const last = cards.at(-1).getBoundingClientRect();
            const viewport = rail.getBoundingClientRect();
            lastReachable = last.bottom <= viewport.bottom + 1 && last.top >= viewport.top;
          }
          rail.scrollTop = original;
          await wait();
          return {passed: roomy && start && scrollButtonWorks && end && lastReachable, roomy, overflows, start, scrollButtonWorks, end, lastReachable, height: rail.clientHeight, contentHeight: rail.scrollHeight};
        })()`,
        awaitPromise: true,
        returnByValue: true,
      });
      report.categoryRail = categoryRail.result.value;
      if (!categoryRail.result.value?.passed) {
        report.passed = false;
        report.error =
          "Category tiles or overflow navigation failed: " +
          JSON.stringify(categoryRail.result.value);
      }
    }
    const name = `${item.page}-${item.width}x${item.height}-${item.role}-${item.theme}`;
    if (["google-campaign-new", "studio-ad-copy"].includes(item.page)) {
      // Actual product DOM and production CSS, not a reconstructed mockup.
      // Reference inspected: EvokeLoop-Unified-Ad-Copy-Concept.png.
      const copy = await page("Runtime.evaluate", {
        expression: `(() => {
          const root = document.querySelector('.ad-copy-workspace');
          return root ? {fields: [...root.querySelectorAll('.ad-copy-field h4')].map(el => el.textContent),
            background: getComputedStyle(root).backgroundColor, color: getComputedStyle(root).color,
            theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light'} : null;
        })()`,
        returnByValue: true,
      });
      report.copyWorkspace = copy.result.value;
      if (!copy.result.value || copy.result.value.theme !== item.theme) {
        report.passed = false;
        report.error = "Copy workspace must render in the requested appearance";
      } else {
        // Wait for the real save notification to dismiss; never hide UI for evidence.
        let toastVisible = true;
        for (let attempt = 0; attempt < 80 && toastVisible; attempt++) {
          const toast = await page("Runtime.evaluate", {
            expression: `!!document.querySelector('[data-sonner-toast][data-visible="true"]:not([data-removed="true"])')`,
            returnByValue: true,
          });
          toastVisible = toast.result.value;
          if (toastVisible) await new Promise(resolve => setTimeout(resolve, 100));
        }
        if (toastVisible) {
          report.passed = false;
          report.error = "Save toast did not dismiss before copy screenshots";
        }
        const captureCopy = async (selector, suffix) => {
          await page("Runtime.evaluate", {
            expression: `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center', behavior:'instant'})`,
          });
          await new Promise(resolve => setTimeout(resolve, 100));
          const screenshot = await page("Page.captureScreenshot", { format: "png" });
          await writeFile(`artifacts/ad-copy-layout/${name}-${suffix}.png`, Buffer.from(screenshot.data, "base64"));
        };
        await captureCopy('.ad-copy-workspace-header', 'workspace-top');
        for (let fieldIndex = 0; fieldIndex < copy.result.value.fields.length; fieldIndex++) {
          const selector = `.ad-copy-workspace .ad-copy-field:nth-of-type(${fieldIndex + 1})`;
          await captureCopy(selector, `field-${fieldIndex + 1}`);
          await captureCopy(`${selector} .ad-copy-drafts`, `draft-${fieldIndex + 1}`);
        }
      }
      await writeFile(`artifacts/ad-copy-layout/${name}.json`, JSON.stringify({name, ...report}, null, 2));
    }
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
