/** Compatibility for older imports that stored stock and feature bullets as specs. */
export function structuredCatalogFacts(product: {
  specifications?: Record<string, string> | null;
  features?: string[] | null;
  availability?: string | null;
  category?: string | null;
  name?: string | null;
  specificationOrder?: string[];
  provenance?: Record<string, string> | null;
}) {
  const specifications: Record<string, string> = {};
  const features = [...(product.features ?? [])];
  let availability = product.availability?.trim() || "";
  for (const [key, value] of Object.entries(product.specifications ?? {})) {
    if (/^(availability|stock status|stock_status)$/i.test(key.trim())) {
      if (!availability) availability = value;
    } else if (/^feature(?:\s+\d+|\s*·.*)?$/i.test(key.trim())) {
      features.push(value);
    } else if (!/^variant (prices|skus)$/i.test(key.trim())) {
      specifications[key] = value;
    }
  }
  return {
    specifications: orderedSpecifications({ ...product, specifications }),
    features: Array.from(new Set(features.filter(v => v.trim()))),
    availability,
  };
}

const attributeName = (value: string) =>
  value.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
/** Explicit order survives JSONB key reordering; category profiles never alter labels or values. */
export function orderedSpecifications(product: {
  specifications?: Record<string, string> | null;
  category?: string | null;
  name?: string | null;
  specificationOrder?: string[];
  provenance?: Record<string, string> | null;
}) {
  const entries = Object.entries(product.specifications ?? {});
  let explicit = product.specificationOrder ?? [];
  for (const key of [
    "specifications.order.user",
    "specifications.order.source",
  ]) {
    try {
      const value = JSON.parse(product.provenance?.[key] ?? "null");
      if (Array.isArray(value) && value.every(v => typeof v === "string")) {
        explicit = value;
        break;
      }
    } catch {
      /* Legacy records may have no order metadata. */
    }
  }
  const category = attributeName(product.category ?? "");
  const pc =
    /\b(pc|desktop|workstation|laptop|notebook|gaming computer)\b/.test(
      category
    );
  const profile = pc
    ? [
        /^(cpu|processor)\b/,
        /^(gpu|graphics|video card)\b/,
        /^(memory|ram)\b/,
        /^(storage|ssd|hard drive|drive)\b/,
        /^(motherboard|mainboard)\b/,
        /^(cooling|cpu cooler)\b/,
        /^(power|psu)\b/,
        /^(chassis|case)\b/,
        /^(display|screen)\b/,
        /^(operating system|os)\b/,
        /^(network|wireless)\b/,
        /^warranty\b/,
      ]
    : /\b(apparel|clothing|shirt|dress|jacket|shoes)\b/.test(category)
      ? [
          /^(size|fit)\b/,
          /^(material|fabric)\b/,
          /^(color|colour)\b/,
          /^care\b/,
        ]
      : /\b(furniture|chair|table|sofa|desk)\b/.test(category)
        ? [
            /^dimensions\b/,
            /^(material|construction)\b/,
            /^(color|colour|finish)\b/,
            /^(weight|capacity)\b/,
            /^assembly\b/,
          ]
        : /\b(food|beverage|grocery)\b/.test(category)
          ? [
              /^ingredients\b/,
              /^allergens\b/,
              /^(nutrition|nutritional)\b/,
              /^(weight|volume|size)\b/,
              /^storage\b/,
            ]
          : [];
  const rank = (key: string) => {
    const saved = explicit.indexOf(key);
    if (saved >= 0) return saved;
    const position = profile.findIndex(rule => rule.test(attributeName(key)));
    return explicit.length + (position < 0 ? profile.length : position);
  };
  return Object.fromEntries(
    entries.sort(
      ([a], [b]) =>
        rank(a) - rank(b) || a.localeCompare(b, "en", { numeric: true })
    )
  );
}
export function availabilityLabel(value?: string | null) {
  if (!value?.trim()) return "Not supplied";
  const key = value.split("/").pop()!.replace(/[ _-]/g, "").toLowerCase();
  return (
    (
      {
        instock: "In stock",
        outofstock: "Out of stock",
        preorder: "Preorder",
        backorder: "Backorder",
        discontinued: "Discontinued",
        limitedavailability: "Limited availability",
        unknown: "Not supplied",
      } as Record<string, string>
    )[key] ?? value
  );
}
export function specificationLines(value: string) {
  return value.split("\n").map(line => {
    const clean = line.replace(/^\s*[-•]\s*/, "");
    const i = clean.indexOf(":");
    return i < 0
      ? { name: clean, value: "" }
      : { name: clean.slice(0, i), value: clean.slice(i + 1).trimStart() };
  });
}
export function specificationsFromLines(value: string) {
  return Object.fromEntries(
    specificationLines(value)
      .filter(row => row.name.trim() && row.value.trim())
      .map(row => [row.name.trim(), row.value.trim()])
  );
}
