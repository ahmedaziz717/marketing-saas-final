import {
  CREATIVE_ART_STYLES,
  CREATIVE_MOODS,
  getCreativeTheme,
} from "@shared/creativeBuilder";
import {
  defaultVideoDirection,
  type VideoDirection,
} from "@shared/videoCreation";
import { CreativeThemeLibrary } from "./CreativeThemeLibrary";
import { CreativeDirectionSelect } from "./CreativeDirectionSelect";

export function VideoCreativeDirection({
  value,
  onChange,
  disabled,
}: {
  value: VideoDirection | null | undefined;
  onChange: (value: VideoDirection) => void;
  disabled?: boolean;
}) {
  const direction = value ?? defaultVideoDirection;
  const update = (patch: Partial<VideoDirection>) =>
    onChange({ ...direction, ...patch });
  return (
    <section
      className="space-y-4 rounded-xl border bg-muted/15 p-4"
      aria-label="Video creative direction"
    >
      <div>
        <h3 className="text-sm font-semibold">Creative direction</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {value
            ? "Your theme, mood, and style guide the video and generated prompt."
            : "Choose a direction to add styling to this saved prompt."}
        </p>
      </div>
      <CreativeThemeLibrary
        selectedTheme={direction.theme}
        disabled={disabled}
        onSelect={theme => update({ theme: theme.id, themePrompt: "" })}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <CreativeDirectionSelect
          label="Mood"
          value={direction.mood}
          options={CREATIVE_MOODS}
          onChange={mood => update({ mood })}
          disabled={disabled}
        />
        <CreativeDirectionSelect
          label="Art style"
          value={direction.artStyle}
          options={CREATIVE_ART_STYLES}
          onChange={artStyle => update({ artStyle })}
          disabled={disabled}
        />
        <label className="text-sm font-medium">
          Visual setting
          <select
            value={direction.setting}
            disabled={disabled}
            onChange={e =>
              update({ setting: e.target.value as VideoDirection["setting"] })
            }
            className="mt-2 h-11 w-full rounded-xl border bg-background px-3 text-sm font-normal"
          >
            <option value="product">Product / brand focus</option>
            <option value="lifestyle">Lifestyle · no person</option>
            <option value="people">Lifestyle · with person(s)</option>
          </select>
        </label>
        <label className="text-sm font-medium">
          Subject placement
          <select
            value={direction.placement}
            disabled={disabled}
            onChange={e =>
              update({
                placement: e.target.value as VideoDirection["placement"],
              })
            }
            className="mt-2 h-11 w-full rounded-xl border bg-background px-3 text-sm font-normal"
          >
            <option value="auto">Let AI arrange it</option>
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </label>
      </div>
      <details className="border-t pt-3">
        <summary className="cursor-pointer text-sm font-medium">
          Customize direction
        </summary>
        <label className="mt-4 block text-sm">
          Theme instructions
          <textarea
            rows={3}
            maxLength={4000}
            value={
              direction.themePrompt ||
              getCreativeTheme(direction.theme).direction
            }
            disabled={disabled}
            onChange={e => update({ themePrompt: e.target.value })}
            className="mt-2 w-full rounded-xl border bg-background p-3 text-sm"
          />
        </label>
        <label className="mt-3 block text-sm">
          Extra direction
          <textarea
            rows={2}
            maxLength={4000}
            value={direction.extraDirection}
            disabled={disabled}
            onChange={e => update({ extraDirection: e.target.value })}
            placeholder="Lighting, environment, pacing, or details to preserve…"
            className="mt-2 w-full rounded-xl border bg-background p-3 text-sm"
          />
        </label>
      </details>
    </section>
  );
}
