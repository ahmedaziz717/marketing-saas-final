import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  categorySettingsSchema,
  type CategorySettings,
} from "@shared/catalogCategories";

export function CatalogCategoryMapping({
  organizationId,
  canEdit,
}: {
  organizationId: number;
  canEdit: boolean;
}) {
  const query = trpc.catalogCategories.read.useQuery({ organizationId });
  const utils = trpc.useUtils();
  const [draft, setDraft] = useState<{
    revision: number;
    settings: CategorySettings;
  } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const save = trpc.catalogCategories.save.useMutation({
    onSuccess: async () => {
      setDraft(null);
      setConfirmed(false);
      setError("");
      await Promise.all([
        utils.catalogCategories.read.invalidate({ organizationId }),
        utils.catalog.overview.invalidate(),
      ]);
    },
    onError: e => setError(e.message),
  });
  const settings = draft?.settings ?? query.data?.settings;
  function edit(next: CategorySettings) {
    setDraft({
      revision: draft?.revision ?? query.data!.revision,
      settings: next,
    });
    setConfirmed(false);
  }
  if (!settings)
    return (
      <p role="status">
        {query.error
          ? "Category mappings could not be loaded."
          : "Loading category mappings…"}
      </p>
    );
  return (
    <details
      className="mb-4 rounded-xl border p-4"
      aria-label="Category mapping and category-aware copy"
    >
      <summary className="cursor-pointer font-semibold">
        Category mapping and category-aware copy
      </summary>
      <p className="my-3 text-sm text-muted-foreground">
        Translate source codes into your workspace's marketing categories.
        Confirmed category guidance informs image, copy, video and PMax.
        Hardware type, chassis and brand remain separate facts. Unmapped codes
        are never guessed.
      </p>
      <div className="space-y-3">
        {settings.categories.map((category, index) => (
          <details key={category.id} className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              {category.name || "New category"}
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {(
                [
                  "name",
                  "audience",
                  "useCases",
                  "vocabulary",
                  "cta",
                  "avoid",
                ] as const
              ).map(key => (
                <label key={key} className="text-sm">
                  {
                    {
                      name: "Category name",
                      audience: "Audience",
                      useCases: "Use cases",
                      vocabulary: "Voice and vocabulary",
                      cta: "CTA guidance",
                      avoid: "Avoid",
                    }[key]
                  }
                  <textarea
                    className="mt-1 block w-full rounded border bg-background p-2"
                    aria-label={`${category.name || "New category"} ${key}`}
                    value={category[key]}
                    maxLength={key === "name" ? 120 : 2000}
                    disabled={!canEdit || save.isPending}
                    onChange={e =>
                      edit({
                        ...settings,
                        categories: settings.categories.map((item, i) =>
                          i === index
                            ? { ...item, [key]: e.target.value }
                            : item
                        ),
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </details>
        ))}
        {canEdit && (
          <Button
            type="button"
            variant="outline"
            disabled={save.isPending || settings.categories.length >= 100}
            onClick={() =>
              edit({
                ...settings,
                categories: [
                  ...settings.categories,
                  {
                    id: crypto.randomUUID(),
                    name: "",
                    audience: "",
                    useCases: "",
                    vocabulary: "",
                    cta: "",
                    avoid: "",
                  },
                ],
              })
            }
          >
            Add marketing category
          </Button>
        )}
        <div className="max-h-80 overflow-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="p-2">Source / category code</th>
                <th>Products</th>
                <th>Marketing category</th>
              </tr>
            </thead>
            <tbody>
              {query.data?.codes.map(code => {
                const source =
                  query.data.sources.find(s => s.id === code.sourceId)?.name ??
                  "Website / manual catalog";
                const mapping = settings.mappings.find(
                  m =>
                    m.sourceId === code.sourceId &&
                    m.sourceCategory === code.category?.trim()
                );
                return (
                  <tr
                    key={JSON.stringify([code.sourceId, code.category])}
                    className="border-t"
                  >
                    <td className="p-2">
                      <span className="block">{source}</span>
                      <strong>{code.category || "No source category"}</strong>
                    </td>
                    <td>
                      {code.count}
                      <small className="block">
                        {code.overrides} overrides preserved
                      </small>
                    </td>
                    <td className="p-2">
                      <select
                        className="w-full rounded border bg-background p-2"
                        aria-label={`Map ${source} ${code.category || "uncategorized"}`}
                        value={mapping?.categoryId ?? ""}
                        disabled={
                          !canEdit || !code.category?.trim() || save.isPending
                        }
                        onChange={e =>
                          edit({
                            ...settings,
                            mappings: [
                              ...settings.mappings.filter(
                                m =>
                                  !(
                                    m.sourceId === code.sourceId &&
                                    m.sourceCategory === code.category?.trim()
                                  )
                              ),
                              ...(e.target.value
                                ? [
                                    {
                                      sourceId: code.sourceId,
                                      sourceCategory: code.category!.trim(),
                                      categoryId: e.target.value,
                                    },
                                  ]
                                : []),
                            ],
                          })
                        }
                      >
                        <option value="">Unmapped — review needed</option>
                        {settings.categories.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name || "Unnamed category"}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {draft && (
          <div className="rounded border p-3 text-sm">
            <p>
              Review the category guidance and source mappings above. Saving
              affects future resolved context for matching products; existing
              product overrides, saved copy and creatives are preserved.
            </p>
            <label className="mt-2 flex gap-2">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={e => setConfirmed(e.target.checked)}
              />
              I reviewed these category mappings and guidance.
            </label>
            <div className="mt-3 flex gap-2">
              <Button
                disabled={!confirmed || save.isPending}
                onClick={() => {
                  const parsed = categorySettingsSchema.safeParse(
                    draft.settings
                  );
                  if (!parsed.success) {
                    setError(parsed.error.issues.map(i => i.message).join(" "));
                    return;
                  }
                  save.mutate({
                    organizationId,
                    revision: draft.revision,
                    settings: parsed.data,
                    confirm: true,
                  });
                }}
              >
                Confirm and save mappings
              </Button>
              <Button
                variant="ghost"
                disabled={save.isPending}
                onClick={() => {
                  setDraft(null);
                  setConfirmed(false);
                  setError("");
                }}
              >
                Discard mapping edits
              </Button>
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error} Your edits remain here for review.
          </p>
        )}
      </div>
    </details>
  );
}

export function ProductCategoryOverride({
  organizationId,
  product,
  canEdit,
  onSaved,
}: {
  organizationId: number;
  product: {
    id: number;
    name: string;
    updatedAtMs: number;
    provenance: Record<string, string>;
    marketingCategory: import("@shared/catalogCategories").ResolvedMarketingCategory;
  };
  canEdit: boolean;
  onSaved: () => void;
}) {
  const config = trpc.catalogCategories.read.useQuery({ organizationId });
  const [value, setValue] = useState<string | null>(null);
  const save = trpc.catalogCategories.override.useMutation({
    onSuccess: () => {
      setValue(null);
      onSaved();
    },
  });
  return (
    <details className="mb-3 rounded border p-2 text-sm">
      <summary className="cursor-pointer">
        Marketing category:{" "}
        {product.marketingCategory.category?.name ?? "Unmapped — review needed"}
      </summary>
      <p className="my-2 text-xs text-muted-foreground">
        Source: {product.marketingCategory.sourceCategory || "none"}.
        Assignment: {product.marketingCategory.origin.replace(/_/g, " ")}.
        Revision {product.marketingCategory.revision}. Manual overrides survive
        catalog sync.
      </p>
      {canEdit && config.data && (
        <>
          <select
            aria-label={`Marketing category for ${product.name}`}
            className="w-full rounded border bg-background p-2"
            value={value ?? product.provenance["marketing.categoryId"] ?? ""}
            onChange={e => setValue(e.target.value)}
          >
            <option value="">Use source mapping</option>
            {config.data.settings.categories.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <Button
            className="mt-2"
            size="sm"
            disabled={value === null || save.isPending}
            onClick={() =>
              save.mutate({
                organizationId,
                productId: product.id,
                updatedAtMs: product.updatedAtMs,
                categoryRevision: config.data!.revision,
                categoryId: value || null,
              })
            }
          >
            Confirm product assignment
          </Button>
        </>
      )}
      {save.error && <p role="alert">{save.error.message}</p>}
    </details>
  );
}
