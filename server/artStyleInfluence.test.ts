import { describe, expect, it } from "vitest";
import { artStyleInfluenceDirection } from "../shared/artStyleInfluence";
import {
  creativeSetupSchema,
  defaultCreativeSetup,
} from "../shared/creativeBuilder";
import {
  buildCreativePrompt,
  type BuilderBrandKit,
} from "./lib/creativeBuilder";
import {
  defaultVideoSetup,
  defaultVideoDirection,
  videoSetupSchema,
  videoRequestBody,
} from "../shared/videoCreation";
import {
  appFieldSchema,
  fieldChoices,
  fieldValueProblem,
  fieldPrompt,
} from "../shared/workflowInputs";
import { generationModel, modelRequestBody } from "../shared/modelCatalog";

const brand = {
  name: "CLX",
  voice: "Bold",
  colors: ["#ff0000"],
  fonts: ["Rubik"],
  requiredClaims: "",
  prohibitedContent: "No invented offers",
} as BuilderBrandKit;
function prompt(
  influence: "subtle" | "balanced" | "strong" = "strong",
  extra = {}
) {
  return buildCreativePrompt({
    setup: {
      ...defaultCreativeSetup(),
      basePrompt:
        "Use photorealistic commercial photography, realistic materials.",
      artStyle: "animation",
      artStyleInfluence: influence,
      ...extra,
    },
    brand,
    products: [],
    formatId: "square_1_1",
    hasLogo: true,
  });
}
describe("art style influence", () => {
  it("round-trips all levels without rewriting old drafts or workspace defaults", () => {
    for (const value of ["subtle", "balanced", "strong"] as const) {
      const setup = creativeSetupSchema.parse(
        JSON.parse(
          JSON.stringify({
            ...defaultCreativeSetup(),
            artStyleInfluence: value,
          })
        )
      );
      expect(setup.artStyleInfluence).toBe(value);
      const video = videoSetupSchema.parse({
        ...defaultVideoSetup,
        direction: { ...defaultVideoDirection, artStyleInfluence: value },
      });
      expect(video.direction?.artStyleInfluence).toBe(value);
    }
    const old = { ...defaultCreativeSetup() };
    delete old.artStyleInfluence;
    expect(creativeSetupSchema.parse(old).artStyleInfluence).toBeUndefined();
    expect(
      creativeSetupSchema.safeParse({ ...old, artStyleInfluence: "100%" })
        .success
    ).toBe(false);
    expect(artStyleInfluenceDirection()).toContain("Balanced");
  });
  it("makes strong animation override photographic scene instructions but protects source facts and preservation", () => {
    const text = prompt("strong", {
      preserveProduct: true,
      preserveLogo: true,
      preserveFont: true,
    });
    expect(text).toContain("Use photorealistic commercial photography"); // retained, not destructive rewrite
    expect(text).toContain("STRONG ANIMATION");
    expect(text).toContain(
      "Conflicting photographic or realistic-scene instructions"
    );
    expect(text).toContain(
      "An explicitly preserved original product photo remains unchanged"
    );
    expect(text).toContain("logo and font preservation");
    expect(text).toContain("PRODUCT OVERLAY WORKFLOW");
    expect(text).toContain("ORIGINAL LOGO FINISH");
    expect(text).toContain("Render this customer-selected copy accurately");
  });
  it("does not make subtle or realistic choices animated", () => {
    expect(prompt("subtle")).toContain("light stylistic touches");
    expect(prompt("subtle")).not.toContain("STRONG ANIMATION");
    expect(prompt("strong", { artStyle: "realistic" })).not.toContain(
      "STRONG ANIMATION"
    );
  });
  it("ordinary enhancement retains source style rather than silently restyling", () => {
    const text = prompt("strong", {
      enhancement: {
        assetKey: "creative:1",
        revision: "a".repeat(64),
        instruction: "Improve image quality.",
      },
    });
    expect(text).toContain("source artwork remains the visual anchor");
    expect(text).not.toContain("ART STYLE INFLUENCE");
    expect(text).not.toContain("STRONG ANIMATION");
  });
  it("video and image provider payloads use prompt policy, not a fabricated strength parameter", () => {
    const video = videoRequestBody(
      {
        ...defaultVideoSetup,
        prompt: "Photographic scene",
        direction: {
          ...defaultVideoDirection,
          artStyle: "animation",
          artStyleInfluence: "strong",
        },
      },
      []
    );
    expect(video.prompt).toContain("STRONG ANIMATION");
    expect(video).not.toHaveProperty("style_strength");
    const body = modelRequestBody(
      generationModel("openai:gpt-image-2.5-sunburst")!,
      { prompt: prompt(), images: [], options: { quality: "medium" } }
    );
    expect(body.prompt).toContain("STRONG ANIMATION");
    expect(body.quality).toBe("medium");
    expect(body).not.toHaveProperty("artStyleInfluence");
    expect(body).not.toHaveProperty("style_strength");
  });
  it("exposes curated influence choices through shared workflow/App field contracts", () => {
    const field = appFieldSchema.parse({
      kind: "style_influence",
      source: "system",
      defaultValue: "strong",
    });
    expect(fieldChoices(field).map(x => x.id)).toEqual([
      "subtle",
      "balanced",
      "strong",
    ]);
    expect(
      fieldChoices(field).find(x => x.id === "strong")?.direction
    ).toContain("STYLE PRIORITY");
    expect(fieldValueProblem(field, "strong")).toBeNull();
    expect(fieldPrompt(field, "strong")).toContain("STYLE PRIORITY");
    expect(fieldValueProblem(field, "100%")).not.toBeNull();
  });
});
