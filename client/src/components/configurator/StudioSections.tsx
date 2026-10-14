import type { LucideIcon } from "lucide-react";

export function StudioSections<T extends string>({
  label,
  items,
  current,
  onSelect,
}: {
  label: string;
  items: readonly {
    id: T;
    title: string;
    subtitle: string;
    icon: LucideIcon;
  }[];
  current: T;
  onSelect: (id: T) => void;
}) {
  return (
    <nav className="cfg-sections" aria-label={label}>
      {items.map((item, index) => {
        const Icon = item.icon;
        return (
          <button
            type="button"
            key={item.id}
            aria-current={current === item.id ? "step" : undefined}
            onClick={() => onSelect(item.id)}
          >
            <Icon size={22} />
            <span>
              <strong>{item.title}</strong>
              <small>{item.subtitle}</small>
            </span>
            <b>{String(index + 1).padStart(2, "0")}</b>
          </button>
        );
      })}
    </nav>
  );
}
