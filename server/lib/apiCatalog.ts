import { createHash } from "node:crypto";
import { catalogEntrySchema } from "../../shared/catalog";
import {
  apiCatalogConfigSchema,
  type ApiCatalogConfig,
} from "../../shared/apiCatalog";
import { safeStoreRequest } from "./websiteCrawler";
import type { StoreItem } from "./storeCatalog";

export function apiCatalogAddress(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  )
    throw new Error(
      "Use a public HTTPS API endpoint without embedded credentials or custom ports."
    );
  if (
    Array.from(url.searchParams.keys()).some(key =>
      /^(?:api[-_]?key|access[-_]?token|token|password|secret|authorization)$/i.test(
        key
      )
    )
  )
    throw new Error(
      "Put credentials in the authentication fields, not in the endpoint URL."
    );
  url.hash = "";
  return url.href;
}
export function jsonField(value: unknown, path: string): unknown {
  if (!path) return value;
  let current = value;
  for (const key of path.split(".")) {
    if (
      ["__proto__", "prototype", "constructor"].includes(key) ||
      !current ||
      typeof current !== "object" ||
      !Object.hasOwn(current, key)
    )
      return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}
function first(row: unknown, paths: string[]) {
  for (const path of paths) {
    const value = jsonField(row, path);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}
const aliases = {
  id: ["id", "product_id", "productId", "ID", "sku", "SKU"],
  name: ["name", "title", "product_name", "Name", "Title"],
  description: ["description", "body_html", "summary", "Description"],
  sku: ["sku", "SKU", "item_number", "model"],
  productUrl: ["productUrl", "product_url", "url", "link", "permalink", "URL"],
  imageUrl: [
    "imageUrl",
    "image_url",
    "image.src",
    "image.url",
    "image",
    "images.0.src",
    "images.0.url",
    "images.0",
    "thumbnail",
    "image_link",
  ],
  price: ["price.amount", "price", "sale_price", "Price"],
  currency: ["currency", "price.currency", "currency_code"],
  category: ["category.name", "category", "product_type"],
  specifications: ["specifications", "specs", "attributes"],
  features: ["features", "highlights", "bullet_points", "benefits"],
  availability: [
    "availability",
    "stock_status",
    "stockStatus",
    "in_stock",
    "inStock",
    "available",
  ],
};
const text = (v: unknown, limit: number) =>
  (typeof v === "string" || typeof v === "number" ? String(v) : "")
    .replace(/<\/(?:li|p|div)>|<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .trim()
    .slice(0, limit);
function link(value: unknown, base: string) {
  if (typeof value !== "string" || !value.trim()) return "";
  const url = new URL(value, base);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password)
    throw new Error("Catalog links must be HTTP(S) URLs without credentials.");
  return url.href;
}
function catalogAttributes(
  value: unknown,
  prefix: string
): Array<[string, string]> {
  const primitive = (v: unknown): string =>
    ["string", "number", "boolean"].includes(typeof v)
      ? text(String(v), 1000)
      : "";
  const entries = Array.isArray(value)
    ? value.map((item, index): [string, unknown] => {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          const name =
            item.name ?? item.label ?? item.key ?? item.Name ?? item.Label;
          return [
            text(name, 120) || `${prefix} ${index + 1}`,
            item.value ??
              item.values ??
              item.options ??
              item.Value ??
              item.description,
          ];
        }
        return [`${prefix} ${index + 1}`, item];
      })
    : value && typeof value === "object"
      ? Object.entries(value)
      : value
        ? [[prefix, value] as [string, unknown]]
        : [];
  return entries.slice(0, 100).flatMap(([key, raw]) => {
    if (["__proto__", "constructor", "prototype"].includes(key)) return [];
    const name = text(key, 120),
      content = Array.isArray(raw)
        ? raw
            .slice(0, 100)
            .map(primitive)
            .filter(Boolean)
            .join(", ")
            .slice(0, 1000)
        : primitive(raw);
    return name && content ? [[name, content] as [string, string]] : [];
  });
}
export function parseApiCatalog(
  data: unknown,
  endpoint: string,
  config: ApiCatalogConfig
) {
  const raw = config.itemsPath
    ? jsonField(data, config.itemsPath)
    : Array.isArray(data)
      ? data
      : first(data, [
          "products",
          "items",
          "data.products",
          "data.items",
          "data",
          "results",
          "catalog.products",
        ]);
  if (!Array.isArray(raw))
    throw new Error(
      "No product array found. Set the items path, for example data.products, or add API instructions."
    );
  if (raw.length > 2000)
    throw new Error(
      "This API page contains over 2,000 products. Use a paginated endpoint."
    );
  const items: StoreItem[] = raw.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row))
      throw new Error(`Product ${index + 1} is not a JSON object.`);
    const read = (field: keyof typeof aliases) =>
      config.fields[field]
        ? jsonField(row, config.fields[field]!)
        : first(row, aliases[field]);
    const name = text(read("name"), 300);
    if (!name)
      throw new Error(
        `Product ${index + 1} has no name. Set its name field in the mapping.`
      );
    const sku = text(read("sku"), 180),
      productUrl = link(read("productUrl"), endpoint);
    if (!productUrl)
      throw new Error(
        `Product ${index + 1} has no product URL. Set the productUrl field; API URLs are not used as product landing pages.`
      );
    const specs = catalogAttributes(read("specifications"), "Specification");
    const features = catalogAttributes(read("features"), "Feature")
      .flatMap(([key, value]) =>
        /^Feature(?: \d+)?$/.test(key)
          ? value
              .split(/\n/)
              .map(v => v.replace(/^\s*[-•]\s*/, "").trim())
              .filter(Boolean)
          : [`${key}: ${value}`]
      )
      .map(feature => feature.slice(0, 1000))
      .slice(0, 100);
    const specifications = Object.fromEntries(specs);
    const stock = read("availability");
    const availability =
      typeof stock === "boolean"
        ? stock
          ? "In stock"
          : "Out of stock"
        : text(stock, 120);
    const externalId =
      text(read("id"), 180) ||
      sku ||
      createHash("sha256").update(productUrl).digest("hex");
    return {
      ...catalogEntrySchema.parse({
        name,
        description: text(read("description"), 10000),
        sku,
        productUrl,
        imageUrl: link(read("imageUrl"), endpoint),
        price: text(read("price"), 80),
        currency: text(read("currency"), 16),
        category: text(read("category"), 240),
        specifications,
        features,
        availability,
      }),
      externalId,
      variants: [],
    };
  });
  if (new Set(items.map(item => item.externalId)).size !== items.length)
    throw new Error(
      "Product IDs repeat within this page. Map a unique ID or SKU before importing."
    );
  const nextValue = config.nextPath
    ? jsonField(data, config.nextPath)
    : first(data, [
        "next",
        "next_url",
        "links.next",
        "pagination.next",
        "meta.next",
      ]);
  if (
    nextValue != null &&
    nextValue !== "" &&
    nextValue !== false &&
    (typeof nextValue !== "string" || !/^(?:https:\/\/|\/|\?)/.test(nextValue))
  )
    throw new Error(
      "Pagination must provide a next-page URL. Map its URL field; page numbers and cursor tokens need a dedicated connector."
    );
  const next =
    typeof nextValue === "string" && nextValue
      ? apiCatalogAddress(new URL(nextValue, endpoint).href)
      : null;
  if (next && new URL(next).origin !== new URL(endpoint).origin)
    throw new Error(
      "Pagination must stay on the configured API origin. Credentials are never sent to another host."
    );
  const total = Number(
    first(data, ["total", "meta.total", "pagination.total"])
  );
  return {
    items,
    next,
    total: Number.isSafeInteger(total) && total >= 0 ? total : null,
  };
}
export async function fetchApiCatalog(
  endpoint: string,
  rawConfig: ApiCatalogConfig
) {
  const config = apiCatalogConfigSchema.parse(rawConfig);
  const headers: Record<string, string> = {};
  if (config.auth.type === "basic")
    headers.Authorization = `Basic ${Buffer.from(`${config.auth.username}:${config.auth.password}`).toString("base64")}`;
  if (config.auth.type === "bearer")
    headers.Authorization = `Bearer ${config.auth.token}`;
  if (config.auth.type === "header")
    headers[config.auth.name] = config.auth.value;
  try {
    return (await safeStoreRequest(apiCatalogAddress(endpoint), headers))
      .data as unknown;
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new Error("The API response is not valid JSON.");
    throw error;
  }
}
export async function readApiCatalogPage(
  endpoint: string,
  config: ApiCatalogConfig,
  cursor: string | null
) {
  const base = apiCatalogAddress(endpoint);
  let state: { url: string; visited: string[] } = { url: base, visited: [] };
  if (cursor) {
    const parsed = JSON.parse(cursor);
    if (
      typeof parsed.url !== "string" ||
      !Array.isArray(parsed.visited) ||
      parsed.visited.some((x: unknown) => typeof x !== "string")
    )
      throw new Error("Invalid saved API pagination.");
    state = parsed;
  }
  const target = apiCatalogAddress(state.url);
  if (new URL(target).origin !== new URL(base).origin)
    throw new Error("Pagination left the configured API origin.");
  if (state.visited.includes(target) || state.visited.length >= 200)
    throw new Error(
      "API pagination repeated a page or exceeded the 200-page limit."
    );
  const page = parseApiCatalog(
    await fetchApiCatalog(target, config),
    target,
    config
  );
  const visited = [...state.visited, target];
  if (page.next && visited.includes(page.next))
    throw new Error(
      "API pagination repeats a page. Check the next-page mapping."
    );
  return {
    ...page,
    next: page.next ? JSON.stringify({ url: page.next, visited }) : null,
  };
}
