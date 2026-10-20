import type { CheerioAPI } from "cheerio";

const clean = (v: unknown) =>
  typeof v === "string" || typeof v === "number" || typeof v === "boolean"
    ? String(v).replace(/\s+/g, " ").trim()
    : "";
const knownLabel =
  /^(?:processor|cpu|graphics(?: card)?|video card|gpu|memory|ram|motherboard|mainboard|(?:primary |secondary )?(?:storage|hard drive|solid state drive|ssd)|operating system|os|power supply|psu|cooling|processor cooling|chassis|case|warranty|dimensions?|weight|width|height|depth|length|material|fabric|color|colour|size|capacity|voltage|wattage|power|battery|display|screen|resolution|refresh rate|connectivity|network(?:ing)?|wireless|ports?|interface|finish|ingredients|allergens|nutrition|serving size|compatibility|model|brand|manufacturer|socket|cores|threads)$/i;
const excludedSection =
  /(?:^|[\s_-])(?:related|recommended|recommendations|crosssell|upsell|comparison|compare|benchmark|fps)(?:$|[\s_-])/i;
const sectionLabel =
  /specification|technical details|product details|product information|configuration|hardware/i;

export function selectStructuredProducts(
  products: Array<Record<string, unknown>>,
  pageUrl: string,
  sku?: string | null
) {
  const identity = (v: unknown) => {
    try {
      const u = new URL(String(v), pageUrl);
      u.hash = "";
      return u.href.replace(/\/$/, "");
    } catch {
      return "";
    }
  };
  const exact = products.filter(
    p =>
      (p.url && identity(p.url) === identity(pageUrl)) ||
      (sku && String(p.sku).toLowerCase() === sku.toLowerCase())
  );
  if (exact.length) return exact;
  const variants = products
    .flatMap(p => (Array.isArray(p.hasVariant) ? p.hasVariant : []))
    .filter(p => p && typeof p === "object");
  const matchingVariants = variants.filter(
    p =>
      (p.url && identity(p.url) === identity(pageUrl)) ||
      (sku && String(p.sku).toLowerCase() === sku.toLowerCase())
  );
  if (matchingVariants.length) return matchingVariants;
  // Do not borrow attributes from another explicitly identified product.
  return products.filter(p => !p.url).slice(0, 1);
}

export function extractProductSpecifications(
  $: CheerioAPI,
  products: Array<Record<string, unknown>>
) {
  const pairs = new Map<
    string,
    { name: string; value: string; source: string; confidence: number }
  >();
  const add = (
    name: unknown,
    value: unknown,
    source: string,
    confidence: number
  ) => {
    const key = clean(name).replace(/[:：]\s*$/, ""),
      content = clean(value);
    if (
      !key ||
      !content ||
      key.length > 120 ||
      content.length > 1000 ||
      key === content ||
      /^(?:__proto__|constructor|prototype)$/i.test(key)
    )
      return;
    if (
      /\b(?:FPS|frames per second)\b/i.test(content) ||
      /^(?:Call of Duty|CS|Fortnite|Warzone|More info)$/i.test(key)
    )
      return;
    if (/^(?:none\b|no .*(?:selected|included)|not selected)/i.test(content))
      return;
    const old = pairs.get(key.toLowerCase());
    if (!old || old.confidence < confidence)
      pairs.set(key.toLowerCase(), {
        name: key,
        value: content,
        source,
        confidence,
      });
  };
  for (const product of products) {
    const properties = Array.isArray(product.additionalProperty)
      ? product.additionalProperty
      : product.additionalProperty
        ? [product.additionalProperty]
        : [];
    for (const property of properties)
      if (property && typeof property === "object") {
        const p = property as Record<string, unknown>;
        const value = Array.isArray(p.value)
          ? p.value.map(clean).filter(Boolean).join(", ")
          : clean(p.value);
        add(
          p.name ?? p.propertyID,
          `${value}${value && p.unitText ? ` ${clean(p.unitText)}` : ""}`,
          "schema:additionalProperty",
          1
        );
      }
    for (const name of [
      "color",
      "material",
      "size",
      "weight",
      "width",
      "height",
      "depth",
    ]) {
      const v = product[name];
      add(
        name,
        v && typeof v === "object"
          ? `${clean((v as any).value)} ${clean((v as any).unitText ?? (v as any).unitCode)}`
          : v,
        `schema:${name}`,
        1
      );
    }
  }
  const allowed = (node: any) =>
    !$(node)
      .parents()
      .addBack()
      .toArray()
      .some(n =>
        excludedSection.test(
          `${$(n).attr("id") ?? ""} ${$(n).attr("class") ?? ""} ${$(n).attr("aria-label") ?? ""}`
        )
      );
  const inSpecs = (node: any) =>
    $(node)
      .parents()
      .slice(0, 5)
      .toArray()
      .some(n => {
        const el = $(n);
        return sectionLabel.test(
          `${el.attr("id") ?? ""} ${el.attr("class") ?? ""} ${el.children("h2,h3,h4,summary").first().text()}`
        );
      });
  const visibleText = (node: any) => {
    const clone = $(node).clone();
    clone
      .find('script,style,svg,button,[role="tooltip"],[aria-hidden="true"]')
      .remove();
    return clean(clone.text());
  };
  $("table tr").each((_, row) => {
    if (!allowed(row)) return;
    const cells = $(row)
      .children("th,td")
      .toArray()
      .map(visibleText)
      .filter(Boolean);
    if (cells.length === 2) add(cells[0], cells[1], "table", 0.95);
  });
  $("dt").each((_, node) => {
    if (allowed(node))
      add(
        visibleText(node),
        visibleText($(node).next("dd")[0]),
        "definition-list",
        0.95
      );
  });
  $("li").each((_, node) => {
    if (!allowed(node)) return;
    const value = visibleText(node),
      match = value.match(/^([^:]{2,100}):\s*(.{2,1000})$/);
    if (match && (knownLabel.test(match[1]) || inSpecs(node)))
      add(match[1], match[2], "labelled-list", 0.9);
  });
  // Label/value siblings cover cards, accordions and responsive definition rows.
  $("p,span,strong,b,label,div").each((_, node) => {
    if (!allowed(node)) return;
    const el = $(node),
      label = visibleText(node).replace(/[:：]$/, "");
    if (!label || label.length > 80 || el.children("p,div,li,table,dl").length)
      return;
    if (
      !knownLabel.test(label) &&
      !(inSpecs(node) && /label|term|key|name/i.test(el.attr("class") ?? ""))
    )
      return;
    const sibling = el.next();
    if (sibling.length)
      add(label, visibleText(sibling[0]), "semantic-label", 0.9);
  });
  const values = Array.from(pairs.values()).slice(0, 100);
  return {
    specifications: Object.fromEntries(values.map(v => [v.name, v.value])),
    evidence: Object.fromEntries(
      values.map(v => [v.name, { source: v.source, confidence: v.confidence }])
    ),
  };
}

export function missingProductFacts(
  name: string,
  specs: Record<string, string>
) {
  const keys = Object.keys(specs).join(" ");
  const pc =
    /gaming (?:pc|computer|desktop|laptop)|\bworkstation\b|\bCLX (?:SET|HORUS|RA|SCARAB)\b/i.test(
      name
    );
  if (pc)
    return [
      ["processor", /processor|\bcpu\b/i],
      ["graphics", /graphics|video card|\bgpu\b/i],
      ["memory", /memory|\bram\b/i],
      ["storage", /storage|hard drive|solid state|\bssd\b|m\.2|nvme/i],
    ]
      .filter(([, pattern]) => !(pattern as RegExp).test(keys))
      .map(([label]) => String(label));
  return Object.keys(specs).length ? [] : ["specifications"];
}
