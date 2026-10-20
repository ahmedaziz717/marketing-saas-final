import { createHash } from "node:crypto";
import { catalogEntrySchema } from "../../shared/catalog";
import {
  apiCatalogConfigSchema,
  type ApiCatalogConfig,
} from "../../shared/apiCatalog";
import { safeStoreRequest } from "./websiteCrawler";
import type { StoreItem } from "./storeCatalog";

export function apiCatalogAddress(value: string) {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(
      "Enter only the API address, starting with https://. Put explanations in Instructions."
    );
  }
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
  id: ["id", "product_id", "productId", "ID", "sku", "SKU", "code"],
  name: ["name", "title", "product_name", "Name", "Title"],
  description: ["description", "body_html", "summary", "Description"],
  sku: ["sku", "SKU", "item_number", "code", "model"],
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
    "metadata.images.main",
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
export type ApiCatalogIssue = {
  index: number;
  product: string;
  field: "productUrl" | "imageUrl" | "currency" | "specifications";
  message: string;
  blocking: boolean;
};
/** Templates are substitutions only. Values cannot change the host or inject URL syntax. */
export function catalogUrlFromTemplate(template: string, row: unknown) {
  let missing = false;
  const rendered = template.replace(/\{([^{}]+)\}/g, (_, path) => {
    const value = jsonField(row, path);
    if (!["string", "number"].includes(typeof value) || value === "")
      missing = true;
    return encodeURIComponent(String(value ?? ""));
  });
  return missing ? "" : rendered;
}
export function inferProductTemplate(example: string, rows: unknown[]) {
  const url = new URL(example);
  for (const row of rows)
    for (const path of [
      "code",
      "sku",
      "SKU",
      "id",
      "productId",
      "handle",
      "slug",
    ]) {
      const value = jsonField(row, path);
      if (
        (typeof value !== "string" && typeof value !== "number") ||
        !String(value)
      )
        continue;
      const encoded = encodeURIComponent(String(value));
      const segments = url.pathname.split("/");
      const index = segments.findIndex(
        part => part.toLowerCase() === encoded.toLowerCase()
      );
      if (index < 0) continue;
      segments[index] = `{${path}}`;
      return `${url.origin}${segments.join("/")}${url.search}`;
    }
  return null;
}
/** A single example cannot establish links for a different product family. */
export function inferProductLinkRule(example: string, rows: unknown[]) {
  const template = inferProductTemplate(example, rows);
  if (!template) return null;
  const matched = rows.find(
    row =>
      catalogUrlFromTemplate(template, row).toLowerCase() ===
      new URL(example).href.toLowerCase()
  );
  for (const path of ["layout", "product_type", "type", "category"]) {
    const value = jsonField(matched, path);
    if (typeof value !== "string" && typeof value !== "number") continue;
    if (new Set(rows.map(row => String(jsonField(row, path)))).size > 1)
      return { rule: { path, equals: String(value), template } };
  }
  return { template };
}
/** Preserve installed component quantities; do not turn unselected add-ons into specifications. */
export function componentSpecifications(
  value: unknown
): Array<[string, string]> {
  const entries = Array.isArray(value)
    ? value.map((v, i) => [String(i), v] as const)
    : value && typeof value === "object"
      ? Object.entries(value)
      : [];
  return entries.slice(0, 100).flatMap(([key, raw]) => {
    if (!key || !raw || typeof raw !== "object" || Array.isArray(raw))
      return [];
    const v = raw as Record<string, unknown>;
    const name = text(v.name ?? v.title ?? v.description, 900);
    const quantity = Number(v.quantity ?? v.qty ?? 1);
    if (
      !name ||
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      /^(?:none\b|no .*(?:selected|included)|not selected|not applicable)/i.test(
        name
      )
    )
      return [];
    const label = text(v.label ?? v.type ?? v.category ?? key, 120).replace(
      /[_-]+/g,
      " "
    );
    if (!label) return [];
    const capacity = name.match(/\b(\d+(?:\.\d+)?)\s*(GB|TB)\b/i);
    const total =
      /memory|ram|storage|drive|disk/i.test(label) && capacity && quantity > 1
        ? `${Number(capacity[1]) * quantity} ${capacity[2].toUpperCase()} total · `
        : "";
    return [
      [
        label,
        `${total}${quantity > 1 ? `${quantity} × ` : ""}${name}`.slice(0, 1000),
      ] as [string, string],
    ];
  });
}
export function apiCatalogRows(data: unknown, itemsPath = ""): unknown[] {
  const raw = itemsPath
    ? jsonField(data, itemsPath)
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
      "We could not find the product list. Add the API instructions so we can locate it automatically."
    );
  return raw;
}
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
  config: ApiCatalogConfig,
  options: { preview?: boolean } = {}
) {
  const raw = apiCatalogRows(data, config.itemsPath);
  const issues: ApiCatalogIssue[] = [];
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
    const rule = config.productUrlRules?.find(
      rule => String(jsonField(row, rule.path)) === rule.equals
    );
    const template = rule?.template ?? config.productUrlTemplate;
    const sku = text(read("sku"), 180);
    let productUrl = link(
      template ? catalogUrlFromTemplate(template, row) : read("productUrl"),
      config.productBaseUrl ?? endpoint
    );
    // Relative links from an API host require the storefront base to be explicit.
    const rawProduct = template
      ? catalogUrlFromTemplate(template, row)
      : read("productUrl");
    if (
      typeof rawProduct === "string" &&
      rawProduct &&
      !/^https?:\/\//i.test(rawProduct) &&
      !config.productBaseUrl &&
      /^api\./i.test(new URL(endpoint).hostname)
    )
      productUrl = "";
    if (productUrl === endpoint) productUrl = "";
    if (!productUrl && !options.preview)
      throw new Error(
        `Product ${index + 1} has no product URL. Add an example product-page link or its link instructions, then preview again.`
      );
    if (!productUrl)
      issues.push({
        index,
        product: name,
        field: "productUrl",
        blocking: true,
        message:
          "What is this product’s page address on your website? Add an example link below or explain the link rules in Instructions.",
      });
    const specs = catalogAttributes(read("specifications"), "Specification");
    specs.push(
      ...componentSpecifications(
        config.componentsPath
          ? jsonField(row, config.componentsPath)
          : first(row, ["components", "configuration.components"])
      )
    );
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
    const stock = config.inventoryQuantityPath
      ? jsonField(row, config.inventoryQuantityPath)
      : (read("availability") ??
        first(row, [
          "stock.available",
          "inventory.quantity",
          "stock_quantity",
        ]));
    const availability =
      typeof stock === "number" && Number.isFinite(stock)
        ? stock > 0
          ? `In stock · ${stock} available`
          : "Out of stock"
        : typeof stock === "boolean"
          ? stock
            ? "In stock"
            : "Out of stock"
          : text(stock, 120);
    const externalId =
      text(read("id"), 180) ||
      sku ||
      createHash("sha256").update(productUrl).digest("hex");
    const rawImage = config.imageUrlTemplate
      ? catalogUrlFromTemplate(config.imageUrlTemplate, row)
      : read("imageUrl");
    const relativeImage =
      typeof rawImage === "string" &&
      !!rawImage &&
      !/^https?:\/\//i.test(rawImage);
    const imageUrl =
      relativeImage &&
      !config.imageBaseUrl &&
      /^api\./i.test(new URL(endpoint).hostname)
        ? ""
        : link(rawImage, config.imageBaseUrl ?? endpoint);
    const currency = text(read("currency"), 16) || config.defaultCurrency || "";
    if (!imageUrl)
      issues.push({
        index,
        product: name,
        field: "imageUrl",
        blocking: false,
        message: relativeImage
          ? "Where are your product images hosted? Add the image website address below."
          : "No product image was provided. Add image instructions or continue without an image.",
      });
    if (!currency && text(read("price"), 80))
      issues.push({
        index,
        product: name,
        field: "currency",
        blocking: true,
        message: "Which currency are these prices in?",
      });
    const candidate = {
      name,
      description: text(read("description"), 10000),
      sku,
      productUrl,
      imageUrl,
      price: text(read("price"), 80),
      currency,
      category: text(read("category"), 240),
      specifications,
      features,
      availability,
      recordType: "standalone" as const,
      serviceDetails: null,
    };
    return {
      ...(options.preview && !productUrl
        ? candidate
        : catalogEntrySchema.parse(candidate)),
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
    issues,
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
