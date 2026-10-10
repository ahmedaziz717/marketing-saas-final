import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  HAIR_COLORS,
  LIFESTYLE_PEOPLE,
  personOptions,
  filterLifestylePeople,
  MODEL_SHEETS,
} from "../shared/lifestylePeople";
import {
  creativeSetupSchema,
  defaultCreativeSetup,
} from "../shared/creativeBuilder";
import { readLifestylePortrait } from "./lib/lifestylePeople";
describe("lifestyle person library", () => {
  it("provides five new matching options on refresh for every hair color and setting", () => {
    expect(LIFESTYLE_PEOPLE).toHaveLength(500);
    expect(new Set(LIFESTYLE_PEOPLE.map(p => p.id)).size).toBe(500);
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

it("filters by gender, age, hair and search without changing library identities", () => {
  expect(filterLifestylePeople({ shot: "child" })).toHaveLength(150);
  expect(
    filterLifestylePeople({
      shot: "multiple",
      gender: "male",
      age: "child",
      hair: "blonde",
    })
  ).toHaveLength(10);
  expect(
    filterLifestylePeople({ shot: "female" }).every(
      p => p.age !== "child" && p.age !== "teen"
    )
  ).toBe(true);
  expect(
    filterLifestylePeople({ shot: "multiple", search: "girls-child-a-0" }).map(
      p => p.id
    )
  ).toEqual(["girls-child-a-0"]);
});
it("enforces one vs four models, unique identities, kids settings and legacy drafts", () => {
  const refs = [
    "female-black-0",
    "male-brown-0",
    "girls-child-a-0",
    "boys-teen-0",
  ].map(id => ({ kind: "library" as const, id }));
  const base = { ...defaultCreativeSetup(), shot: "multiple", people: refs };
  expect(creativeSetupSchema.parse(base).people).toEqual(refs);
  expect(
    creativeSetupSchema.safeParse({
      ...base,
      people: [...refs, { kind: "library", id: "men-senior-0" }],
    }).success
  ).toBe(false);
  expect(
    creativeSetupSchema.safeParse({ ...base, people: [refs[0], refs[0]] })
      .success
  ).toBe(false);
  expect(
    creativeSetupSchema.safeParse({
      ...base,
      shot: "female",
      people: refs.slice(0, 2),
    }).success
  ).toBe(false);
  expect(
    creativeSetupSchema.safeParse({ ...base, shot: "child", people: [refs[0]] })
      .success
  ).toBe(false);
  expect(
    creativeSetupSchema.safeParse({ ...base, shot: "child", people: [refs[2]] })
      .success
  ).toBe(true);
  expect(
    creativeSetupSchema.safeParse({ ...base, shot: "lifestyle" }).success
  ).toBe(false);
  expect(
    creativeSetupSchema.safeParse({ ...base, person: refs[0] }).success
  ).toBe(false);
});
it("ships all 400 new portraits as individually extractable, nonidentical images", async () => {
  const { createHash } = await import("node:crypto");
  const hashes = new Set<string>();
  for (const sheet of MODEL_SHEETS) {
    for (let index = 0; index < 25; index++) {
      const p = await readLifestylePortrait(`${sheet.id}-${index}`);
      const bytes = Buffer.from(p.b64Json, "base64");
      const meta = await sharp(bytes).metadata();
      expect(meta.width).toBeGreaterThanOrEqual(240);
      expect(Math.abs(meta.width! - meta.height!)).toBeLessThan(3);
      hashes.add(createHash("sha256").update(bytes).digest("hex"));
    }
  }
  expect(hashes.size).toBe(400);
}, 30_000);
