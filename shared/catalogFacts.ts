/** Compatibility for older imports that stored stock and feature bullets as specs. */
export function structuredCatalogFacts(product: {
  specifications?: Record<string, string> | null;
  features?: string[] | null;
  availability?: string | null;
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
    specifications,
    features: Array.from(new Set(features.filter(v => v.trim()))),
    availability,
  };
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
