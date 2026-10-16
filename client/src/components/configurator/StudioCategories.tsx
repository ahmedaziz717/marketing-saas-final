import { useEffect, useRef } from "react";
import type { LucideIcon } from "lucide-react";
import { studioCategoryIcon } from "./studioCategoryIcons";

export function StudioCategories({
  items,
  current,
  onSelect,
  label = "Section categories",
  compact = false,
}: {
  items: readonly {
    id: string;
    title: string;
    disabled?: boolean;
    reason?: string;
    hint?: string;
    icon?: LucideIcon;
  }[];
  current: string;
  onSelect: (id: string) => void;
  label?: string;
  compact?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = container.current;
    const active = node?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!node || !active) return;
    const bounds = node.getBoundingClientRect();
    const target = active.getBoundingClientRect();
    const delta =
      target.left < bounds.left
        ? target.left - bounds.left
        : target.right > bounds.right
          ? target.right - bounds.right
          : 0;
    if (delta) node.scrollBy?.({ left: delta, behavior: "auto" });
  }, [current]);
  return (
    <div
      ref={container}
      className={compact ? "studio-category-filters" : "cfg-categories"}
      role="group"
      aria-label={label}
    >
      {items.map(item => {
        const Icon = item.icon ?? studioCategoryIcon(item.id, item.title);
        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={current === item.id}
            disabled={item.disabled}
            title={item.disabled ? item.reason : undefined}
            onClick={() => onSelect(item.id)}
          >
            <Icon
              className="studio-category-icon"
              size={compact ? 18 : 24}
              aria-hidden="true"
            />
            <span className="studio-category-label">{item.title}</span>
            {item.hint && <small>{item.hint}</small>}
          </button>
        );
      })}
    </div>
  );
}
