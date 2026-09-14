import { useEffect, useMemo, useState } from "react";
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
  type CreativeTheme,
  type CreativeThemeIcon,
  type CreativeThemeId,
} from "@shared/creativeBuilder";
import { Input } from "./ui/input";

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
};

export function CreativeThemeLibrary({ selectedTheme, onSelect }: Props) {
  const currentMonth = new Intl.DateTimeFormat("en", { month: "long" })
    .format(new Date())
    .toLowerCase();
  const selectedGroup = getCreativeThemeGroup(selectedTheme)?.id;
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(["always-on", "evergreen", currentMonth, selectedGroup].filter(Boolean) as string[])
  );

  useEffect(() => {
    const group = getCreativeThemeGroup(selectedTheme)?.id;
    if (!group) return;
    setExpanded(previous => {
      if (previous.has(group)) return previous;
      return new Set(Array.from(previous).concat(group));
    });
  }, [selectedTheme]);

  const normalizedSearch = search.trim().toLowerCase();
  const groups = useMemo(
    () =>
      CREATIVE_THEME_GROUPS.map(group => ({
        ...group,
        themes: group.themes.filter(theme =>
          `${theme.name} ${theme.direction}`.toLowerCase().includes(normalizedSearch)
        ),
      })).filter(group => group.themes.length > 0),
    [normalizedSearch]
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">Theme library</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {CREATIVE_THEME_LIST.length} directions · always-on, evergreen, and monthly moments
          </p>
        </div>
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search creative themes"
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search themes"
            className="pl-9"
          />
        </div>
      </div>

      <div className="max-h-[34rem] space-y-2 overflow-y-auto rounded-2xl border border-border bg-background/60 p-2 sm:p-3">
        {groups.map(group => {
          const open = Boolean(normalizedSearch) || expanded.has(group.id);
          return (
            <section key={group.id} className="overflow-hidden rounded-xl border border-border bg-card">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
                aria-expanded={open}
                onClick={() =>
                  setExpanded(previous => {
                    const next = new Set(previous);
                    if (next.has(group.id)) next.delete(group.id);
                    else next.add(group.id);
                    return next;
                  })
                }
              >
                <span>
                  <span className="block text-sm font-semibold">{group.name}</span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    {group.themes.length} themes
                  </span>
                </span>
                <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
              </button>
              {open && (
                <div className="grid gap-2 border-t border-border p-2 sm:grid-cols-2 lg:grid-cols-3">
                  {group.themes.map(theme => {
                    const Icon = ICONS[theme.icon];
                    const selected = selectedTheme === theme.id;
                    return (
                      <button
                        key={theme.id}
                        type="button"
                        aria-pressed={selected}
                        aria-label={theme.name}
                        onClick={() => onSelect(theme)}
                        className={`group relative min-h-20 overflow-hidden rounded-xl border p-3 text-left transition ${
                          selected
                            ? "border-primary bg-primary/[.06] ring-2 ring-primary/10"
                            : "border-border hover:border-primary/40 hover:bg-muted/50"
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className="absolute inset-x-0 top-0 h-1"
                          style={{ background: `linear-gradient(90deg, ${theme.palette.join(", ")})` }}
                        />
                        <span className="flex items-start gap-2.5">
                          <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${selected ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-medium leading-5">{theme.name}</span>
                            <span className="mt-1 line-clamp-2 block text-[11px] leading-4 text-muted-foreground">
                              {theme.direction}
                            </span>
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
        {!groups.length && (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            No themes match “{search}”.
          </div>
        )}
      </div>
    </div>
  );
}
