import { expect, it } from "vitest";
import {
  newConfiguration,
  readConfiguration,
  modelCompatibility,
  imageReferenceCount,
  videoWithModel,
  videoWithSources,
} from "../shared/creativeConfigurator";
import {
  generationModels,
  generationModel,
  DEFAULT_IMAGE_MODEL,
  type ModelDefinition,
} from "../shared/modelCatalog";
import {
  videoRequestBody,
  videoSetupProblem,
  videoSetupSchema,
  videoImageReferenceKeys,
  videoReferenceCount,
  videoPrompt,
} from "../shared/videoCreation";

it("uses text generation with zero references and retains multiple inputs and settings when changing Seedance input modes", () => {
  const text = {
    ...newConfiguration().video,
    prompt: "A slow sunrise over a quiet lake",
    duration: 8,
    modelOptions: { generate_audio: false, duration: 8 },
  };
  expect(videoSetupProblem(text)).toBeNull();
  expect(videoRequestBody(text, [])).not.toHaveProperty("image_urls");
  const images = Array.from({ length: 12 }, (_, i) => `asset:${i + 1}`);
  const withImages = videoWithSources({ ...text, imageKeys: images });
  expect(withImages.modelId).toMatch(/reference-to-video$/);
  expect(withImages.duration).toBe(8);
  expect(videoSetupSchema.safeParse(withImages).success).toBe(true);
  expect(videoSetupProblem(withImages)).toBeNull();
  expect(videoRequestBody(withImages, images).image_urls).toEqual(images);
  expect(videoWithSources({ ...withImages, imageKeys: [] }).modelId).toMatch(
    /text-to-video$/
  );
  expect(videoWithSources({ ...withImages, mode: "edit" }).modelId).toBe(
    withImages.modelId
  );
  expect(videoSetupProblem({ ...text, prompt: "" })).toContain("Describe");
});

it("restores independent image/video settings and rejects corrupt browser state", () => {
  const config = newConfiguration();
  config.image.copy.headline = "Image headline";
  config.video.prompt = "Video camera direction";
  config.kind = "video";
  const restored = readConfiguration(JSON.stringify(config))!;
  expect(restored.kind).toBe("video");
  expect(restored.image.copy.headline).toBe("Image headline");
  expect(restored.video.prompt).toBe("Video camera direction");
  expect(readConfiguration('{"version":8}')).toBeNull();
  expect(readConfiguration("corrupt")).toBeNull();
  expect(
    readConfiguration(JSON.stringify({ ...config, kind: "audio" }))
  ).toBeNull();
});
it("retains video branding separately, counts it once, and selects an image-capable route", () => {
  const config = newConfiguration();
  config.video = videoWithSources({
    ...config.video,
    logoAssetId: 7,
    prompt: "A sunrise over a quiet lake",
  });
  expect(config.video.modelId).toMatch(/reference-to-video$/);
  expect(videoReferenceCount(config.video)).toBe(1);
  expect(videoSetupProblem(config.video)).toBeNull();
  const restored = readConfiguration(JSON.stringify(config))!;
  expect(restored.video.logoAssetId).toBe(7);
  expect(restored.image.logoAssetId).toBeNull();
  const mixed = {
    ...restored.video,
    category: "ugc" as const,
    imageKeys: ["asset:7", "product_image:2"],
    people: [{ kind: "library" as const, id: "female-black-0" }],
  };
  expect(videoImageReferenceKeys(mixed)).toEqual([
    "product_image:2",
    "asset:7",
  ]);
  expect(videoReferenceCount(mixed)).toBe(3);
  expect(videoPrompt(mixed)).toContain("Image 2 is the selected brand logo");
  expect(videoPrompt(mixed)).toContain("LAST 1 reference images");
  expect(
    videoWithSources({ ...config.video, logoAssetId: null }).modelId
  ).toMatch(/text-to-video$/);
  expect(
    videoSetupProblem({
      ...config.video,
      imageKeys: Array.from({ length: 30 }, (_, i) => `asset:${i + 100}`),
    })
  ).toContain("30 total");
});
it("counts image references using the server's per-output grouping", () => {
  const s = newConfiguration().image;
  s.products = [1, 2, 3].map(id => ({
    productId: id,
    imageId: id,
    featuredSpecKeys: [],
    includePrice: false,
  }));
  s.logoAssetId = 1;
  s.referenceAssetIds = [10, 11];
  expect(imageReferenceCount(s)).toBe(4);
  s.productMode = "together";
  expect(imageReferenceCount(s)).toBe(6);
  s.promotionMode = "platform";
  expect(imageReferenceCount(s)).toBe(3);
});
it("explains compatibility without silently discarding sources", () => {
  const model = generationModel(DEFAULT_IMAGE_MODEL)!;
  expect(modelCompatibility(model, 17, false)).toMatch(/16 image references/);
  expect(modelCompatibility(model, 1, true)).toMatch(
    /does not accept a source video/
  );
  expect(modelCompatibility(model, 1, false)).toBeNull();
  const audio: ModelDefinition = {
    ...model,
    inputSchema: {
      required: ["audio_url"],
      properties: { audio_url: { type: "string" } },
    },
  };
  expect(modelCompatibility(audio, 0, false)).toMatch(/audio or file input/);
});
it("uses each video model's defaults but keeps user sources and prompt for review", () => {
  const model = generationModels.find(
    m => m.kind === "video" && m.inputSchema.properties.duration?.default
  )!;
  const before = {
    ...newConfiguration().video,
    prompt: "Keep this prompt",
    imageKeys: ["asset:1"],
    sourceVideoKey: "asset:2",
  };
  const after = videoWithModel(before, model);
  expect(after.prompt).toBe(before.prompt);
  expect(after.imageKeys).toEqual(before.imageKeys);
  expect(after.sourceVideoKey).toBe(before.sourceVideoKey);
  expect(after.duration).toBe(
    Number(model.inputSchema.properties.duration.default)
  );
  expect(after.modelId).toBe(model.id);
});

it("distinguishes extending a video from creating one from photos without changing the selected model", () => {
  const extend = generationModel(
    "higgsfield:bytedance/seedance-2.5/video-extend"
  )!;
  expect(modelCompatibility(extend, 2, false)).toMatch(/existing source video/);
  expect(modelCompatibility(extend, 2, true)).toBeNull();
});
