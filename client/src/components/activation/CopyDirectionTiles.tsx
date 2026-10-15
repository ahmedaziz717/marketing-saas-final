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
  dimension: categoryDimension,
}: {
  value?: CopyDirection;
  onChange: (value: CopyDirection) => void;
  dimension?: CopyDimension;
}) {
  const [localDimension, setDimension] =
    useState<CopyDimension>("messaging_style");
  const dimension = categoryDimension ?? localDimension;
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "selected">("all");
  const spec = copyTaxonomy[dimension];
  const selected = value[dimension] ?? [];
  const selections = (categoryDimension ? [dimension] : copyDimensions).flatMap(
    key =>
      copyTaxonomy[key].values
        .filter(item => value[key]?.includes(item.id))
        .map(item => ({ ...item, dimension: key }))
  );
  const rows = spec.values.filter(
    item =>
      (filter === "all" || selected.includes(item.id)) &&
      `${item.label} ${item.description}`
        .toLowerCase()
        .includes(search.trim().toLowerCase())
  );
  return (
    <section className="activation-copy-direction" aria-label="Copy direction">
      <p className="activation-help">
        Choose how the message should sound, or leave this category for AI to
        choose. Your choices guide new copy without changing existing text.
      </p>
      {!categoryDimension && (
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
      )}
      <div
        className="cfg-filter-tabs activation-dimension-tabs"
        role="group"
        aria-label={`Filter ${spec.label.toLowerCase()} choices`}
      >
        <button
          type="button"
          aria-pressed={filter === "all"}
          onClick={() => setFilter("all")}
        >
          All
        </button>
        <button
          type="button"
          aria-pressed={filter === "selected"}
          onClick={() => setFilter("selected")}
        >
          Selected ({selected.length})
        </button>
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
          {!categoryDimension && (
            <button type="button" onClick={() => onChange({})}>
              Clear all
            </button>
          )}
        </div>
      )}
      <div className="activation-direction-heading">
        <div>
          {!categoryDimension && <h3>{spec.label}</h3>}
          <p>
            {spec.question}{" "}
            {spec.multiple ? "Choose one or more." : "Choose one."}
          </p>
          <button
            className="cfg-secondary"
            type="button"
            aria-pressed={!selected.length}
            onClick={() => {
              onChange({ ...value, [dimension]: [] });
              setFilter("all");
            }}
          >
            {!selected.length ? "AI chooses ✓" : "Let AI choose"}
          </button>
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
          Add the real offer, deadline or supporting facts in the Brief.
          Selecting a tile does not create an offer or verify a claim.
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
