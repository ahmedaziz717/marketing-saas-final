import React, {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";

export type Theme = "light" | "dark" | "system";
export const APPEARANCE_KEY = "evokeloop-appearance";
const isTheme = (value: string | null): value is Theme =>
  value === "light" || value === "dark" || value === "system";

function savedTheme(fallback: Theme): Theme {
  try {
    const value =
      localStorage.getItem(APPEARANCE_KEY) ?? localStorage.getItem("theme");
    return isTheme(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
  toggleTheme?: () => void;
  switchable: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  switchable?: boolean;
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  switchable = false,
}: ThemeProviderProps) {
  const [preference, setPreference] = useState<Theme>(() =>
    savedTheme(defaultTheme)
  );
  const [systemDark, setSystemDark] = useState(
    () =>
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  const theme = switchable ? preference : "light";
  const resolvedTheme =
    theme === "system" ? (systemDark ? "dark" : "light") : theme;

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const update = (event: StorageEvent) => {
      if (event.key === APPEARANCE_KEY)
        setPreference(isTheme(event.newValue) ? event.newValue : defaultTheme);
    };
    window.addEventListener("storage", update);
    return () => window.removeEventListener("storage", update);
  }, [defaultTheme]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", resolvedTheme === "dark");
    root.style.colorScheme = resolvedTheme;
    if (switchable) root.dataset.workspaceTheme = resolvedTheme;
    else delete root.dataset.workspaceTheme;
  }, [resolvedTheme, switchable]);

  const setTheme = (next: Theme) => {
    if (!switchable || !isTheme(next)) return;
    setPreference(next);
    try {
      localStorage.setItem(APPEARANCE_KEY, next);
    } catch {
      /* Appearance still works without storage. */
    }
  };

  const toggleTheme = switchable
    ? () => {
        setTheme(resolvedTheme === "light" ? "dark" : "light");
      }
    : undefined;

  return (
    <ThemeContext.Provider
      value={{ theme, resolvedTheme, setTheme, toggleTheme, switchable }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
