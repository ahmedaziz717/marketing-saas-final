import { expect, it } from "vitest";
import { newConfiguration, readConfiguration, modelCompatibility, imageReferenceCount, videoWithModel } from "../shared/creativeConfigurator";
import { generationModels, generationModel, DEFAULT_IMAGE_MODEL, type ModelDefinition } from "../shared/modelCatalog";

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
  expect(readConfiguration(JSON.stringify({ ...config, kind: "audio" }))).toBeNull();
});
it("counts image references using the server's per-output grouping", () => {
  const s = newConfiguration().image;
  s.products = [1,2,3].map(id => ({ productId:id, imageId:id, featuredSpecKeys:[], includePrice:false }));
  s.logoAssetId = 1;
  s.referenceAssetIds = [10,11];
  expect(imageReferenceCount(s)).toBe(4);
  s.productMode = "together";
  expect(imageReferenceCount(s)).toBe(6);
  s.promotionMode = "platform";
  expect(imageReferenceCount(s)).toBe(3);
});
it("explains compatibility without silently discarding sources", () => {
  const model = generationModel(DEFAULT_IMAGE_MODEL)!;
  expect(modelCompatibility(model, 17, false)).toMatch(/16 image references/);
  expect(modelCompatibility(model, 1, true)).toMatch(/does not accept a source video/);
  expect(modelCompatibility(model, 1, false)).toBeNull();
  const audio: ModelDefinition = { ...model, inputSchema: { required:["audio_url"], properties:{ audio_url: {type:"string"} } } };
  expect(modelCompatibility(audio, 0, false)).toMatch(/audio or file input/);
});
it("uses each video model's defaults but keeps user sources and prompt for review", () => {
  const model = generationModels.find(m => m.kind === "video" && m.inputSchema.properties.duration?.default)!;
  const before = { ...newConfiguration().video, prompt:"Keep this prompt", imageKeys:["asset:1"], sourceVideoKey:"asset:2" };
  const after = videoWithModel(before, model);
  expect(after.prompt).toBe(before.prompt);
  expect(after.imageKeys).toEqual(before.imageKeys);
  expect(after.sourceVideoKey).toBe(before.sourceVideoKey);
  expect(after.duration).toBe(Number(model.inputSchema.properties.duration.default));
  expect(after.modelId).toBe(model.id);
});
