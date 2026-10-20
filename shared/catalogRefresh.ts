export const catalogFactFields = [
  "name",
  "sku",
  "category",
  "description",
  "productUrl",
  "price",
  "currency",
  "specifications",
  "features",
  "availability",
  "recordType",
  "serviceDetails",
] as const;
export function reconcileCatalogRefresh<T extends Record<string, unknown>>(
  previous: Record<string, unknown> & { provenance: Record<string, string> },
  incoming: T,
  evidence: Record<string, string>,
  source: string
) {
  const values = { ...incoming };
  const provenance = { ...previous.provenance, ...evidence };
  const before: Record<string, unknown> = {},
    after: Record<string, unknown> = {};
  const preserved: string[] = [];
  for (const key of catalogFactFields) {
    if (!(key in values)) continue;
    const old = previous[key];
    const emptyIncoming =
      values[key] == null ||
      values[key] === "" ||
      (typeof values[key] === "object" &&
        Object.keys(values[key] as object).length === 0);
    const missingSourceValue = emptyIncoming && old != null && old !== "";
    const manual = previous.provenance[key]?.startsWith("user:");
    const preferExisting =
      source === "website" &&
      previous.provenance.source === "api" &&
      old != null &&
      old !== "";
    if (manual || preferExisting || missingSourceValue) {
      (values as Record<string, unknown>)[key] =
        !manual && key === "specifications"
          ? { ...((values[key] as object) ?? {}), ...((old as object) ?? {}) }
          : old;
      provenance[key] = previous.provenance[key] ?? previous.provenance.source;
      preserved.push(key);
    }
    if (JSON.stringify(old ?? "") !== JSON.stringify(values[key] ?? "")) {
      before[key] = old;
      after[key] = values[key];
    }
  }
  const changed = Object.keys(after).length > 0;
  if (changed) {
    provenance["refresh.changes"] = JSON.stringify({
      before,
      after,
      preserved,
      observedAt: new Date().toISOString(),
      source,
    });
    provenance["refresh.status"] = "review_required";
  }
  return { values, provenance, changed };
}
export function catalogRefreshChanges(provenance: Record<string, string>) {
  try {
    const result = JSON.parse(provenance["refresh.changes"] ?? "null");
    return result &&
      typeof result.before === "object" &&
      typeof result.after === "object"
      ? (result as {
          before: Record<string, unknown>;
          after: Record<string, unknown>;
          preserved: string[];
          observedAt: string;
          source: string;
        })
      : null;
  } catch {
    return null;
  }
}
