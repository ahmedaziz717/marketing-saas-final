import { catalogEntrySchema, type CatalogEntry } from "./catalog";
/** RFC4180 quotes, embedded newlines, escaped quotes, BOM, and CRLF. */
export function parseCatalogCsv(text: string): CatalogEntry[] {
  if (text.length > 5_000_000)
    throw new Error("CSV must be smaller than 5 MB.");
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (c === "," || c === "\n")) {
      row.push(value);
      value = "";
      if (c === "\n") {
        rows.push(row);
        row = [];
      }
    } else if (c !== "\r" || quoted) value += c;
  }
  if (quoted) throw new Error("CSV contains an unclosed quote.");
  row.push(value);
  if (row.some(Boolean)) rows.push(row);
  const headers = rows.shift()?.map(h => h.trim()) ?? [];
  if (!headers.includes("name") || !headers.includes("productUrl"))
    throw new Error("CSV requires name and productUrl columns.");
  if (rows.length > 5000)
    throw new Error("Upload at most 5,000 entries in one CSV.");
  return rows
    .filter(r => r.some(v => v.trim()))
    .map((r, index) => {
      const item = Object.fromEntries(
        headers.map((h, i) => [h, r[i]?.trim() ?? ""])
      );
      try {
        return catalogEntrySchema.parse({
          ...item,
          recordType: item.recordType || "standalone",
          specifications: {},
          serviceDetails:
            item.recordType === "service"
              ? {
                  pricing: item.pricing || "quote",
                  duration: item.duration || "",
                  area: item.area || "",
                  delivery: item.delivery || "both",
                  packages: item.packages || "",
                  cta: item.cta || "Get a quote",
                }
              : null,
        });
      } catch {
        throw new Error(
          `Check CSV row ${index + 2}: name, URL, type, or service details are invalid.`
        );
      }
    });
}
