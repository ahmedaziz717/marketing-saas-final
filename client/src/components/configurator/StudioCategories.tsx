import { useEffect, useRef } from "react";

export function StudioCategories({
  items,
  current,
  onSelect,
}: {
  items: readonly {
    id: string;
    title: string;
    disabled?: boolean;
    reason?: string;
  }[];
  current: string;
  onSelect: (id: string) => void;
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
      className="cfg-categories"
      role="group"
      aria-label="Section categories"
    >
      {items.map(item => (
        <button
          key={item.id}
          type="button"
          aria-pressed={current === item.id}
          disabled={item.disabled}
          title={item.disabled ? item.reason : undefined}
          onClick={() => onSelect(item.id)}
        >
          {item.title}
        </button>
      ))}
    </div>
  );
}
