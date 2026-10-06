import { expect, it } from "vitest";
import {
  defaultCreditPolicy,
  retailCredits,
  estimatedActionCredits,
  actionPriceBreakdown,
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
  defaultModelActionQuote,
  adminModelActionQuote,
} from "./modelCatalog";
import {
  defaultImageActionAssumptions,
  estimateOpenAIImageAction,
} from "../../shared/imageActionEstimate";
import { videoQuote } from "./videoPricing";
import {
  newWorkflowNode,
  workflowRunProblem,
} from "../../shared/creativeWorkflow";

it("prices each OpenAI comparison from its own rates and output estimate instead of the shared credit reservation", () => {
  const examples = [
    ["gpt-image-2.5-sunburst", 5, 8, 30, 18170],
    ["gpt-image-2.5-flare", 5, 8, 30, 18170],
    ["gpt-image-2", 5, 8, 30, 57680],
    ["gpt-image-1.5", 5, 8, 32, 38792],
    ["gpt-image-1", 5, 10, 40, 47240],
    ["gpt-image-1-mini", 2, 2.5, 8, 13000],
  ] as const;
  for (const [id, text, inputImage, outputImage, costMicros] of examples) {
    const model = generationModel(`openai:${id}`)!;
    const rate = {
      ...defaultModelRate(model),
      ...defaultCreditPolicy,
      inputPerMillion: text,
      imageInputPerMillion: inputImage,
      imageOutputPerMillion: outputImage,
      estimatedCostMicros: 200000,
    };
    const comparison = adminModelActionQuote(model, rate);
    expect(comparison).toMatchObject({
      costMicros,
      basis: "Token-based comparison",
    });
    expect(defaultModelActionQuote(model, rate).costMicros).toBe(200000);
    expect(
      adminModelActionQuote(model, { ...rate, estimatedCostMicros: 500000 })
        .costMicros
    ).toBe(costMicros);
    expect(
      adminModelActionQuote(model, { ...rate, perRequestUsd: 0.1 })
    ).toMatchObject({
      costMicros: 100000,
      credits: 20,
      basis: "Per-request provider rate",
      calculation: null,
    });
    expect(
      estimateOpenAIImageAction(rate, {
        ...defaultImageActionAssumptions,
        imageInputTokens: 1000,
      }).costMicros
    ).toBe(costMicros + 1000 * inputImage);
    expect(
      estimateOpenAIImageAction({
        ...rate,
        imageOutputPerMillion: outputImage * 2,
      }).costMicros
    ).toBe(costMicros * 2 - 1000 * text);
  }
});

it("uses the exact model's documented quality and dimension calculation and marks Mini's approximation", () => {
  const model = generationModel("openai:gpt-image-2.5-sunburst")!;
  const rate = defaultModelRate(model);
  const profile = { ...defaultImageActionAssumptions, textInputTokens: 0 };
  expect(
    estimateOpenAIImageAction(rate, { ...profile, quality: "low" })
  ).toMatchObject({ outputTokens: 196, costMicros: 5880 });
  expect(
    estimateOpenAIImageAction(rate, { ...profile, quality: "high" })
  ).toMatchObject({ outputTokens: 1756, costMicros: 52680 });
  expect(
    estimateOpenAIImageAction(rate, { ...profile, size: "1536x1024" })
  ).toMatchObject({ outputTokens: 343, costMicros: 10290 });
  const legacy = { ...rate, model: "gpt-image-1", imageOutputPerMillion: 40 };
  expect(
    estimateOpenAIImageAction(legacy, { ...profile, size: "1024x1536" })
      .outputTokens
  ).toBe(1584);
  expect(
    estimateOpenAIImageAction(legacy, { ...profile, size: "1536x1024" })
      .outputTokens
  ).toBe(1568);
  expect(
    estimateOpenAIImageAction({
      ...legacy,
      model: "gpt-image-1-mini",
      imageOutputPerMillion: 8,
    })
  ).toMatchObject({
    approximateOutputTokens: true,
    source: expect.stringContaining("Mini"),
  });
  expect(() =>
    estimateOpenAIImageAction(rate, { ...profile, size: "auto" } as any)
  ).toThrow();
  expect(() =>
    estimateOpenAIImageAction(rate, { ...profile, textInputTokens: -1 })
  ).toThrow();
  expect(() =>
    estimateOpenAIImageAction({ ...rate, imageOutputPerMillion: null }, profile)
  ).toThrow(/pricing/);
  expect(() =>
    estimateOpenAIImageAction(
      { ...rate, imageInputPerMillion: null },
      { ...profile, imageInputTokens: 10 }
    )
  ).toThrow(/pricing/);
  expect(
    estimateOpenAIImageAction({ ...rate, imageInputPerMillion: null }, profile)
      .costMicros
  ).toBe(13170);
});

it("shows wholesale credit equivalents without rounding before markup, and discloses the rounded retail dollar amount", () => {
  expect(actionPriceBreakdown(5700, defaultCreditPolicy)).toEqual({
    providerUsd: 0.0057,
    providerCredits: 0.57,
    retailUsd: 0.0114,
    retailCredits: 2,
    chargedUsd: 0.02,
  });
  expect(
    actionPriceBreakdown(200000, {
      markupPercent: 50,
      creditValueMicros: 20000,
    })
  ).toEqual({
    providerUsd: 0.2,
    providerCredits: 10,
    retailUsd: 0.3,
    retailCredits: 15,
    chargedUsd: 0.3,
  });
  expect(actionPriceBreakdown(0, defaultCreditPolicy).retailCredits).toBe(0);
  expect(() =>
    actionPriceBreakdown(5000, { ...defaultCreditPolicy, creditValueMicros: 0 })
  ).toThrow();
});

it("quotes a whole default video, preserves provider overrides, and labels configured image estimates", () => {
  const kling = generationModel(
    "higgsfield:kling-video/v3.0/pro/text-to-video"
  )!;
  const rate = { ...defaultModelRate(kling), ...defaultCreditPolicy };
  expect(defaultModelActionQuote(kling, rate)).toMatchObject({
    costMicros: 840000,
    credits: 168,
    settings: expect.stringContaining("5s video"),
  });
  expect(
    defaultModelActionQuote(kling, { ...rate, perSecondUsd: 0.1 })
  ).toMatchObject({ costMicros: 500000, credits: 100 });
  expect(
    defaultModelActionQuote(kling, { ...rate, perRequestUsd: 0.3 })
  ).toMatchObject({ costMicros: 300000, credits: 60 });
  const image = generationModel("openai:gpt-image-2")!;
  expect(
    defaultModelActionQuote(image, {
      ...defaultModelRate(image),
      ...defaultCreditPolicy,
    })
  ).toMatchObject({
    costMicros: 200000,
    credits: 40,
    basis: "Configured estimate",
    settings: "1 image · quality: medium",
  });
});

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
