import { expect, it } from "vitest";
import { creativeTypographyDirection } from "../shared/creativeFonts";
import {
  creativeSetupSchema,
  defaultCreativeSetup,
} from "../shared/creativeBuilder";
import { buildCreativePrompt } from "./lib/creativeBuilder";
it("retains the font lock through a saved/queued setup and gives it priority without stripping creative direction", () => {
  const setup = creativeSetupSchema.parse(
    JSON.parse(
      JSON.stringify({
        ...defaultCreativeSetup(),
        fontFamily: "Bungee",
        preserveFont: true,
        artStyle: "cinematic",
        mood: "vibrant",
        extraDirection: "Glowing neon trails and layered depth.",
      })
    )
  );
  const prompt = buildCreativePrompt({
    setup,
    brand: { colors: ["#123456"], fonts: ["Inter", "Lora"] } as any,
    products: [],
    formatId: "square_1_1",
    hasLogo: false,
    adaptMaster: true,
  });
  expect(prompt).toContain('preserve the selected font family "Bungee"');
  expect(prompt).toContain(
    "takes priority over any typography or font-family suggestion"
  );
  expect(prompt).toContain("ONE family for every newly generated headline");
  expect(prompt).toContain("sign-painter block capitals");
  expect(prompt).toContain("Glowing neon trails and layered depth.");
  expect(prompt).toContain("MANDATORY ART STYLE");
  expect(prompt).toContain("MANDATORY MOOD");
  expect(prompt).not.toContain("Font preservation is OFF");
});
it("uses one explicit brand family when preserving and restores mixed typography when off", () => {
  expect(creativeTypographyDirection("", true, ["Rubik", "Inter"])).toContain(
    'selected font family "Rubik"'
  );
  expect(creativeTypographyDirection("Bungee", false, ["Inter"])).toContain(
    "freedom to choose complementary fonts"
  );
  expect(creativeTypographyDirection("", true, [])).toContain(
    "Font preservation is OFF"
  );
});
