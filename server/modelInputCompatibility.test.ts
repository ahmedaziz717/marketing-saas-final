import { describe, expect, it } from "vitest";
import { generationModel } from "../shared/modelCatalog";
import {
  modelInputCompatibility as assess,
  modelInputGuidance,
} from "../shared/modelInputCompatibility";
const model = (route: string) =>
  generationModel(`higgsfield:bytedance/seedance-2.5/${route}`)!;
describe("shared known-input compatibility", () => {
  it.each([1, 2, 6, 10])(
    "checks %s images without treating first/end as arbitrary references",
    images => {
      expect(assess(model("image-to-video"), { images, hasVideo: false })).toBe(
        images > 2
          ? `Accepts up to 2 images; ${images} selected (including logos and people). Remove images or choose another model.`
          : null
      );
      expect(
        assess(model("reference-to-video"), { images, hasVideo: false })
      ).toBeNull();
      expect(
        assess(model("video-extend"), { images, hasVideo: false })
      ).toMatch(/Requires an existing source video/);
    }
  );
  it("explains wrong inputs and supports removing them without changing model", () => {
    expect(
      assess(model("text-to-video"), { images: 1, hasVideo: false })
    ).toMatch(/Does not accept images/);
    expect(
      assess(model("image-to-video"), { images: 1, hasVideo: true })
    ).toMatch(/Does not accept a source video/);
    expect(
      assess(model("image-to-video"), { images: 1, hasVideo: false })
    ).toBeNull();
    expect(
      assess(model("video-extend"), { images: 1, hasVideo: true })
    ).toBeNull();
    expect(
      assess(model("image-to-video"), { images: 1, hasVideo: false, audio: 1 })
    ).toMatch(/Does not accept audio/);
  });
  it("allows empty discovery but enforces missing inputs for readiness", () => {
    expect(
      assess(
        model("video-extend"),
        { images: 0, hasVideo: false },
        { discovery: true }
      )
    ).toBeNull();
    expect(
      assess(model("video-extend"), { images: 0, hasVideo: false })
    ).toMatch(/Requires an existing/);
    expect(
      assess(model("image-to-video"), { images: 0, hasVideo: false })
    ).toMatch(/Requires an image/);
  });
  it("does not mistake unknown dynamic bindings for known missing inputs", () => {
    expect(
      assess(model("video-extend"), { images: null, hasVideo: null })
    ).toBeNull();
    expect(
      assess(model("image-to-video"), { images: null, hasVideo: false })
    ).toBeNull();
    expect(
      assess(model("image-to-video"), { images: 6, hasVideo: null })
    ).toMatch(/6 selected/);
  });
  it("rejects a known lower bound even when other workflow images are unresolved", () => {
    expect(
      assess(model("image-to-video"), {
        images: null,
        minimumImages: 6,
        hasVideo: null,
      })
    ).toMatch(/at least 6 selected/);
    expect(
      assess(model("reference-to-video"), {
        images: null,
        minimumImages: 6,
        hasVideo: null,
      })
    ).toBeNull();
  });
  it("keeps compact roles with concrete requirements separate", () => {
    expect(model("video-extend").variant).toBe("Extend an existing video");
    expect(modelInputGuidance(model("image-to-video"))).toBe(
      "1 start image · optional end image"
    );
    expect(modelInputGuidance(model("reference-to-video"))).toContain(
      "30 image references · source video optional"
    );
  });
});
