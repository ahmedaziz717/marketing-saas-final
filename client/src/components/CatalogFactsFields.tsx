import { useId } from "react";
import { Plus, X } from "lucide-react";
import { specificationLines, availabilityLabel } from "@shared/catalogFacts";
import { VisualSelect, ChoiceField } from "./choices/VisualSelect";

export function CatalogFactsFields({
  specifications,
  features,
  availability,
  onChange,
}: {
  specifications: string;
  features: string[];
  availability: string;
  onChange: (patch: {
    specifications?: string;
    features?: string[];
    availability?: string;
  }) => void;
}) {
  const id = useId();
  const rows = specifications ? specificationLines(specifications) : [];
  const saveRows = (next: typeof rows) =>
    onChange({
      specifications: next.map(r => `${r.name}: ${r.value}`).join("\n"),
    });
  const statuses = [
    "",
    "In stock",
    "Out of stock",
    "Preorder",
    "Backorder",
    "Limited availability",
    "Discontinued",
  ];
  return (
    <div className="catalog-facts-fields space-y-6">
      <ChoiceField className="space-y-2 text-sm font-medium">
        Availability
        <VisualSelect
          aria-label="Availability"
          value={availability}
          showAll
          searchable={false}
          density="compact"
          onChange={e => onChange({ availability: e.target.value })}
        >
          {!statuses.includes(availability) && (
            <option value={availability}>
              {availabilityLabel(availability)}
            </option>
          )}
          {statuses.map(s => (
            <option key={s} value={s}>
              {s || "Not supplied"}
            </option>
          ))}
        </VisualSelect>
      </ChoiceField>
      <section aria-labelledby={`${id}-specs`}>
        <h3 id={`${id}-specs`} className="font-semibold">
          Specifications
        </h3>
        <p className="mb-3 text-xs text-muted-foreground">
          One fact per bullet, with its name and exact value.
        </p>
        <ul className="catalog-fact-editor-list">
          {rows.map((row, i) => (
            <li key={i}>
              <span aria-hidden="true">•</span>
              <input
                aria-label={`Specification ${i + 1} name`}
                placeholder="e.g. Processor"
                maxLength={120}
                value={row.name}
                onChange={e =>
                  saveRows(
                    rows.map((r, n) =>
                      n === i
                        ? { ...r, name: e.target.value.replaceAll(":", "") }
                        : r
                    )
                  )
                }
              />
              <input
                aria-label={`Specification ${i + 1} value`}
                placeholder="Exact value"
                maxLength={1000}
                value={row.value}
                onChange={e =>
                  saveRows(
                    rows.map((r, n) =>
                      n === i ? { ...r, value: e.target.value } : r
                    )
                  )
                }
              />
              <button
                type="button"
                aria-label={`Remove specification ${i + 1}`}
                onClick={() => saveRows(rows.filter((_, n) => n !== i))}
              >
                <X size={16} />
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="catalog-add-fact"
          disabled={rows.length >= 100}
          onClick={() => saveRows([...rows, { name: "", value: "" }])}
        >
          <Plus size={16} /> Add specification
        </button>
      </section>
      <section aria-labelledby={`${id}-features`}>
        <h3 id={`${id}-features`} className="font-semibold">
          Features & benefits
        </h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Keep each product feature as a separate bullet.
        </p>
        <ul className="catalog-fact-editor-list" data-features>
          {features.map((feature, i) => (
            <li key={i}>
              <span aria-hidden="true">•</span>
              <input
                aria-label={`Feature ${i + 1}`}
                maxLength={1000}
                value={feature}
                placeholder="Product feature"
                onChange={e =>
                  onChange({
                    features: features.map((f, n) =>
                      n === i ? e.target.value : f
                    ),
                  })
                }
              />
              <button
                type="button"
                aria-label={`Remove feature ${i + 1}`}
                onClick={() =>
                  onChange({ features: features.filter((_, n) => n !== i) })
                }
              >
                <X size={16} />
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="catalog-add-fact"
          disabled={features.length >= 100}
          onClick={() => onChange({ features: [...features, ""] })}
        >
          <Plus size={16} /> Add feature
        </button>
      </section>
    </div>
  );
}
