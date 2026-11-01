import { z } from "zod";
import {
  copyDimensions,
  copyTaxonomy,
  type CopyDimension,
} from "./copyTaxonomy";

// Creative intent is saved separately from the tags measured on finished copy.
export const exclusiveCopyValues: Partial<Record<CopyDimension, string[]>> = {
  urgency: ["no_pressure", "no_explicit_urgency"],
  offer: ["no_explicit_offer"],
  specificity: ["general"],
};
const choices = (dimension: CopyDimension) =>
  z
    .array(
      z.enum(
        copyTaxonomy[dimension].values.map(value => value.id) as [
          string,
          ...string[],
        ]
      )
    )
    .max(
      copyTaxonomy[dimension].multiple
        ? copyTaxonomy[dimension].values.length
        : 1
    )
    .refine(
      values => new Set(values).size === values.length,
      "Choose each value once."
    )
    .refine(
      values =>
        values.length <= 1 ||
        !values.some(value => exclusiveCopyValues[dimension]?.includes(value)),
      "This choice cannot be combined with the other selections."
    )
    .optional();
export const copyDirectionSchema = z
  .object({
    messaging_style: choices("messaging_style"),
    messaging_angle: choices("messaging_angle"),
    emotional_tone: choices("emotional_tone"),
    benefit_feature: choices("benefit_feature"),
    urgency: choices("urgency"),
    offer: choices("offer"),
    specificity: choices("specificity"),
    copy_length: choices("copy_length"),
  })
  .strict();
export type CopyDirection = z.infer<typeof copyDirectionSchema>;

export function toggleCopyDirection(
  current: CopyDirection,
  dimension: CopyDimension,
  value: string
): CopyDirection {
  const values = current[dimension] ?? [];
  const next = values.includes(value)
    ? values.filter(item => item !== value)
    : !copyTaxonomy[dimension].multiple ||
        exclusiveCopyValues[dimension]?.includes(value)
      ? [value]
      : [
          ...values.filter(
            item => !exclusiveCopyValues[dimension]?.includes(item)
          ),
          value,
        ];
  return { ...current, [dimension]: next };
}

export function copyDirectionBrief(direction?: CopyDirection) {
  return copyDimensions.flatMap(dimension => {
    const values = copyTaxonomy[dimension].values.filter(value =>
      direction?.[dimension]?.includes(value.id)
    );
    return values.length
      ? [
          {
            attribute: copyTaxonomy[dimension].label,
            values: values.map(({ label, description }) => ({
              label,
              description,
            })),
          },
        ]
      : [];
  });
}
