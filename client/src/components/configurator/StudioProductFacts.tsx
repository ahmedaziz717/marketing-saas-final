import { useState } from "react";
import { Link } from "wouter";
import { Check, FileText, ListChecks, Package, Tag } from "lucide-react";
import type {
  ProductFactSelection,
  StudioProduct,
} from "@shared/studioProductFacts";

export function StudioProductFacts({
  products,
  selections,
  onChange,
  onSources,
  loading = false,
  error,
  onRetry,
}: {
  products: Array<StudioProduct & { imageUrl?: string }>;
  selections: ProductFactSelection[];
  onChange: (selection: ProductFactSelection) => void;
  onSources: () => void;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
}) {
  const [activeId, setActiveId] = useState<number>();
  const product = products.find(p => p.id === activeId) ?? products[0];
  if (loading) return <p role="status">Loading product details…</p>;
  if (error)
    return (
      <div role="alert">
        <p>{error}</p>
        <button type="button" onClick={onRetry}>
          Retry product details
        </button>
      </div>
    );
  if (!product)
    return (
      <div className="cfg-empty">
        <Package size={32} />
        <h3>Choose a catalog product first</h3>
        <p>
          Its specifications, features, description and price will appear here
          for you to select.
        </p>
        <button type="button" className="cfg-primary" onClick={onSources}>
          Choose catalog products
        </button>
      </div>
    );
  const selection = selections.find(s => s.productId === product.id) ?? {
    productId: product.id,
    featuredSpecKeys: [],
    includePrice: false,
  };
  const fields = Object.entries(product.specifications ?? {}).filter(
    ([, value]) => value.trim()
  );
  const description = [product.description, product.serviceDetails?.benefits]
    .filter(Boolean)
    .join("\n\n");
  const priceAvailable = !!product.price?.trim() && !!product.currency?.trim();
  const update = (patch: Partial<ProductFactSelection>) =>
    onChange({ ...selection, ...patch });
  const unavailable = selection.featuredSpecKeys.filter(
    key => !fields.some(([field]) => key === field)
  );
  const count =
    selection.featuredSpecKeys.length +
    Number(!!selection.includeDescription) +
    Number(selection.includePrice);
  return (
    <div className="cfg-product-facts">
      <p className="cfg-help">
        Choose the facts to feature in your ad. Other specifications remain
        background context. Prices are included only when you select them.
      </p>
      {products.length > 1 && (
        <div
          className="cfg-product-selector"
          role="group"
          aria-label="Selected catalog products"
        >
          {products.map(p => (
            <button
              type="button"
              key={p.id}
              aria-pressed={p.id === product.id}
              onClick={() => setActiveId(p.id)}
            >
              {p.imageUrl ? (
                <img src={p.imageUrl} alt="" />
              ) : (
                <Package size={24} />
              )}
              <strong>{p.name}</strong>
            </button>
          ))}
        </div>
      )}
      <section
        className="cfg-product-panel"
        aria-label={`Product details for ${product.name}`}
      >
        <header className="cfg-product-heading">
          {product.imageUrl && (
            <img src={product.imageUrl} alt={product.name} />
          )}
          <div>
            <small>
              CATALOG SOURCE{product.sku ? ` · ${product.sku}` : ""}
            </small>
            <h3>{product.name}</h3>
            <span>{count} selected for this ad</span>
          </div>
          <Link href="/app/catalog">Edit in Catalog</Link>
        </header>
        <div className="cfg-fact-grid">
          <button
            type="button"
            className="cfg-fact-tile"
            aria-pressed={!!selection.includeDescription}
            disabled={!description && !selection.includeDescription}
            onClick={() =>
              update({ includeDescription: !selection.includeDescription })
            }
          >
            <FileText size={21} />
            <strong>Description & benefits</strong>
            <span>
              {description
                ? "Use the catalog description in ad copy"
                : "No description in Catalog"}
            </span>
            {selection.includeDescription && (
              <Check size={17} className="cfg-fact-check" />
            )}
          </button>
          <button
            type="button"
            className="cfg-fact-tile"
            aria-pressed={selection.includePrice}
            disabled={!priceAvailable && !selection.includePrice}
            onClick={() => update({ includePrice: !selection.includePrice })}
          >
            <Tag size={21} />
            <strong>Include price</strong>
            <span>
              {priceAvailable
                ? `${product.currency} ${product.price}`
                : "Add a price and currency in Catalog"}
            </span>
            {selection.includePrice && (
              <Check size={17} className="cfg-fact-check" />
            )}
          </button>
        </div>
        {description && (
          <details className="cfg-product-description">
            <summary>Read catalog description & benefits</summary>
            <p>{description}</p>
          </details>
        )}
        <div className="cfg-choice-count">
          <strong>Specifications & features</strong>
          <span>
            {selection.featuredSpecKeys.length} / 20 selected
            {selection.featuredSpecKeys.length > 0 && (
              <button
                type="button"
                onClick={() => update({ featuredSpecKeys: [] })}
              >
                Clear highlights
              </button>
            )}
          </span>
        </div>
        {unavailable.length > 0 && (
          <p role="alert">
            Some selected attributes are no longer in Catalog:{" "}
            {unavailable.join(", ")}.{" "}
            <button
              type="button"
              onClick={() =>
                update({
                  featuredSpecKeys: selection.featuredSpecKeys.filter(
                    key => !unavailable.includes(key)
                  ),
                })
              }
            >
              Remove unavailable attributes
            </button>
          </p>
        )}
        {fields.length ? (
          <div className="cfg-fact-grid">
            {fields.map(([key, value]) => {
              const selected = selection.featuredSpecKeys.includes(key);
              return (
                <button
                  type="button"
                  className="cfg-fact-tile"
                  key={key}
                  aria-label={`Feature ${key}: ${value}`}
                  aria-pressed={selected}
                  disabled={
                    !selected && selection.featuredSpecKeys.length >= 20
                  }
                  title={`${key}: ${value}`}
                  onClick={() =>
                    update({
                      featuredSpecKeys: selected
                        ? selection.featuredSpecKeys.filter(k => k !== key)
                        : [...selection.featuredSpecKeys, key],
                    })
                  }
                >
                  <ListChecks size={21} />
                  <strong>{key}</strong>
                  <span>{value}</span>
                  {selected && <Check size={17} className="cfg-fact-check" />}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="cfg-empty">
            No structured specifications or features were imported for this
            product. Add them in Catalog or refresh its source.
          </p>
        )}
        {count > 0 && (
          <div className="cfg-product-selected">
            <strong>Selected for the ad</strong>
            <ul>
              {selection.includeDescription && (
                <li>Catalog description and benefits</li>
              )}
              {selection.featuredSpecKeys
                .filter(key => !unavailable.includes(key))
                .map(key => (
                  <li key={key}>
                    {key}: {product.specifications?.[key]}
                  </li>
                ))}
              {selection.includePrice && (
                <li>
                  Price: {product.currency} {product.price}
                  {product.serviceDetails?.pricing
                    ? ` · ${product.serviceDetails.pricing.replaceAll("_", " ")}`
                    : ""}
                </li>
              )}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
