import { useState, type ReactNode } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import type { LucideIcon } from "lucide-react";

/** Keep every filter and its current value visible while editing one group. */
export function StudioFilterTabs({
  label,
  defaultValue,
  items,
}: {
  label: string;
  defaultValue: string;
  items: {
    id: string;
    title: string;
    summary: string;
    icon: LucideIcon;
    content: ReactNode;
  }[];
}) {
  const [current, setCurrent] = useState(defaultValue);
  return (
    <Tabs.Root
      className="studio-filter-tabs"
      value={current}
      onValueChange={setCurrent}
    >
      <Tabs.List className="studio-filter-tablist" aria-label={label}>
        {items.map(({ id, title, summary, icon: Icon }) => (
          <Tabs.Trigger
            key={id}
            value={id}
            className="studio-filter-tab"
            onClick={() => setCurrent(id)}
          >
            <Icon size={20} aria-hidden="true" />
            <span>
              <strong>{title}</strong>
              <small>{summary}</small>
            </span>
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {items.map(({ id, content }) => (
        <Tabs.Content key={id} value={id} className="studio-filter-panel">
          {content}
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}
