import { inlineBuiltFonts } from "./inline-built-fonts.mjs";
// Local fixture preview. Synthetic records only; no provider or production writes.
import { build } from "esbuild";
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
const root = process.cwd();
const bundle = await build({
  entryPoints: ["scripts/fixtures/channel-workspace.tsx"],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  loader: { ".css": "empty" },
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: Object.fromEntries(
    [
      "@/_core/hooks/useAuth",
      "@/hooks/useWorkspace",
      "@/components/WorkspaceGate",
    ].map(key => [
      key,
      path.resolve("scripts/fixtures/channel-workspace-stubs.tsx"),
    ])
  ),
});
const js = bundle.outputFiles[0].text;
let css = (
  await Promise.all(
    (await readdir("dist/public/assets"))
      .filter(f => f.endsWith(".css"))
      .map(f => readFile(path.join("dist/public/assets", f), "utf8"))
  )
).join("\n");
css = await inlineBuiltFonts(css);
createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (url.pathname === "/fixture.js") {
    res.setHeader("Content-Type", "text/javascript");
    res.end(js);
    return;
  }
  if (url.pathname === "/fixture.css") {
    res.setHeader("Content-Type", "text/css");
    res.end(css);
    return;
  }
  if (
    ["/website/", "/studio-art/"].some(prefix =>
      url.pathname.startsWith(prefix)
    )
  ) {
    const file = path.resolve(root, "client/public", "." + url.pathname);
    if (!file.startsWith(path.resolve(root, "client/public") + path.sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    try {
      res.setHeader(
        "Content-Type",
        file.endsWith(".svg")
          ? "image/svg+xml"
          : file.endsWith(".webp")
            ? "image/webp"
            : file.endsWith(".woff2")
              ? "font/woff2"
              : "application/octet-stream"
      );
      res.end(await readFile(file));
    } catch {
      res.writeHead(404);
      res.end();
    }
    return;
  }
  res.setHeader("Content-Type", "text/html");
  res.end(
    '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>EvokeLoop UI fixture</title><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script>window.__fixtureBrowserHistory = true;</script><script src="/fixture.js"></script></body></html>'
  );
}).listen(4179, "127.0.0.1", () =>
  console.log("Synthetic UI preview: http://127.0.0.1:4179/?page=product-home")
);
