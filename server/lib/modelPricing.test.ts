import { expect, it } from "vitest";
import {
  defaultCreditPolicy,
  retailCredits,
  estimatedActionCredits,
} from "../../shared/aiCredits";
import {
  generationModel,
  modelDefaults,
  modelRequestBody,
  generationModels,
} from "../../shared/modelCatalog";
import {
  defaultVideoSetup,
  videoRequestBody,
  videoModelOptions,
} from "../../shared/videoCreation";
import {
  configuredModelRate,
  defaultModelRate,
  compatibleRoutes,
} from "./modelCatalog";
import { videoQuote } from "./videoPricing";
import {
  newWorkflowNode,
  workflowRunProblem,
} from "../../shared/creativeWorkflow";

it("applies 100% markup, rounds once per action, and allows policy overrides", () => {
  expect(retailCredits(200000, defaultCreditPolicy)).toBe(40);
  expect(retailCredits(3200, defaultCreditPolicy)).toBe(1);
  expect(
    retailCredits(200000, { markupPercent: 50, creditValueMicros: 10000 })
  ).toBe(30);
  expect(
    retailCredits(200000, { markupPercent: 100, creditValueMicros: 20000 })
  ).toBe(20);
  expect(() => retailCredits(NaN, defaultCreditPolicy)).toThrow();
});
it("uses the model's configuration rate and preserves an explicit provider override", () => {
  const m = generationModel("higgsfield:higgsfield-ai/soul/v2/standard")!;
  const rate = { ...defaultModelRate(m), ...defaultCreditPolicy };
  expect(
    configuredModelRate(m, rate, { resolution: "1080p" }).perRequestUsd
  ).toBe(0.0057);
  expect(
    estimatedActionCredits(
      configuredModelRate(m, rate, { resolution: "1080p" })
    )
  ).toBe(2);
  expect(
    configuredModelRate(m, { ...rate, perRequestUsd: 0.1 }).perRequestUsd
  ).toBe(0.1);
});
it("distinguishes a per-output-second rate from Seedance input/output token pricing", () => {
  const kling = generationModel(
    "higgsfield:kling-video/v3.0/pro/text-to-video"
  )!;
  const setup = {
    ...defaultVideoSetup,
    modelId: kling.id,
    prompt: "A camera pan",
    duration: 5,
    modelOptions: modelDefaults(kling),
  };
  const rate = configuredModelRate(kling, {
    ...defaultModelRate(kling),
    ...defaultCreditPolicy,
  });
  expect(videoQuote(setup, [], rate)).toMatchObject({
    costMicros: 840000,
    credits: 168,
    videoTokens: null,
  });
  expect(
    videoQuote(setup, [], rate, {
      durationSeconds: 6,
      width: 1280,
      height: 720,
    }).credits
  ).toBe(202);
  const seedance = generationModel(
    "higgsfield:bytedance/seedance-2.0/text-to-video"
  )!;
  const fourK = configuredModelRate(
    seedance,
    { ...defaultModelRate(seedance), ...defaultCreditPolicy },
    { resolution: "4k" }
  );
  expect(fourK.outputPerMillion).toBe(8);
  expect(
    videoQuote({ ...setup, modelId: seedance.id, resolution: "4k" }, [], fourK)
  ).toMatchObject({ costMicros: 7776000, credits: 1556 });
});
it("preserves sound-off and sends only fields belonging to the selected endpoint", () => {
  const m = generationModel("higgsfield:kling-video/v3.0/pro/text-to-video")!;
  const setup = {
    ...defaultVideoSetup,
    modelId: m.id,
    modelOptions: { ...modelDefaults(m), sound: "off" },
    prompt: "Studio lighting",
  };
  const body = videoRequestBody(setup, []);
  expect(body).toMatchObject({
    sound: "off",
    duration: 5,
    prompt: expect.any(String),
  });
  expect(body).not.toHaveProperty("resolution");
  expect(videoModelOptions(setup).sound).toBe("off");
});
it("rejects incompatible references, arbitrary URL settings, and invalid enum values before submission", () => {
  const text = generationModel("higgsfield:recraft/v4.1/text-to-image")!;
  expect(() =>
    modelRequestBody(text, {
      prompt: "A photo",
      images: ["https://stored.example/photo"],
      options: {},
    })
  ).toThrow(/reference images/);
  expect(() =>
    modelRequestBody(text, {
      prompt: "A photo",
      images: [],
      options: { image_url: "https://untrusted.example" },
    })
  ).toThrow();
  expect(() =>
    modelRequestBody(text, {
      prompt: "A photo",
      images: [],
      options: { aspect_ratio: "oops" },
    })
  ).toThrow();
  const image = generationModel("higgsfield:alibaba/qwen-image-3/edit")!;
  expect(() =>
    modelRequestBody(image, {
      prompt: "Change the light",
      images: [],
      options: {},
    })
  ).toThrow(/requires image/);
  expect(
    modelRequestBody(image, {
      prompt: "Change the light",
      images: ["https://stored.example/photo"],
      options: {},
    })
  ).toMatchObject({ image_urls: ["https://stored.example/photo"] });
});
it("contains unique catalog entries and only permits known routes for the same model", () => {
  expect(new Set(generationModels.map(m => m.id)).size).toBe(
    generationModels.length
  );
  expect(compatibleRoutes("openai:gpt-image-2.5-sunburst")).toContain(
    "higgsfield:marketing-studio/image/sunburst"
  );
  expect(compatibleRoutes("openai:gpt-image-2.5-sunburst")).not.toContain(
    "openai:gpt-image-2.5-flare"
  );
});

it("blocks incompatible workflow inputs before running upstream generation", () => {
  const photo = newWorkflowNode("image", "photo");
  photo.config.imageKey = "asset:1";
  const generated = newWorkflowNode("generate_image", "generated");
  generated.config.modelId = "higgsfield:recraft/v4.1/text-to-image";
  generated.config.text = "A studio scene";
  const graph = {
    nodes: [photo, generated],
    edges: [
      { id: "reference", source: "photo", target: "generated", port: "image" },
    ],
  };
  expect(workflowRunProblem(graph)).toMatch(/supports 0 reference images/);
  generated.config.modelId = "higgsfield:alibaba/qwen-image-3/edit";
  expect(workflowRunProblem({ ...graph, edges: [] })).toMatch(
    /Connect a reference image/
  );
  expect(workflowRunProblem(graph)).toBeNull();
  const videoModel = generationModels.find(
    m => m.kind === "video" && m.inputSchema.required?.includes("video_url")
  )!;
  const video = newWorkflowNode("generate_video", "video");
  video.config.modelId = videoModel.id;
  video.config.text = "A studio scene";
  const videoGraph = {
    nodes: [photo, video],
    edges: [
      { id: "reference", source: "photo", target: "video", port: "image" },
    ],
  };
  expect(workflowRunProblem(videoGraph)).toMatch(/source video/);
});

it("maps every priced catalog endpoint's required image/video inputs without inventing URL fields", () => {
  for (const model of generationModels.filter(
    m => m.provider === "higgsfield" && m.costRules.length
  )) {
    const required = model.inputSchema.required ?? [];
    const hasRequiredImage = required.some(k =>
      ["image_url", "image_urls", "first_frame_url"].includes(k)
    );
    const images = hasRequiredImage ? ["https://stored.example/photo.png"] : [];
    const video = required.some(k => ["video_url", "video_urls"].includes(k))
      ? "https://stored.example/video.mp4"
      : undefined;
    expect(
      () =>
        modelRequestBody(model, {
          prompt: "A simple studio scene",
          images,
          video,
          options: modelDefaults(model),
        }),
      model.id
    ).not.toThrow();
  }
});
