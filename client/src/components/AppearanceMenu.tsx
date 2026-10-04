import { ChevronDown, Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type Theme } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const choices = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

export function AppearanceMenu({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();
  const current = choices.find(choice => choice.value === theme)!;
  const Icon = current.icon;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          aria-label={`Theme: ${current.label}`}
          title="Change theme"
          className="workspace-theme-trigger"
          data-compact={compact}
        >
          <Icon size={18} aria-hidden="true" />
          <span>Theme</span>
          {!compact && (
            <>
              <span className="workspace-theme-value">{current.label}</span>
              <ChevronDown size={14} aria-hidden="true" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="right"
        align="start"
        sideOffset={10}
        className="w-44 rounded-xl"
      >
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={value => setTheme(value as Theme)}
        >
          {choices.map(({ value, label, icon: ChoiceIcon }) => (
            <DropdownMenuRadioItem
              key={value}
              value={value}
              className="gap-2 py-2.5"
            >
              <ChoiceIcon size={16} />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
