import type { ReactNode } from "react";
import { Check, type LucideIcon } from "lucide-react";
import { ChoiceArt } from "./ChoiceArt";

/** One visual language for sources, people and creative choices. */
export function StudioCard({
  title,
  description,
  image,
  media,
  selected,
  disabled,
  onSelect,
  badge,
  children,
  contain = false,
  gallery,
  icon: Icon,
}: {
  title: string;
  description?: string;
  image?: string;
  media?: ReactNode;
  selected?: boolean;
  disabled?: boolean;
  onSelect: () => void;
  badge?: string;
  children?: ReactNode;
  contain?: boolean;
  /** A gallery owns the preview and its controls, outside the selection button. */
  gallery?: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <article
      style={{ minWidth: 0, alignSelf: "start" }}
      className={`cfg-card${selected ? " is-selected" : ""}${disabled ? " is-unavailable" : ""}`}
    >
      <button
        type="button"
        className="cfg-choice"
        aria-label={`Select ${title}`}
        aria-pressed={selected}
        disabled={disabled}
        onClick={onSelect}
      >
        {!gallery && (
          <div className={`cfg-card-art${contain ? " cfg-contain" : ""}`}>
            {media ??
              (image ? (
                <img src={image} alt={title} loading="lazy" />
              ) : (
                <ChoiceArt name={title} />
              ))}
            {badge && <span className="cfg-badge">{badge}</span>}
            <span className="cfg-selected-mark">
              {selected ? <Check size={15} /> : "+"}
            </span>
          </div>
        )}
        <div className="cfg-card-copy">
          <h3>
            {Icon && <Icon size={16} aria-hidden="true" />}
            {title}
          </h3>
          {description && <p>{description}</p>}
          {gallery && (
            <span className="text-xs">
              {selected ? "Selected - Remove product" : "Select product"}
            </span>
          )}
        </div>
      </button>
      {gallery && <div className="min-w-0 p-3 pt-0">{gallery}</div>}
      {children}
    </article>
  );
}
