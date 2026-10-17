import * as cheerio from "cheerio";
import { safeFetchDriveFile, safeFetchText } from "./websiteCrawler";
import { detectAssetMime } from "./assetLibrary";

export function driveReference(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "drive.google.com" ||
    url.username ||
    url.password ||
    url.port
  )
    throw new Error("Use a shared drive.google.com file or folder link.");
  const folder = url.pathname.match(
    /^\/drive\/(?:u\/\d+\/)?folders\/([\w-]+)(?:\/|$)/
  );
  const file = url.pathname.match(/^\/file\/d\/([\w-]+)(?:\/|$)/);
  const id =
    folder?.[1] ||
    file?.[1] ||
    (["/open", "/uc"].includes(url.pathname)
      ? url.searchParams.get("id")
      : null);
  if (!id || !/^[\w-]{10,150}$/.test(id))
    throw new Error(
      "This Drive link does not contain a valid file or folder ID."
    );
  const resourceKey = url.searchParams.get("resourcekey") || "";
  if (resourceKey && !/^[\w-]{1,150}$/.test(resourceKey))
    throw new Error("Invalid Drive resource key.");
  const query = resourceKey
    ? `&resourcekey=${encodeURIComponent(resourceKey)}`
    : "";
  return {
    id,
    kind: folder ? ("folder" as const) : ("file" as const),
    resourceKey,
    downloadUrl: `https://drive.google.com/uc?export=download&id=${id}${query}`,
    viewUrl: `https://drive.google.com/file/d/${id}/view${resourceKey ? `?resourcekey=${resourceKey}` : ""}`,
  };
}
export function driveLogoCandidates(html: string) {
  const $ = cheerio.load(html);
  const found = new Map<
    string,
    { name: string; url: string; viewUrl: string }
  >();
  $("a[href]").each((_, element) => {
    try {
      const a = $(element);
      const reference = driveReference(
        new URL(a.attr("href")!, "https://drive.google.com").href
      );
      const name = (
        a.find(".flip-entry-title").text() ||
        a.attr("aria-label") ||
        a.attr("title") ||
        a.text()
      )
        .trim()
        .slice(0, 180);
      if (
        reference.kind === "file" &&
        /\.(?:png|jpe?g|webp|gif|svg)(?:\s|$)/i.test(name)
      )
        found.set(reference.id, {
          name,
          url: reference.downloadUrl,
          viewUrl: reference.viewUrl,
        });
    } catch {
      /* A folder can link to unrelated Google UI; never follow those links. */
    }
  });
  return Array.from(found.values()).slice(0, 50);
}
export async function discoverDriveLogos(value: string) {
  const reference = driveReference(value);
  if (reference.kind === "file")
    return [
      {
        name: "Shared Drive logo",
        url: reference.downloadUrl,
        viewUrl: reference.viewUrl,
      },
    ];
  const query = `id=${reference.id}${reference.resourceKey ? `&resourcekey=${reference.resourceKey}` : ""}`;
  const page = await safeFetchText(
    `https://drive.google.com/embeddedfolderview?${query}`
  );
  if (page.status >= 400)
    throw new Error(
      "This Drive folder could not be read. Use an Anyone with the link folder or upload the logos directly."
    );
  const candidates = driveLogoCandidates(page.text);
  if (!candidates.length)
    throw new Error(
      "No shared image files were found. Use an Anyone with the link folder containing PNG, JPG, WebP, GIF or SVG files, or upload directly. Nested folders are not scanned."
    );
  return candidates;
}
export async function fetchDriveLogo(value: string) {
  const reference = driveReference(value);
  if (reference.kind !== "file")
    throw new Error("Choose an individual image file.");
  const result = await safeFetchDriveFile(reference.downloadUrl);
  const mime = detectAssetMime(result.data);
  const svg = /<svg\b/i.test(result.data.subarray(0, 8192).toString("utf8"));
  if ((!mime || !mime.startsWith("image/")) && !svg)
    throw new Error(
      "The Drive link is not an accessible image file. Upload it directly or check sharing."
    );
  return { data: result.data, contentType: svg ? "image/svg+xml" : mime! };
}
