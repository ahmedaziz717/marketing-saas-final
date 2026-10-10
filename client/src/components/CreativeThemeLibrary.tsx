import { useState } from "react";
import {
  Bolt,
  CalendarDays,
  ChevronDown,
  Clapperboard,
  CloudFog,
  Cpu,
  Crown,
  Flag,
  Flame,
  Gem,
  Ghost,
  Gift,
  Globe2,
  GraduationCap,
  Heart,
  Leaf,
  Orbit,
  Package,
  Rocket,
  Search,
  Shapes,
  Snowflake,
  Sparkles,
  Sun,
  Tags,
  Target,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import {
  CREATIVE_THEME_GROUPS,
  CREATIVE_THEME_LIST,
  getCreativeThemeGroup,
  getCreativeTheme,
  type CreativeTheme,
  type CreativeThemeIcon,
  type CreativeThemeId,
} from "@shared/creativeBuilder";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";

const ICONS: Record<CreativeThemeIcon, LucideIcon> = {
  sparkles: Sparkles,
  rocket: Rocket,
  bolt: Bolt,
  package: Package,
  gem: Gem,
  target: Target,
  film: Clapperboard,
  globe: Globe2,
  cpu: Cpu,
  flame: Flame,
  cloud: CloudFog,
  orbit: Orbit,
  shapes: Shapes,
  crown: Crown,
  snowflake: Snowflake,
  calendar: CalendarDays,
  heart: Heart,
  flag: Flag,
  tag: Tags,
  trophy: Trophy,
  leaf: Leaf,
  sun: Sun,
  school: GraduationCap,
  ghost: Ghost,
  gift: Gift,
};

type Props = {
  selectedTheme: CreativeThemeId;
  onSelect: (theme: CreativeTheme) => void;
  disabled?: boolean;
};

export function CreativeThemeLibrary({
  selectedTheme,
  onSelect,
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("all");
  const selected = getCreativeTheme(selectedTheme);
  const Icon = ICONS[selected.icon];
  const groups = CREATIVE_THEME_GROUPS.filter(
    item => group === "all" || item.id === group
  )
    .map(item => ({
      ...item,
      themes: item.themes.filter(theme =>
        `${theme.name} ${theme.direction} ${item.name}`
          .toLowerCase()
          .includes(search.trim().toLowerCase())
      ),
    }))
    .filter(item => item.themes.length);
  return (
    <div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        aria-label="Browse themes"
        aria-haspopup="dialog"
        className="flex w-full min-w-0 items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:border-primary/50 disabled:opacity-50"
      >
        <span
          className="grid h-12 w-12 shrink-0 place-items-center rounded-lg text-white shadow-sm"
          style={{
            background: `linear-gradient(135deg, ${selected.palette.join(", ")})`,
          }}
        >
          <Icon size={21} className="rounded bg-black/30 p-0.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{selected.name}</span>
          <span className="mt-1 block text-xs text-muted-foreground">
            {getCreativeThemeGroup(selectedTheme)?.name} ·{" "}
            {CREATIVE_THEME_LIST.length} themes available
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary">
          Browse <ChevronDown size={14} />
        </span>
      </button>
      <Dialog open={open && !disabled} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[88dvh] flex-col overflow-hidden sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Choose a creative theme</DialogTitle>
            <DialogDescription>
              Explore everyday styles, seasonal moments, and monthly themes.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                aria-label="Search creative themes"
                placeholder="Search themes"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </label>
            <select
              aria-label="Theme collection"
              value={group}
              onChange={e => setGroup(e.target.value)}
              className="h-10 rounded-lg border bg-background px-3 text-sm"
            >
              <option value="all">All collections</option>
              {CREATIVE_THEME_GROUPS.map(item => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <div className="min-h-0 space-y-5 overflow-y-auto p-1">
            {groups.map(item => (
              <section key={item.id}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {item.name}
                </h3>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {item.themes.map(theme => {
                    const ThemeIcon = ICONS[theme.icon];
                    return (
                      <button
                        key={theme.id}
                        type="button"
                        aria-label={theme.name}
                        aria-pressed={theme.id === selectedTheme}
                        onClick={() => {
                          onSelect(theme);
                          setOpen(false);
                        }}
                        className={`relative min-h-28 overflow-hidden rounded-xl border p-3 text-left transition-colors ${theme.id === selectedTheme ? "border-primary bg-primary/5 ring-1 ring-primary" : "bg-card hover:border-primary/50"}`}
                      >
                        <span
                          aria-hidden="true"
                          className="absolute inset-x-0 top-0 h-1"
                          style={{
                            background: `linear-gradient(90deg, ${theme.palette.join(", ")})`,
                          }}
                        />
                        <span className="flex items-center gap-2 text-sm font-medium">
                          <ThemeIcon
                            size={16}
                            className="shrink-0 text-primary"
                          />
                          {theme.name}
                        </span>
                        <span className="mt-2 line-clamp-3 block text-xs leading-5 text-muted-foreground">
                          {theme.direction}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
            {!groups.length && (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No themes match “{search}”. Try another search or collection.
              </p>
            )}
          </div>
          <div className="flex items-center justify-between border-t pt-3">
            <p className="text-xs text-muted-foreground">
              Selected: {selected.name}
            </p>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
