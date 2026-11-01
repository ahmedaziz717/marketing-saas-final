import { VisualSelect } from "@/components/choices/VisualSelect";
import { useState, type ReactNode } from "react";
import { Brush, Palette, Search, X, type LucideIcon } from "lucide-react";
import { CREATIVE_THEME_GROUPS } from "@shared/creativeThemes";
import { CREATIVE_ART_STYLES } from "@shared/creativeBuilder";
import { ChoiceArt } from "./ChoiceArt";
import { StudioCard } from "./StudioCard";
import "@/styles/studioChoices.css";

export type StudioChoice = {
  id: string;
  title: string;
  description?: string;
  group?: string;
  image?: string;
  media?: ReactNode;
  icon?: LucideIcon;
};

export const studioThemeChoices: StudioChoice[] = CREATIVE_THEME_GROUPS.flatMap(
  g =>
    g.themes.map(t => ({
      id: t.id,
      title: t.name,
      description: t.direction,
      group: g.id,
      icon: Palette,
      media: <ChoiceArt name={t.name} palette={t.palette} />,
    }))
);
export const studioStyleChoices: StudioChoice[] = CREATIVE_ART_STYLES.map(
  s => ({
    id: s.id,
    title: s.name,
    description: s.direction,
    icon: Brush,
    media: <ChoiceArt name={s.name} />,
  })
);
export const studioThemeGroups = CREATIVE_THEME_GROUPS.map(g => ({
  id: g.id,
  title: g.name,
}));

/** The same inline visual picker is used in Studios, App previews and published forms. */
export function StudioChoicePicker({
  title,
  choices,
  selected,
  onSelect,
  groups = [],
  disabled = false,
  multiple = false,
  maxSelections,
  onClear,
}: {
  title: string;
  choices: readonly StudioChoice[];
  selected: readonly string[];
  onSelect: (id: string) => void;
  groups?: readonly { id: string; title: string }[];
  disabled?: boolean;
  multiple?: boolean;
  maxSelections?: number;
  onClear?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("all");
  const availableGroups = groups.filter(g =>
    choices.some(c => c.group === g.id)
  );
  const activeGroup = availableGroups.some(g => g.id === group) ? group : "all";
  const visible = choices.filter(
    c =>
      (activeGroup === "all" || c.group === activeGroup) &&
      `${c.title} ${c.description ?? ""} ${groups.find(g => g.id === c.group)?.title ?? ""}`
        .toLowerCase()
        .includes(query.trim().toLowerCase())
  );
  return (
    <div className="studio-choice-picker" role="group" aria-label={title}>
      <div className="studio-choice-toolbar">
        <h3>{title}</h3>
        {availableGroups.length > 0 && (
          <details className="studio-collection-filter">
            <summary>
              Collections ·{" "}
              {availableGroups.find(g => g.id === activeGroup)?.title ?? "All"}
            </summary>
            <VisualSelect
              density="select"
              aria-label={`${title} collection`}
              value={activeGroup}
              onChange={event => setGroup(event.target.value)}
            >
              <option value="all">All collections</option>
              {availableGroups.map(g => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </VisualSelect>
          </details>
        )}
        <p aria-live="polite">
          {visible.length} {visible.length === 1 ? "choice" : "choices"}
          <small>
            {multiple
              ? `Choose up to ${maxSelections ?? choices.length} · ${selected.length} selected`
              : "Choose one"}
          </small>
        </p>
        <label className="studio-choice-search">
          <Search size={16} aria-hidden="true" />
          <input
            aria-label={`Search ${title.toLowerCase()} choices`}
            placeholder={`Search ${title.toLowerCase()}…`}
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              aria-label={`Clear ${title.toLowerCase()} search`}
              onClick={() => setQuery("")}
            >
              <X size={14} />
            </button>
          )}
        </label>
      </div>
      {!!selected.length && (
        <div className="studio-choice-selection">
          <span>
            Selected:{" "}
            {choices
              .filter(c => selected.includes(c.id))
              .map(c => c.title)
              .join(", ") || "Unavailable choice"}
          </span>
          {onClear && (
            <button type="button" disabled={disabled} onClick={onClear}>
              Clear selection
            </button>
          )}
        </div>
      )}
      <div className="cfg-card-grid studio-choice-grid">
        {visible.map(c => (
          <StudioCard
            key={c.id}
            title={c.title}
            description={c.description}
            image={c.image}
            media={c.media}
            icon={c.icon}
            selected={selected.includes(c.id)}
            disabled={
              disabled ||
              (multiple &&
                maxSelections !== undefined &&
                selected.length >= maxSelections &&
                !selected.includes(c.id))
            }
            onSelect={() => onSelect(c.id)}
          />
        ))}
      </div>
      {!visible.length && (
        <div className="studio-choice-empty">
          <p>
            {choices.length
              ? "No choices match your search."
              : "No choices are available for this field."}
          </p>
          {choices.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setGroup("all");
              }}
            >
              Reset filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
