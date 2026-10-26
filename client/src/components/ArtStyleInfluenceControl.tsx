import {
  ART_STYLE_INFLUENCES,
  STYLE_INFLUENCE_HELP,
  type ArtStyleInfluence,
} from "@shared/artStyleInfluence";
import { CreativeDirectionSelect } from "./CreativeDirectionSelect";

export function ArtStyleInfluenceControl({
  value,
  onChange,
  disabled,
  preserveSourceStyle = false,
}: {
  value?: ArtStyleInfluence;
  onChange: (value: ArtStyleInfluence) => void;
  disabled?: boolean;
  preserveSourceStyle?: boolean;
}) {
  return (
    <div className="space-y-2">
      <CreativeDirectionSelect
        label="Art Style Influence"
        value={value ?? "balanced"}
        options={ART_STYLE_INFLUENCES}
        onChange={onChange}
        disabled={disabled || preserveSourceStyle}
      />
      <p className="text-xs text-muted-foreground">
        {preserveSourceStyle
          ? "Enhance preserves the source artwork's style. Use a new generation to apply a different art style."
          : STYLE_INFLUENCE_HELP}
      </p>
    </div>
  );
}
