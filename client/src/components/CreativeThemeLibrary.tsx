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
  CREATIVE_THEME_LIST,
  getCreativeThemeGroup,
  getCreativeTheme,
  type CreativeTheme,
  type CreativeThemeIcon,
  type CreativeThemeId,
} from "@shared/creativeBuilder";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import {
  StudioChoicePicker,
  studioThemeChoices,
  studioThemeGroups,
} from "./configurator/StudioChoicePicker";
import "@/styles/configurator.css";

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

/** Compact launch control for older builders; the library uses the shared Studio picker. */
export function CreativeThemeLibrary({
  selectedTheme,
  onSelect,
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const selected = getCreativeTheme(selectedTheme);
  const Icon = ICONS[selected.icon];
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
          <Icon
            size={21}
            className="rounded bg-black/30 p-0.5"
            aria-hidden="true"
          />
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
        <DialogContent className="cfg-root flex max-h-[88dvh] flex-col overflow-hidden sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Choose a creative theme</DialogTitle>
            <DialogDescription>
              Explore everyday styles, seasonal moments, and monthly themes.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto p-1">
            <StudioChoicePicker
              title="Theme"
              choices={studioThemeChoices}
              groups={studioThemeGroups}
              selected={[selectedTheme]}
              disabled={disabled}
              onSelect={id => {
                onSelect(getCreativeTheme(id));
                setOpen(false);
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
