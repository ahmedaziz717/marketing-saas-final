import {
  categorySelectionState,
  type ResolvedMarketingCategory,
} from "@shared/catalogCategories";
export function ProductCategoryContext({
  products,
  handling,
  onChange,
}: {
  products: Array<{
    id: number;
    name: string;
    marketingCategory?: ResolvedMarketingCategory;
  }>;
  handling?: "require_mapping" | "neutral";
  onChange: (value: "require_mapping" | "neutral") => void;
}) {
  if (!products.length) return null;
  const state = categorySelectionState(products);
  return (
    <aside
      className="mb-4 rounded-lg border p-3 text-sm"
      aria-label="Selected product categories"
    >
      <p className="font-medium">Category context for AI</p>
      <ul className="my-2 space-y-1">
        {products.map(product => (
          <li key={product.id}>
            {product.name}:{" "}
            <strong>
              {product.marketingCategory?.category?.name ??
                "Unmapped — review needed"}
            </strong>
          </li>
        ))}
      </ul>
      {state.requiresChoice ? (
        <>
          <p>
            {state.unmapped
              ? "Some products have no confirmed category."
              : "These products use different marketing categories."}{" "}
            Assign categories in Catalog, split your selection, or explicitly
            choose neutral wording. Existing copy is preserved; regenerate and
            review it after changing categories.
          </p>
        </>
      ) : handling === "neutral" ? (
        <p className="text-xs text-muted-foreground">
          Neutral wording is active: AI uses supplied facts without
          category-specific audience or use-case guidance. Turn it off below to
          use the confirmed category. Existing copy is preserved; regenerate and
          review it after changing this choice.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Confirmed category guidance controls audience and use cases. Brand
          voice supplies style; it cannot change product identity. Review
          existing copy after category changes.
        </p>
      )}
      {(state.requiresChoice || handling === "neutral") && (
        <label className="mt-2 flex gap-2">
          <input
            type="checkbox"
            checked={handling === "neutral"}
            onChange={e =>
              onChange(e.target.checked ? "neutral" : "require_mapping")
            }
          />
          Use neutral wording based only on supplied facts for this selection.
        </label>
      )}
      <a
        className="mt-2 inline-block underline"
        href="/app/catalog"
        target="_blank"
        rel="noreferrer"
      >
        Review category mappings
      </a>
    </aside>
  );
}
