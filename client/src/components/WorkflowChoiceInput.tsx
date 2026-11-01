import {
  fieldChoices,
  selectionValues,
  type AppField,
} from "@shared/workflowInputs";
import {
  StudioChoicePicker,
  studioThemeChoices,
  studioThemeGroups,
  studioStyleChoices,
  type StudioChoice,
} from "./configurator/StudioChoicePicker";
import { ChoiceArt } from "./configurator/ChoiceArt";
import { studioCategoryIcon } from "./configurator/studioCategoryIcons";
import { copyDimensions, copyTaxonomy } from "@shared/copyTaxonomy";
import { copyDirectionArt } from "./activation/copyDirectionArt";

export function WorkflowChoiceInput({
  field,
  title,
  value,
  onChange,
}: {
  field: AppField;
  title: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const selected = selectionValues(value, field.multiple);
  const copyDimension =
    field.kind === "choice"
      ? copyDimensions.find(key =>
          [title, field.studio?.category].includes(copyTaxonomy[key].label)
        )
      : undefined;
  const catalog =
    field.kind === "theme"
      ? studioThemeChoices
      : field.kind === "art_style"
        ? studioStyleChoices
        : [];
  const choices: StudioChoice[] = fieldChoices(field).map(option => {
    const visual = catalog.find(c => c.id === option.id);
    const Icon = studioCategoryIcon(copyDimension ?? field.kind);
    const copyImage =
      copyDimension && copyDirectionArt[copyDimension][option.id];
    const ratioParts = option.id.split(":").map(Number);
    const ratio =
      ratioParts.length === 2 &&
      ratioParts.every(n => Number.isFinite(n) && n > 0)
        ? ratioParts[0] / ratioParts[1]
        : null;
    return {
      ...visual,
      id: option.id,
      title: field.source === "system" && visual ? visual.title : option.label,
      description: option.direction,
      icon: visual?.icon ?? Icon,
      media:
        visual?.media ??
        (copyImage ? (
          <img
            src={`/studio-art/${copyImage}.webp`}
            alt={`${option.label} visual inspiration`}
            loading="lazy"
          />
        ) : field.kind === "size" && ratio ? (
          <ChoiceArt name={option.label} type={`format:${ratio}`} />
        ) : (
          <div className="studio-choice-symbol">
            <Icon size={38} aria-hidden="true" />
          </div>
        )),
    };
  });
  return (
    <StudioChoicePicker
      title={title}
      choices={choices}
      selected={selected}
      groups={field.kind === "theme" ? studioThemeGroups : []}
      multiple={field.multiple}
      maxSelections={field.maxSelections}
      disabled={field.locked}
      onClear={() => onChange(field.multiple ? "[]" : "")}
      onSelect={id => {
        if (field.locked) return;
        if (!field.multiple) return onChange(id);
        if (selected.includes(id))
          onChange(JSON.stringify(selected.filter(v => v !== id)));
        else if (selected.length < field.maxSelections)
          onChange(JSON.stringify([...selected, id]));
      }}
    />
  );
}
