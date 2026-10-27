import { describe, expect, it } from "vitest";
import {
  DEFAULT_VIDEO_MODEL,
  generationModel,
  modelRequestBody,
  referenceCapacity,
} from "../shared/modelCatalog";
import {
  defaultWorkflowModel,
  workflowModel,
} from "../shared/workflowModelCatalog";

const firstLast = generationModel(
  "higgsfield:bytedance/seedance-2.5/image-to-video"
)!;
const references = generationModel(DEFAULT_VIDEO_MODEL)!;
const urls = Array.from(
  { length: 6 },
  (_, i) => `https://example.com/image-${i}.png`
);
describe("Seedance role labels without endpoint conversion", () => {
  it("distinguishes first/last frames from optional-video multi-reference input", () => {
    expect(firstLast.variant).toBe("First / last frame · 1–2 images");
    expect(references.variant).toBe(
      "Multiple reference images · up to 30 · video optional"
    );
    expect(referenceCapacity(firstLast)).toBe(2);
    expect(referenceCapacity(references)).toBe(30);
  });
  it("maps first and last frames exactly and rejects six instead of dropping them", () => {
    const body = modelRequestBody(firstLast, {
      prompt: "Animate",
      images: urls.slice(0, 2),
      options: { duration: 5 },
    });
    expect(body.image_url).toBe(urls[0]);
    expect(body.end_image_url).toBe(urls[1]);
    expect(body.image_urls).toBeUndefined();
    expect(() =>
      modelRequestBody(firstLast, {
        prompt: "Animate",
        images: urls,
        options: { duration: 5 },
      })
    ).toThrow(/supports 2/);
  });
  it.each([6, 8, 10])(
    "preserves all %s ordered references at five seconds without requiring video",
    count => {
      const images = Array.from(
        { length: count },
        (_, i) => `https://example.com/${i}.png`
      );
      const body = modelRequestBody(references, {
        prompt: "Animate",
        images,
        options: { duration: 5 },
      });
      expect(body.image_urls).toEqual(images);
      expect(body.duration).toBe(5);
      expect(body.video_urls).toBeUndefined();
    }
  );
  it("keeps the saved/default App model ID and shared workflow label intact", () => {
    expect(DEFAULT_VIDEO_MODEL).toBe(
      "higgsfield:bytedance/seedance-2.5/reference-to-video"
    );
    expect(defaultWorkflowModel("video")).toBe(DEFAULT_VIDEO_MODEL);
    expect(workflowModel(DEFAULT_VIDEO_MODEL)?.variant).toBe(
      references.variant
    );
  });
});
