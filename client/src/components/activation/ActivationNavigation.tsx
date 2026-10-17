import { CalendarDays, ClipboardCheck, Image, Radio, Type } from "lucide-react";
import type { ReactNode } from "react";
import { StudioSections } from "../configurator/StudioSections";
import { copyDimensions, copyTaxonomy } from "@shared/copyTaxonomy";

export const copyDirectionCategories = copyDimensions.map(id => ({
  id,
  title: id === "offer" ? "Offer framing" : copyTaxonomy[id].label,
}));

export function normalizeCopyCategory(category: string) {
  return category === "direction"
    ? "messaging_style"
    : category === "setup"
      ? "brief"
      : ["message", "headline", "description", "link"].includes(category)
        ? "compose"
        : category;
}
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
    title: "Review & activate",
    subtitle: "Confirm delivery",
    icon: ClipboardCheck,
  },
] as const;
export function ActivationSections({
  current,
  onSelect,
  needsChannel = false,
  children,
}: {
  current: ActivationSection;
  onSelect: (section: ActivationSection) => void;
  needsChannel?: boolean;
  children: ReactNode;
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
    >
      {children}
    </StudioSections>
  );
}
export { StudioCategories as ActivationCategories } from "../configurator/StudioCategories";
