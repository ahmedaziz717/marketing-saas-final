import {
  Clock3,
  Monitor,
  Sparkles,
  Volume2,
  VolumeX,
  SlidersHorizontal,
} from "lucide-react";
import type { ModelOptions, ModelProperty } from "@shared/modelCatalog";
import { StudioCard } from "./StudioCard";

const label = (value: string) =>
  value.replaceAll("_", " ").replace(/^./, s => s.toUpperCase());
const qualityNames: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Maximum",
  auto: "Automatic",
};
const qualityDescriptions: Record<string, string> = {
  low: "Explore ideas at a lower quality setting.",
  medium: "A middle setting for everyday creation.",
  high: "A higher quality setting for your finished creative.",
  xhigh: "An extra-high quality setting for detailed work.",
  max: "The highest quality setting this model offers.",
  auto: "Let the model choose this setting.",
};
function title(key: string, value: string | number | boolean) {
  if (typeof value === "boolean") return value ? "On" : "Off";
  if (key === "quality")
    return qualityNames[String(value)] ?? label(String(value));
  if (key === "duration" && !Number.isNaN(Number(value)))
    return value + " seconds";
  return label(String(value));
}
function synopsis(key: string, value: string | number | boolean) {
  if (key === "quality")
    return qualityDescriptions[String(value)] ?? "Supported quality setting.";
  if (key === "duration") return "Length of the generated clip.";
  if (key === "resolution") return "Output resolution for your video.";
  if (key === "aspect_ratio") {
    const [w, h] = String(value).split(":").map(Number);
    return w && h
      ? w === h
        ? "Square framing."
        : w > h
          ? "Landscape framing."
          : "Portrait framing."
      : "Follow the model's framing.";
  }
  if (["generate_audio", "sound"].includes(key))
    return value
      ? "Generate sound with this video."
      : "Generate without sound.";
  return typeof value === "boolean"
    ? value
      ? "Enable this setting."
      : "Keep this setting off."
    : "Supported model setting.";
}
function SettingVisual({
  setting,
  value,
}: {
  setting: string;
  value: string | number | boolean;
}) {
  const ratio =
    setting === "aspect_ratio" ? String(value).split(":").map(Number) : [];
  if (ratio.length === 2 && ratio.every(n => n > 0)) {
    const scale = 55 / Math.max(...ratio);
    return (
      <div className="cfg-setting-art">
        <span
          className="cfg-ratio-outline"
          style={{ width: ratio[0] * scale, height: ratio[1] * scale }}
        />
        <strong>{String(value)}</strong>
      </div>
    );
  }
  const Icon =
    setting === "duration"
      ? Clock3
      : setting === "resolution"
        ? Monitor
        : ["generate_audio", "sound"].includes(setting)
          ? value
            ? Volume2
            : VolumeX
          : setting === "quality"
            ? Sparkles
            : SlidersHorizontal;
  const level = ["low", "medium", "high", "xhigh", "max"].indexOf(
    String(value)
  );
  return (
    <div className="cfg-setting-art">
      <Icon size={27} />
      {setting === "quality" && level >= 0 ? (
        <span className="cfg-quality-meter">
          {[0, 1, 2, 3, 4].map(i => (
            <i key={i} className={i <= level ? "is-on" : ""} />
          ))}
        </span>
      ) : (
        <strong>
          {typeof value === "boolean" ? (value ? "ON" : "OFF") : String(value)}
        </strong>
      )}
    </div>
  );
}

/** Model-schema choices in the same card system as themes, sources and people. */
export function ModelSettingTiles({
  fields,
  options,
  values,
  onChange,
  disabled,
}: {
  fields: Array<[string, ModelProperty]>;
  options: ModelOptions;
  values: ModelOptions;
  onChange: (options: ModelOptions) => void;
  disabled?: boolean;
}) {
  return (
    <div className="cfg-model-settings">
      {fields.map(([key, p]) => {
        const fieldTitle = p.title || label(key);
        const choices: Array<string | number | boolean> | undefined =
          p.enum ??
          (p.type === "boolean"
            ? [false, true]
            : key === "duration" &&
                p.type === "integer" &&
                p.minimum !== undefined &&
                p.maximum !== undefined &&
                p.maximum - p.minimum <= 20
              ? Array.from(
                  { length: p.maximum - p.minimum + 1 },
                  (_, i) => p.minimum! + i
                )
              : undefined);
        const unset = () => {
          const next = { ...options };
          delete next[key];
          onChange(next);
        };
        return (
          <fieldset className="cfg-setting-group" key={key} disabled={disabled}>
            <legend>{fieldTitle}</legend>
            {p.description && <p className="cfg-help">{p.description}</p>}
            {choices ? (
              <div
                className="cfg-card-grid cfg-setting-tiles"
                role="group"
                aria-label={fieldTitle}
              >
                {p.default === undefined && p.type !== "boolean" && (
                  <StudioCard
                    title="Automatic"
                    description="Use this model's default behavior."
                    selected={values[key] === undefined}
                    onSelect={unset}
                    disabled={disabled}
                    media={<SettingVisual setting={key} value="auto" />}
                  />
                )}
                {choices.map(value => (
                  <StudioCard
                    key={String(value)}
                    title={title(key, value)}
                    description={synopsis(key, value)}
                    selected={values[key] === value}
                    badge={p.default === value ? "Default" : undefined}
                    disabled={disabled}
                    media={<SettingVisual setting={key} value={value} />}
                    onSelect={() => onChange({ ...options, [key]: value })}
                  />
                ))}
              </div>
            ) : (
              <div className="cfg-setting-custom cfg-card">
                <SettingVisual setting={key} value={values[key] ?? "Custom"} />
                <label>
                  {fieldTitle}
                  <input
                    aria-label={fieldTitle}
                    disabled={disabled}
                    type={p.type === "string" ? "text" : "number"}
                    min={p.minimum}
                    max={p.maximum}
                    step={p.type === "integer" ? 1 : "any"}
                    maxLength={p.maxLength}
                    value={String(values[key] ?? "")}
                    placeholder={
                      p.default === undefined ? "Automatic" : String(p.default)
                    }
                    onChange={e =>
                      e.target.value
                        ? onChange({
                            ...options,
                            [key]:
                              p.type === "string"
                                ? e.target.value
                                : Number(e.target.value),
                          })
                        : unset()
                    }
                  />
                </label>
                <small>
                  {p.minimum !== undefined || p.maximum !== undefined
                    ? `Supported range: ${p.minimum ?? "no minimum"}–${p.maximum ?? "no maximum"}`
                    : "Enter a custom value, or leave blank for the model default."}
                </small>
              </div>
            )}
          </fieldset>
        );
      })}
    </div>
  );
}
