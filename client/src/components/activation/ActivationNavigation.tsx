import { CalendarDays, ClipboardCheck, Image, Radio, Type } from "lucide-react";
import { StudioSections } from "../configurator/StudioSections";
export type ActivationSection =
  | "setup"
  | "creative"
  | "copy"
  | "delivery"
  | "preview";
export type ActivationEntry = {
  section: ActivationSection;
  category?: string;
  visit: number;
};
export const activationSections = [
  {
    id: "setup",
    title: "Destination",
    subtitle: "Channel & account",
    icon: Radio,
  },
  {
    id: "creative",
    title: "Creative",
    subtitle: "Assets & format",
    icon: Image,
  },
  { id: "copy", title: "Copy", subtitle: "Words & AI", icon: Type },
  {
    id: "delivery",
    title: "Timing",
    subtitle: "Plan delivery",
    icon: CalendarDays,
  },
  {
    id: "preview",
    title: "Review",
    subtitle: "Ready to approve",
    icon: ClipboardCheck,
  },
] as const;
export function ActivationSections({
  current,
  onSelect,
  needsChannel = false,
}: {
  current: ActivationSection;
  onSelect: (section: ActivationSection) => void;
  needsChannel?: boolean;
}) {
  return (
    <StudioSections
      label="Activation sections"
      current={current}
      onSelect={onSelect}
      items={activationSections.map(item => ({
        ...item,
        disabled: needsChannel && item.id !== "setup",
        disabledReason: "Choose a connected channel first",
      }))}
    />
  );
}
export function ActivationCategories({
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
  return (
    <div
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
