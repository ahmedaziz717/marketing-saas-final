import { createHash } from "node:crypto";
import {
  catalogMediaGroupSchema,
  type CatalogMediaGroup,
} from "../../shared/catalogMedia";
import {
  resolveCatalogImage,
  type ApiCatalogConfig,
} from "../../shared/apiCatalog";

function field(row: unknown, path: string) {
  let result = row;
  for (const key of path ? path.split(".") : []) {
    if (
      ["__proto__", "constructor", "prototype"].includes(key) ||
      !result ||
      typeof result !== "object" ||
      !Object.hasOwn(result, key)
    )
      return undefined;
    result = (result as Record<string, unknown>)[key];
  }
  return result;
}
function strings(value: unknown): string[] {
  return typeof value === "string" && value.trim()
    ? [value.trim()]
    : Array.isArray(value)
      ? value.flatMap(strings)
      : [];
}
/** Source-scoped relationships: no provider names, guessed URLs, or count expansion. */
export function mapCatalogMediaGroups(
  row: unknown,
  config: ApiCatalogConfig,
  endpoint: string
): CatalogMediaGroup[] | undefined {
  if (config.skipImages || !config.mediaGroupRules?.length) return undefined;
  const result: CatalogMediaGroup[] = [];
  for (const rule of config.mediaGroupRules) {
    const value = field(row, rule.itemsPath);
    const items = Array.isArray(value)
      ? value
      : value && typeof value === "object"
        ? [value]
        : [];
    for (const item of items) {
      const id = field(item, rule.idPath),
        name = field(item, rule.namePath);
      if (!["string", "number"].includes(typeof id) || !String(id).trim())
        throw new Error(
          `Media group ${rule.key} requires stable item identities.`
        );
      const eligible = rule.eligiblePath
        ? field(item, rule.eligiblePath) === true
        : true;
      const gallery = field(item, rule.imagesPath);
      // A gallery count or descriptor is never an image URL.
      const entries = Array.isArray(gallery)
        ? gallery
        : typeof gallery === "string"
          ? [gallery]
          : [];
      const images = eligible
        ? entries.flatMap((entry, position) => {
            const raw = [
              ...strings(field(entry, rule.imageUrlPath)),
              ...rule.resolutionPaths.flatMap(path =>
                strings(field(entry, path))
              ),
            ];
            const candidates = Array.from(
              new Set(
                raw.map(url =>
                  resolveCatalogImage(
                    url,
                    config.imageBaseUrl ?? endpoint,
                    config.imagePathMode
                  )
                )
              )
            );
            if (!candidates.length) return [];
            const explicitId = rule.imageIdPath
              ? field(entry, rule.imageIdPath)
              : undefined;
            const imageId =
              typeof explicitId === "string" || typeof explicitId === "number"
                ? String(explicitId)
                : createHash("sha256").update(candidates[0]).digest("hex");
            return [{ id: imageId, candidates }];
          })
        : [];
      if (new Set(images.map(image => image.id)).size !== images.length)
        throw new Error(
          `Media group ${rule.key} contains duplicate image identities.`
        );
      const expected = rule.expectedCountPath
        ? field(item, rule.expectedCountPath)
        : undefined;
      result.push(
        catalogMediaGroupSchema.parse({
          id: `${rule.key}:${id}`,
          name: typeof name === "string" && name.trim() ? name : String(id),
          role: rule.role,
          eligible,
          expectedCount: typeof expected === "number" ? expected : undefined,
          images,
        })
      );
    }
  }
  if (new Set(result.map(group => group.id)).size !== result.length)
    throw new Error(
      "Gallery group identities must be unique within a product."
    );
  if (result.reduce((sum, group) => sum + group.images.length, 0) > 1000)
    throw new Error(
      "Product gallery exceeds 1,000 views; split the source record."
    );
  return result;
}
