import { Monitor, Moon, Sun } from "lucide-react";
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

export function AppearanceMenu() {
  const { theme, setTheme } = useTheme();
  const current = choices.find(choice => choice.value === theme)!;
  const Icon = current.icon;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Appearance: ${current.label}`}
          title="Change appearance"
          className="rounded-xl"
        >
          <Icon size={18} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44 rounded-xl">
        <DropdownMenuLabel>Appearance</DropdownMenuLabel>
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
