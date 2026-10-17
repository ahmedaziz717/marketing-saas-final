import { useEffect, useId, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, type LucideIcon } from "lucide-react";

export function StudioSections<T extends string>({
  label,
  items,
  current,
  onSelect,
  children,
  enabled = true,
}: {
  label: string;
  items: readonly {
    id: T;
    title: string;
    subtitle: string;
    icon: LucideIcon;
    disabled?: boolean;
    disabledReason?: string;
    progress?: { explored: number; total: number };
  }[];
  current: T;
  onSelect: (id: T) => void;
  children: ReactNode;
  enabled?: boolean;
}) {
  const panelId = useId();
  const [mobile, setMobile] = useState(
    () =>
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(max-width: 700px)").matches
  );
  const [collapsed, setCollapsed] = useState<T | null>(null);
  useEffect(() => {
    const query = window.matchMedia?.("(max-width: 700px)");
    if (!query) return;
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => setCollapsed(null), [current]);
  if (!enabled) return <>{children}</>;

  const active = items.find(item => item.id === current) ?? items[0];
  const panel = (
    <div
      key="panel"
      id={panelId}
      className="cfg-section-panel"
      hidden={mobile && collapsed === current}
      role="region"
      aria-label={active?.title}
    >
      {children}
    </div>
  );
  const button = (item: (typeof items)[number], index: number) => {
    const Icon = item.icon;
    const expanded = current === item.id && collapsed !== current;
    return (
      <button
        type="button"
        key={item.id}
        className="cfg-section-button"
        aria-current={current === item.id ? "step" : undefined}
        aria-expanded={mobile ? expanded : undefined}
        aria-controls={mobile ? panelId : undefined}
        disabled={item.disabled}
        title={item.disabled ? item.disabledReason : undefined}
        onClick={() => {
          if (mobile && current === item.id) {
            setCollapsed(expanded ? current : null);
          } else {
            setCollapsed(null);
            onSelect(item.id);
          }
        }}
      >
        <Icon size={22} aria-hidden="true" />
        <span>
          <strong>{item.title}</strong>
          <small>{item.subtitle}</small>
          {item.progress && (
            <span
              className="cfg-section-progress"
              aria-label={`${item.progress.explored} of ${item.progress.total} categories explored`}
            >
              {Array.from({ length: item.progress.total }, (_, i) => (
                <i key={i} data-explored={i < item.progress!.explored} />
              ))}
            </span>
          )}
        </span>
        {mobile ? (
          expanded ? (
            <ChevronUp
              className="cfg-section-chevron"
              size={18}
              aria-hidden="true"
            />
          ) : (
            <ChevronDown
              className="cfg-section-chevron"
              size={18}
              aria-hidden="true"
            />
          )
        ) : (
          <b aria-hidden="true">{String(index + 1).padStart(2, "0")}</b>
        )}
      </button>
    );
  };
  // A stable sibling key preserves form state even when its accordion position changes.
  const contents = mobile
    ? items.flatMap((item, index) => [
        <h2 className="cfg-section-heading" key={item.id}>
          {button(item, index)}
        </h2>,
        ...(item.id === active?.id ? [panel] : []),
      ])
    : [
        <nav key="navigation" className="cfg-sections" aria-label={label}>
          {items.map(button)}
        </nav>,
        panel,
      ];
  return (
    <div
      className={`cfg-section-layout${mobile ? " is-mobile" : ""}`}
      role={mobile ? "group" : undefined}
      aria-label={mobile ? label : undefined}
    >
      {contents}
    </div>
  );
}
