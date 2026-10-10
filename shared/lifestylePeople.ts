export const HAIR_COLORS = [
  { id: "black", label: "Black" },
  { id: "brown", label: "Brown" },
  { id: "blonde", label: "Blonde" },
  { id: "auburn", label: "Red / Auburn" },
  { id: "silver", label: "Gray / Silver" },
] as const;
export type HairColor = (typeof HAIR_COLORS)[number]["id"];
export const MODEL_AGES = [
  { id: "child", label: "Kids · 6–12" },
  { id: "teen", label: "Teens · 13–17" },
  { id: "young", label: "Young adults · 18–34" },
  { id: "adult", label: "Adults · 35–54" },
  { id: "senior", label: "Older adults · 55+" },
  { id: "adult_unspecified", label: "Adults · mixed ages" },
] as const;
export type ModelAge = (typeof MODEL_AGES)[number]["id"];
export type LifestylePerson = {
  id: string;
  gender: "female" | "male";
  hair: HairColor;
  age: ModelAge;
  name: string;
  sheet: string;
  column: number;
  row: number;
  columns: number;
  rows: number;
};
// Preserve every original ID and crop so existing drafts keep the same identity.
const originalPeople: LifestylePerson[] = (["female", "male"] as const).flatMap(
  gender =>
    HAIR_COLORS.flatMap(hair =>
      Array.from({ length: 10 }, (_, index) => ({
        id: `${gender}-${hair.id}-${index}`,
        gender,
        hair: hair.id,
        age: "adult_unspecified" as const,
        name: `${gender === "female" ? "Woman" : "Man"} · ${hair.label} ${index + 1}`,
        sheet: `/people/${gender}-${hair.id}.webp`,
        column: index % 5,
        row: Math.floor(index / 5),
        columns: 5,
        rows: 2,
      }))
    )
);
export const MODEL_SHEETS: Array<{
  id: string;
  gender: "female" | "male";
  age: ModelAge;
  lastHair: HairColor;
}> = [
  { id: "girls-child-a", gender: "female", age: "child", lastHair: "brown" },
  { id: "boys-child-a", gender: "male", age: "child", lastHair: "brown" },
  { id: "girls-child-b", gender: "female", age: "child", lastHair: "black" },
  { id: "boys-child-b", gender: "male", age: "child", lastHair: "black" },
  { id: "girls-teen", gender: "female", age: "teen", lastHair: "brown" },
  { id: "boys-teen", gender: "male", age: "teen", lastHair: "brown" },
  { id: "women-young-a", gender: "female", age: "young", lastHair: "black" },
  { id: "men-young-a", gender: "male", age: "young", lastHair: "black" },
  { id: "women-young-b", gender: "female", age: "young", lastHair: "brown" },
  { id: "men-young-b", gender: "male", age: "young", lastHair: "brown" },
  { id: "women-adult-a", gender: "female", age: "adult", lastHair: "silver" },
  { id: "men-adult-a", gender: "male", age: "adult", lastHair: "silver" },
  { id: "women-adult-b", gender: "female", age: "adult", lastHair: "brown" },
  { id: "men-adult-b", gender: "male", age: "adult", lastHair: "brown" },
  { id: "women-senior", gender: "female", age: "senior", lastHair: "silver" },
  { id: "men-senior", gender: "male", age: "senior", lastHair: "silver" },
];
const expandedPeople: LifestylePerson[] = MODEL_SHEETS.flatMap(
  (sheet, sheetIndex) =>
    Array.from({ length: 25 }, (_, index) => ({
      id: `${sheet.id}-${index}`,
      gender: sheet.gender,
      age: sheet.age,
      hair: (
        ["black", "brown", "blonde", "auburn", sheet.lastHair] as HairColor[]
      )[Math.floor(index / 5)],
      name: `${sheet.age === "child" || sheet.age === "teen" ? (sheet.gender === "female" ? "Girl" : "Boy") : sheet.gender === "female" ? "Woman" : "Man"} · ${String(101 + sheetIndex * 25 + index).padStart(3, "0")}`,
      sheet: `/people/${sheet.id}.webp`,
      column: index % 5,
      row: Math.floor(index / 5),
      columns: 5,
      rows: 5,
    }))
);
export const LIFESTYLE_PEOPLE = [...originalPeople, ...expandedPeople];
export function findLifestylePerson(id: string) {
  return LIFESTYLE_PEOPLE.find(person => person.id === id);
}
export function isChildModel(age: unknown) {
  return age === "child" || age === "teen";
}
export function isPeopleShot(shot: string) {
  return ["female", "male", "child", "multiple"].includes(shot);
}
export function modelMatchesShot(
  model: { gender?: unknown; age?: unknown },
  shot: string
) {
  if (shot === "multiple")
    return model.gender === "female" || model.gender === "male";
  if (shot === "child") return isChildModel(model.age);
  return (
    (shot === "female" || shot === "male") &&
    model.gender === shot &&
    !isChildModel(model.age)
  );
}
export function filterLifestylePeople(filters: {
  shot: string;
  gender?: string;
  age?: string;
  hair?: string;
  search?: string;
}) {
  const query = filters.search?.trim().toLowerCase() || "";
  return LIFESTYLE_PEOPLE.filter(
    p =>
      modelMatchesShot(p, filters.shot) &&
      (!filters.gender ||
        filters.gender === "any" ||
        p.gender === filters.gender) &&
      (!filters.age || filters.age === "any" || p.age === filters.age) &&
      (!filters.hair || filters.hair === "any" || p.hair === filters.hair) &&
      (!query ||
        `${p.name} ${p.id} ${p.hair} ${MODEL_AGES.find(a => a.id === p.age)?.label}`
          .toLowerCase()
          .includes(query))
  );
}
// Retained for older consumers; the full picker uses the filtered catalog.
export function personOptions(
  gender: "female" | "male",
  hair: string,
  page: number
) {
  const people = filterLifestylePeople({ shot: gender, hair });
  const start = (page % Math.ceil(people.length / 5)) * 5;
  return people.slice(start, start + 5);
}
