export const placementSlots = [
  {
    key: "square",
    label: "Facebook Feed / default",
    ratio: "1:1",
    size: "1080 × 1080",
    aspect: 1,
  },
  {
    key: "portrait",
    label: "Instagram Feed",
    ratio: "4:5",
    size: "1080 × 1350",
    aspect: 0.8,
  },
  {
    key: "story",
    label: "Reels & Stories",
    ratio: "9:16",
    size: "1080 × 1920",
    aspect: 9 / 16,
  },
] as const;
export type PlacementSlot = (typeof placementSlots)[number]["key"];
