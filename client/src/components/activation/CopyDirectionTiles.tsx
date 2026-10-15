import { useState } from "react";
import { Search, X } from "lucide-react";
import {
  copyDimensions,
  copyTaxonomy,
  type CopyDimension,
} from "@shared/copyTaxonomy";
import { toggleCopyDirection, type CopyDirection } from "@shared/copyDirection";
import { StudioCard } from "../configurator/StudioCard";
import { copyDirectionArt } from "./copyDirectionArt";

export function CopyDirectionTiles({
  value = {},
  onChange,
}: {
  value?: CopyDirection;
  onChange: (value: CopyDirection) => void;
}) {
  const [dimension, setDimension] = useState<CopyDimension>("messaging_style");
  const [search, setSearch] = useState("");
  const spec = copyTaxonomy[dimension];
  const selected = value[dimension] ?? [];
  const selections = copyDimensions.flatMap(key =>
    copyTaxonomy[key].values
      .filter(item => value[key]?.includes(item.id))
      .map(item => ({ ...item, dimension: key }))
  );
  const rows = spec.values.filter(item =>
    `${item.label} ${item.description}`
      .toLowerCase()
      .includes(search.trim().toLowerCase())
  );
  return (
    <section className="activation-copy-direction" aria-label="Copy direction">
      <p className="activation-help">
        Shape the message with the same attributes used in Optimization. Leave
        any category open for AI to choose. These choices guide new copy; they
        do not rewrite existing text.
      </p>
      <div
        className="cfg-filter-tabs activation-dimension-tabs"
        role="group"
        aria-label="Copy attributes"
      >
        {copyDimensions.map(key => (
          <button
            type="button"
            key={key}
            aria-pressed={dimension === key}
            onClick={() => {
              setDimension(key);
              setSearch("");
            }}
          >
            {copyTaxonomy[key].label}
            {!!value[key]?.length && <span>{value[key]!.length}</span>}
          </button>
        ))}
      </div>
      {selections.length > 0 && (
        <div
          className="activation-direction-selections"
          aria-label="Selected copy direction"
        >
          {selections.map(item => (
            <button
              type="button"
              key={`${item.dimension}:${item.id}`}
              aria-label={`Remove ${copyTaxonomy[item.dimension].label}: ${item.label}`}
              onClick={() =>
                onChange(toggleCopyDirection(value, item.dimension, item.id))
              }
            >
              <small>{copyTaxonomy[item.dimension].label}</small>
              {item.label}
              <X size={12} />
            </button>
          ))}
          <button type="button" onClick={() => onChange({})}>
            Clear all
          </button>
        </div>
      )}
      <div className="activation-direction-heading">
        <div>
          <h3>{spec.label}</h3>
          <p>
            {spec.question}{" "}
            {spec.multiple ? "Choose one or more." : "Choose one."}
          </p>
        </div>
        <label className="cfg-search">
          <Search size={16} />
          <input
            aria-label={`Search ${spec.label.toLowerCase()}`}
            placeholder="Find a direction…"
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
        </label>
      </div>
      {dimension === "copy_length" && (
        <p className="activation-help">
          Length applies to primary text or the post caption. Headlines and
          descriptions keep the shorter limits for your channel.
        </p>
      )}
      {(dimension === "urgency" ||
        dimension === "offer" ||
        dimension === "specificity") && (
        <p className="activation-help">
          Add the real offer, deadline or supporting facts in Copy. Selecting a
          tile does not create an offer or verify a claim.
        </p>
      )}
      <div className="cfg-card-grid activation-direction-grid">
        {rows.map(item => (
          <StudioCard
            key={item.id}
            title={item.label}
            description={item.description}
            image={`/studio-art/${copyDirectionArt[dimension][item.id]}.webp`}
            badge={spec.label}
            selected={selected.includes(item.id)}
            onSelect={() =>
              onChange(toggleCopyDirection(value, dimension, item.id))
            }
          />
        ))}
      </div>
      {!rows.length && (
        <p role="status" className="activation-help">
          No choices match your search.
        </p>
      )}
    </section>
  );
}
