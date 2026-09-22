import { readFile } from "node:fs/promises";
// Only offline browser fixtures use data URLs. Deployed pages retain cacheable SVG files.
export const brandAssets = Object.fromEntries(
  await Promise.all(
    [
      "evokeloop-wordmark.svg",
      "evokeloop-wordmark-reversed.svg",
      "evokeloop-symbol.svg",
      "favicon.svg",
    ].map(async name => [
      "/website/" + name,
      "data:image/svg+xml;base64," +
        (await readFile("client/public/website/" + name)).toString("base64"),
    ])
  )
);
export function inlineBrandAssets(html) {
  for (const [url, data] of Object.entries(brandAssets))
    html = html.replaceAll('src="' + url + '"', 'src="' + data + '"');
  return html;
}
export const inlineLiveBrandImages = `(()=>{const assets=${JSON.stringify(brandAssets)};for(const img of document.querySelectorAll('img')){const source=img.getAttribute('src');if(assets[source])img.src=assets[source];}})()`;
