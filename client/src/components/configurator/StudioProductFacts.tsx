import {
  structuredCatalogFacts,
  availabilityLabel,
} from "@shared/catalogFacts";
import "@/styles/catalogFacts.css";
import { useState } from "react";
import { Link } from "wouter";
import { Check, FileText, Package, Tag } from "lucide-react";
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
          Its specifications, features, availability, description and price will
          appear here for you to select.
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
  const facts = structuredCatalogFacts(product);
  const selectedFeatures = selection.featuredFeatures ?? [];
  const fields = Object.entries(facts.specifications).filter(([, value]) =>
    value.trim()
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
    Number(selection.includePrice) +
    Number(!!selection.includeAvailability) +
    selectedFeatures.length;
  return (
    <div className="cfg-product-facts">
      <p className="cfg-help">
        Choose the facts to feature in your ad. Other specifications remain
        background context. Price and availability appear in the ad only when
        selected.
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
              {product.provenance?.source?.toUpperCase() ||
                (product.sourceId ? "CONNECTED CATALOG" : "CATALOG")}
              {product.sku ? ` · ${product.sku}` : ""}
            </small>
            <h3>{product.name}</h3>
            <span>{count} selected for this ad</span>
          </div>
          <Link href="/app/catalog">Edit in Catalog</Link>
        </header>
        {product.relatedSources?.map(source => (
          <aside
            key={source.id}
            className="cfg-catalog-source-notice"
            role="status"
          >
            <strong>
              {source.source.toUpperCase()} copy available ·{" "}
              {Object.keys(source.specifications).length} specifications
            </strong>
            <p>
              This ad uses the{" "}
              {product.provenance?.source ||
                (product.sourceId ? "connected catalog" : "website scan")}{" "}
              copy.{" "}
              {source.status === "approved"
                ? "The other copy is approved; choose it in Subject & sources to use its facts."
                : "The other copy needs catalog review before it can be used in an ad."}
            </p>
            <Link
              href={`/app/catalog?${source.sourceId ? `sourceId=${source.sourceId}&` : ""}search=${encodeURIComponent(source.sku || source.name)}&status=${source.status}`}
            >
              Review this catalog copy →
            </Link>
            <details>
              <summary>Preview its specifications</summary>
              <ul>
                {Object.entries(source.specifications).map(([key, value]) => (
                  <li key={key}>
                    <strong>{key}:</strong> {value}
                  </li>
                ))}
              </ul>
            </details>
          </aside>
        ))}
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
          <button
            type="button"
            className="cfg-fact-tile"
            aria-label="Include availability"
            aria-pressed={!!selection.includeAvailability}
            disabled={
              (!facts.availability ||
                availabilityLabel(facts.availability) === "Not supplied") &&
              !selection.includeAvailability
            }
            onClick={() =>
              update({ includeAvailability: !selection.includeAvailability })
            }
          >
            <Package size={21} />
            <strong>Include availability</strong>
            <span>{availabilityLabel(facts.availability)}</span>
            {selection.includeAvailability && (
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
          <strong>Specifications</strong>
          <span>
            {selection.featuredSpecKeys.length + selectedFeatures.length} / 20
            highlights selected
            {selection.featuredSpecKeys.length + selectedFeatures.length >
              0 && (
              <button
                type="button"
                onClick={() =>
                  update({ featuredSpecKeys: [], featuredFeatures: [] })
                }
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
          <ul className="cfg-specification-list">
            {fields.map(([key, value]) => {
              const selected = selection.featuredSpecKeys.includes(key);
              return (
                <li key={key}>
                  <button
                    type="button"
                    aria-label={`Feature ${key}: ${value}`}
                    aria-pressed={selected}
                    disabled={
                      !selected &&
                      selection.featuredSpecKeys.length +
                        selectedFeatures.length >=
                        20
                    }
                    onClick={() =>
                      update({
                        featuredSpecKeys: selected
                          ? selection.featuredSpecKeys.filter(k => k !== key)
                          : [...selection.featuredSpecKeys, key],
                      })
                    }
                  >
                    <span aria-hidden="true">•</span>
                    <span>
                      <strong>{key}:</strong> {value}
                    </span>
                    {selected ? <Check size={17} /> : <span />}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="cfg-help">
            No structured specifications were imported. Add them in Catalog or
            refresh its source.
          </p>
        )}
        <div className="cfg-choice-count">
          <strong>Features & benefits</strong>
          <span>{selectedFeatures.length} selected</span>
        </div>
        {facts.features.length ? (
          <ul className="cfg-specification-list">
            {facts.features.map(feature => {
              const selected = selectedFeatures.includes(feature);
              return (
                <li key={feature}>
                  <button
                    type="button"
                    aria-label={`Feature: ${feature}`}
                    aria-pressed={selected}
                    disabled={
                      !selected &&
                      selection.featuredSpecKeys.length +
                        selectedFeatures.length >=
                        20
                    }
                    onClick={() =>
                      update({
                        featuredFeatures: selected
                          ? selectedFeatures.filter(f => f !== feature)
                          : [...selectedFeatures, feature],
                      })
                    }
                  >
                    <span aria-hidden="true">•</span>
                    <span>{feature}</span>
                    {selected ? <Check size={17} /> : <span />}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="cfg-help">
            No separate feature bullets supplied in Catalog.
          </p>
        )}
        {selectedFeatures.some(f => !facts.features.includes(f)) && (
          <p role="alert">
            Some selected features are no longer available.{" "}
            <button
              type="button"
              onClick={() =>
                update({
                  featuredFeatures: selectedFeatures.filter(f =>
                    facts.features.includes(f)
                  ),
                })
              }
            >
              Remove unavailable features
            </button>
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
                    {key}: {facts.specifications[key]}
                  </li>
                ))}
              {selectedFeatures.map(feature => (
                <li key={feature}>{feature}</li>
              ))}
              {selection.includeAvailability && (
                <li>Availability: {availabilityLabel(facts.availability)}</li>
              )}
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
