export const HAIR_COLORS = [
  { id: "black", label: "Black" },
  { id: "brown", label: "Brown" },
  { id: "blonde", label: "Blonde" },
  { id: "auburn", label: "Red / Auburn" },
  { id: "silver", label: "Gray / Silver" },
] as const;
export type HairColor = (typeof HAIR_COLORS)[number]["id"];
export const LIFESTYLE_PEOPLE = (["female", "male"] as const).flatMap(gender =>
  HAIR_COLORS.flatMap(hair =>
    Array.from({ length: 10 }, (_, index) => ({
      id: `${gender}-${hair.id}-${index}`,
      gender,
      hair: hair.id,
      name: `${gender === "female" ? "Woman" : "Man"} · ${hair.label} ${index + 1}`,
      sheet: `/people/${gender}-${hair.id}.webp`,
      column: index % 5,
      row: Math.floor(index / 5),
    }))
  )
);
export function findLifestylePerson(id: string) {
  return LIFESTYLE_PEOPLE.find(person => person.id === id);
}
export type LifestylePerson = (typeof LIFESTYLE_PEOPLE)[number];
export function personOptions(
  gender: "female" | "male",
  hair: string,
  page: number
) {
  const people = LIFESTYLE_PEOPLE.filter(
    p => p.gender === gender && (hair === "any" || p.hair === hair)
  );
  // Interleave hair colors in the unfiltered gallery.
  if (hair === "any")
    people.sort(
      (a, b) => Number(a.id.split("-").at(-1)) - Number(b.id.split("-").at(-1))
    );
  const start = (page % Math.ceil(people.length / 5)) * 5;
  return people.slice(start, start + 5);
}
