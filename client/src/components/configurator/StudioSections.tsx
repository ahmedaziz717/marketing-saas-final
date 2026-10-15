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
    disabled?: boolean;
    disabledReason?: string;
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
            disabled={item.disabled}
            title={item.disabled ? item.disabledReason : undefined}
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
