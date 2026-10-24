import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CREATIVE_THEME_LIST } from "@shared/creativeThemes";
import { CREATIVE_ART_STYLES, CREATIVE_MOODS } from "@shared/creativeBuilder";
import { studioArtwork, studioModelArtwork } from "./studioArtwork";

const choices = [
  ...CREATIVE_THEME_LIST,
  ...CREATIVE_ART_STYLES,
  ...CREATIVE_MOODS,
  { name: "Image" },
  { name: "Video" },
  { name: "Subject only" },
  { name: "Lifestyle · no people" },
  { name: "Lifestyle · with people" },
];
const bytes = (url: string) =>
  readFileSync(path.join(process.cwd(), "client/public", url));

describe("Creative Studio choice artwork", () => {
  it.each(choices)(
    "$name has a real WebP asset instead of a placeholder",
    choice => {
      const url = studioArtwork(choice.name);
      expect(url, choice.name).toBeDefined();
      const image = bytes(url!);
      expect(image.subarray(0, 4).toString()).toBe("RIFF");
      expect(image.subarray(8, 12).toString()).toBe("WEBP");
      expect(image.length).toBeGreaterThan(1000);
    }
  );

  it("does not reuse artwork across themes, styles, moods or scene choices", () => {
    const paths = choices.map(choice => studioArtwork(choice.name)!);
    expect(new Set(paths).size).toBe(choices.length);
    const hashes = paths.map(url =>
      createHash("sha256").update(bytes(url)).digest("hex")
    );
    expect(new Set(hashes).size).toBe(choices.length);
  });

  it("gives Playful its own artwork rather than the Animation preview", () => {
    expect(studioArtwork("Playful")).not.toBe(studioArtwork("Animation"));
  });

  it("gives Cinema Studio and Genjutsu their own model covers", () => {
    const covers = ["cinema-studio", "genjutsu", "kling", "minimax"].map(id =>
      studioModelArtwork(id, "video")
    );
    expect(new Set(covers).size).toBe(covers.length);
    for (const url of covers) expect(bytes(url).length).toBeGreaterThan(1000);
  });
});
