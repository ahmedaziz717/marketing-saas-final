import type { ApiCatalogConfig } from "../../shared/apiCatalog";
import {
  apiCatalogAddress,
  catalogUrlFromTemplate,
  fetchApiCatalog,
  jsonField,
} from "./apiCatalog";
const text = (v: unknown, max = 500) =>
  ["string", "number", "boolean"].includes(typeof v)
    ? String(v).trim().slice(0, max)
    : "";
export function normalizeApiProductDetails(
  data: unknown,
  config: ApiCatalogConfig
) {
  const record = (
    config.detailRootPath ? jsonField(data, config.detailRootPath) : data
  ) as Record<string, any> | null;
  if (!record || typeof record !== "object" || Array.isArray(record))
    throw new Error(
      "The product detail response did not contain an object. Update the source instructions."
    );
  const raw = jsonField(record, config.componentsPath ?? "components");
  const entries = Array.isArray(raw)
    ? raw.map((v, i) => [String(i), v] as const)
    : raw && typeof raw === "object"
      ? Object.entries(raw)
      : [];
  let remaining = 500;
  const part = (v: Record<string, any>) => {
    const quantity = Number(v.quantity ?? v.qty ?? 1);
    const rawImage = v.imageUrl ?? v.image_url ?? v.metadata?.images?.main;
    const image =
      rawImage ||
      (config.componentImageUrlTemplate
        ? catalogUrlFromTemplate(config.componentImageUrlTemplate, v)
        : "");
    let imageUrl = "";
    try {
      const u = new URL(image, config.imageBaseUrl);
      if (image && /^https?:$/.test(u.protocol) && !u.username && !u.password)
        imageUrl = u.href;
    } catch {
      /* An absent image is not a different part's image. */
    }
    return {
      code: text(v.code ?? v.id, 180),
      name: text(v.name ?? v.title),
      description: text(v.description, 1000),
      quantity: Number.isFinite(quantity) && quantity >= 0 ? quantity : 1,
      apiPrice: text(v.price, 80),
      brand: text(v.brand, 180),
      imageUrl,
      gallerySize: Number(v.metadata?.gallery?.size) || null,
      specifications: Object.fromEntries(
        Object.entries(v.specs ?? v.specifications ?? {})
          .filter(([, value]) =>
            ["string", "number", "boolean"].includes(typeof value)
          )
          .slice(0, 30)
          .map(([key, value]) => [key, text(value, 300)])
      ),
    };
  };
  const components = entries.slice(0, 50).flatMap(([group, raw]) => {
    if (!group || !raw || typeof raw !== "object" || Array.isArray(raw))
      return [];
    const v = raw as Record<string, any>;
    const rawOptions = Array.isArray(v.upgrades)
      ? v.upgrades
      : Array.isArray(v.options)
        ? v.options
        : [];
    const available = rawOptions.filter(
      (o: any) => o && typeof o === "object" && o.enabledInKit !== false
    );
    const selected =
      v.selected !== false &&
      Number(v.quantity ?? v.qty ?? 1) > 0 &&
      !/^(?:none\b|no\s|not selected|not applicable)|[-:]\s*none$/i.test(
        text(v.name)
      )
        ? part(v)
        : null;
    const options = available.slice(0, Math.min(40, remaining)).map(part);
    remaining -= options.length;
    return [
      {
        group: text(v.type ?? group, 120),
        selected: selected?.name ? selected : null,
        options,
        optionCount: available.length,
        truncated: options.length < available.length,
      },
    ];
  });
  return {
    code: text(record.code ?? record.id, 180),
    name: text(record.name ?? record.title),
    components,
    fetchedAtMs: Date.now(),
    truncated: entries.length > 50 || components.some(c => c.truncated),
    priceNote:
      "Option prices are API values. Their meaning (upgrade difference or full component price) has not been established; they are not product prices.",
  };
}
type DetailResult = ReturnType<typeof normalizeApiProductDetails>;
const cache = new Map<string, { until: number; result: DetailResult }>();
export async function readApiProductDetails(
  endpoint: string,
  detailUrl: string,
  config: ApiCatalogConfig,
  scope: string
) {
  const target = apiCatalogAddress(detailUrl);
  if (new URL(target).origin !== new URL(apiCatalogAddress(endpoint)).origin)
    throw new Error(
      "Product detail requests must stay on the configured API origin."
    );
  const key = `${scope}:${target}`;
  const cached = cache.get(key);
  if (cached && cached.until > Date.now()) return cached.result;
  try {
    const result = normalizeApiProductDetails(
      await fetchApiCatalog(target, config),
      config
    );
    if (cache.size >= 200) cache.delete(cache.keys().next().value!);
    cache.set(key, { until: Date.now() + 300000, result });
    return result;
  } catch (e) {
    const error = e as any;
    if (error.response?.status === 429 || error.status === 429)
      throw new Error(
        "The product API is rate limiting requests. Wait before trying again."
      );
    throw e;
  }
}
