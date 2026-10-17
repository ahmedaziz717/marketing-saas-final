import { useCallback, useId, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
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
  const trackId = useId();
  const itemIds = JSON.stringify(items.map(item => item.id));
  const [scroll, setScroll] = useState({
    overflow: false,
    left: false,
    right: false,
  });
  const measure = useCallback(() => {
    const node = container.current;
    if (!node) return;
    const remaining = node.scrollWidth - node.clientWidth;
    const next = {
      overflow: remaining > 1,
      left: node.scrollLeft > 1,
      right: node.scrollLeft < remaining - 1,
    };
    setScroll(previous =>
      previous.overflow === next.overflow &&
      previous.left === next.left &&
      previous.right === next.right
        ? previous
        : next
    );
  }, []);
  useLayoutEffect(() => {
    const node = container.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [measure]);
  useLayoutEffect(() => {
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
    measure();
  }, [current, itemIds, measure]);
  useLayoutEffect(measure, [items, measure]);
  const move = (direction: number) => {
    const node = container.current;
    node?.scrollBy({
      left: direction * node.clientWidth * 0.8,
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  };
  return (
    <div
      className={
        compact
          ? "studio-category-navigation studio-category-filters"
          : "studio-category-navigation cfg-categories"
      }
    >
      {scroll.overflow && (
        <button
          type="button"
          className="studio-category-arrow"
          aria-label={`Scroll ${label.toLowerCase()} left`}
          aria-controls={trackId}
          disabled={!scroll.left}
          onClick={() => move(-1)}
        >
          <ChevronLeft size={19} aria-hidden="true" />
        </button>
      )}
      <div
        ref={container}
        id={trackId}
        className="studio-category-track"
        role="group"
        aria-label={label}
        onScroll={measure}
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
      {scroll.overflow && (
        <button
          type="button"
          className="studio-category-arrow"
          aria-label={`Scroll ${label.toLowerCase()} right`}
          aria-controls={trackId}
          disabled={!scroll.right}
          onClick={() => move(1)}
        >
          <ChevronRight size={19} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
