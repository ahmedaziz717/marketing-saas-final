import { readFile } from "node:fs/promises";
import path from "node:path";

// Offline fixtures must render the same bundled fonts as the production UI.
export async function inlineBuiltFonts(css) {
  for (const name of new Set(
    [...css.matchAll(/url\(["']?\/assets\/([^\s"')]+\.woff2)["']?\)/g)].map(
      match => match[1]
    )
  )) {
    const bytes = await readFile(
      path.join("dist/public/assets", path.basename(name))
    );
    css = css.replaceAll(
      `/assets/${name}`,
      `data:font/woff2;base64,${bytes.toString("base64")}`
    );
  }
  return css;
}
