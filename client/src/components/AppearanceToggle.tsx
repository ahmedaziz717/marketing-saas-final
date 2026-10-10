import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";

export function AppearanceToggle() {
  const { resolvedTheme, toggleTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const label = dark ? "Switch to light mode" : "Switch to dark mode";
  const Icon = dark ? Sun : Moon;

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      className="workspace-theme-toggle"
      onClick={toggleTheme}
      disabled={!toggleTheme}
    >
      <Icon className="size-[18px]" aria-hidden="true" />
    </Button>
  );
}
