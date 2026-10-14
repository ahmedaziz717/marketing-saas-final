import type { ReactNode } from "react";
import { Check } from "lucide-react";
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
}) {
  return (
    <article
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
        <div className="cfg-card-copy">
          <h3>{title}</h3>
          {description && <p>{description}</p>}
        </div>
      </button>
      {children}
    </article>
  );
}
