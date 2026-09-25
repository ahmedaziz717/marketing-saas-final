import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  HAIR_COLORS,
  LIFESTYLE_PEOPLE,
  personOptions,
} from "../shared/lifestylePeople";
import {
  creativeSetupSchema,
  defaultCreativeSetup,
} from "../shared/creativeBuilder";
import { readLifestylePortrait } from "./lib/lifestylePeople";
describe("lifestyle person library", () => {
  it("provides five new matching options on refresh for every hair color and setting", () => {
    expect(new Set(LIFESTYLE_PEOPLE.map(p => p.id)).size).toBe(100);
    for (const gender of ["male", "female"] as const)
      for (const hair of HAIR_COLORS) {
        const first = personOptions(gender, hair.id, 0);
        const next = personOptions(gender, hair.id, 1);
        expect(first).toHaveLength(5);
        expect(next).toHaveLength(5);
        expect(
          next.every(
            p =>
              p.gender === gender &&
              p.hair === hair.id &&
              !first.some(a => a.id === p.id)
          )
        ).toBe(true);
      }
  });
  it("rejects unknown identities, gender mismatches, and person references in no-person shots", () => {
    const setup = defaultCreativeSetup();
    expect(
      creativeSetupSchema.safeParse({
        ...setup,
        person: { kind: "library", id: "../../secret" },
        shot: "female",
      }).success
    ).toBe(false);
    expect(
      creativeSetupSchema.safeParse({
        ...setup,
        person: { kind: "library", id: "female-black-0" },
        shot: "male",
      }).success
    ).toBe(false);
    expect(
      creativeSetupSchema.safeParse({
        ...setup,
        person: { kind: "library", id: "female-black-0" },
      }).success
    ).toBe(false);
    expect(
      creativeSetupSchema.safeParse({
        ...setup,
        person: { kind: "library", id: "female-black-0" },
        shot: "female",
      }).success
    ).toBe(true);
    expect(creativeSetupSchema.parse(setup).person).toBeUndefined();
  });
  it("extracts individual reference portraits from all shipped sheets and rejects arbitrary paths", async () => {
    for (const gender of ["male", "female"])
      for (const hair of HAIR_COLORS) {
        for (const index of [0, 9]) {
          const portrait = await readLifestylePortrait(
            `${gender}-${hair.id}-${index}`
          );
          const meta = await sharp(
            Buffer.from(portrait.b64Json, "base64")
          ).metadata();
          expect(meta.width).toBeGreaterThan(300);
          expect(meta.width).toBeLessThan(450);
          expect(Math.abs(meta.width! - meta.height!)).toBeLessThan(4);
        }
      }
    await expect(readLifestylePortrait("../../secret")).rejects.toThrow(
      "unavailable"
    );
  });
});
