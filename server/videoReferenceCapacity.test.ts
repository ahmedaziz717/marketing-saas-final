import { beforeEach, expect, it, vi } from "vitest";
const calls = vi.hoisted(() => ({ sign: vi.fn() }));
vi.mock("./storage", () => ({
  storageClient: () => ({
    storage: { from: () => ({ createSignedUrl: calls.sign }) },
  }),
  assetBucket: () => "test",
  normalizeStorageKey: (key: string) => key,
}));
vi.mock("./lib/promptRegistry", () => ({
  visualDirectionDefaults: async () => ({}),
  applicationPromptForRun: async () => ({ value: "Preserve references." }),
}));
import { generationModel, imageReferenceBudget } from "../shared/modelCatalog";
import {
  defaultVideoSetup,
  videoImageSelectionBudget,
  videoSetupProblem,
} from "../shared/videoCreation";
import { prepareVideoRequest } from "./lib/videoRequest";
import {
  newWorkflowNode,
  workflowRunProblem,
  workflowNodeImageKeys,
} from "../shared/creativeWorkflow";
import { parseWorkflowMediaSelection } from "../shared/workflowInputs";
const seedance = "higgsfield:bytedance/seedance-2.5/reference-to-video";
const genjutsu = "higgsfield:higgsfield/genjutsu/motion-transfer/v1.0";
const keys = (n: number) =>
  Array.from({ length: n }, (_, i) => `product_image:${i + 1}`);
const setup = (n: number) => ({
  ...defaultVideoSetup,
  modelId: seedance,
  prompt: "Show the supplied views.",
  imageKeys: keys(n),
  modelOptions: { duration: 10, resolution: "720p", aspect_ratio: "16:9" },
});
beforeEach(() =>
  calls.sign
    .mockReset()
    .mockImplementation(async (key: string) => ({
      data: { signedUrl: `https://stored.test/${key}` },
      error: null,
    }))
);
it.each([1, 8, 9, 10])(
  "preserves all %i ordered views through quote/submission request",
  async n => {
    const input = setup(n);
    expect(videoSetupProblem(input)).toBeNull();
    const refs = input.imageKeys.map((key, i) => ({
      key,
      storageKey: `org-3/photo-${i}.png`,
      name: key,
      fingerprint: `hash${i}`,
      mediaType: "image",
    }));
    const body = await prepareVideoRequest(3, input, refs as any);
    expect(body.image_urls).toEqual(
      refs.map(r => `https://stored.test/${r.storageKey}`)
    );
    expect(calls.sign.mock.calls.map(a => a[0])).toEqual(
      refs.map(r => r.storageKey)
    );
    expect(
      parseWorkflowMediaSelection(
        JSON.stringify({
          productId: 7,
          imageKey: keys(n)[0],
          imageKeys: keys(n),
        }),
        "product"
      )?.imageKeys
    ).toEqual(keys(n));
  }
);
it("rejects overflow, duplicate, non-product arrays and retains numeric/primary legacy inputs", () => {
  expect(parseWorkflowMediaSelection("7", "product")?.productId).toBe(7);
  expect(
    parseWorkflowMediaSelection("product_image:1", "asset")?.imageKey
  ).toBe("product_image:1");
  for (const imageKeys of [keys(11), ["product_image:1", "product_image:1"]])
    expect(
      parseWorkflowMediaSelection(
        JSON.stringify({ productId: 7, imageKeys }),
        "product"
      )
    ).toBeUndefined();
  expect(
    parseWorkflowMediaSelection(
      JSON.stringify({ productId: 7, imageKeys: keys(2) }),
      "asset"
    )
  ).toBeUndefined();
});
it("reserves people/logo slots without counting a selected logo twice", () => {
  const model = generationModel(
    "higgsfield:alibaba/wan-3.0-prime/reference-to-video"
  )!;
  expect(imageReferenceBudget(model, 2)).toEqual({
    total: 10,
    reserved: 2,
    available: 8,
  });
  const input = {
    ...setup(8),
    modelId: model.id,
    logoAssetId: 90,
    people: [{ kind: "asset" as const, assetId: 91 }],
  };
  expect(videoImageSelectionBudget(input)).toMatchObject({
    available: 8,
    reserved: 2,
  });
  expect(
    videoImageSelectionBudget({
      ...input,
      imageKeys: [...input.imageKeys, "asset:90"],
    })
  ).toMatchObject({ available: 9, reserved: 1 });
  expect(videoSetupProblem({ ...input, imageKeys: keys(9) })).toMatch(
    /8 selected images/
  );
});
it("rejects ten views on eight-capacity model before signing or credits, including pass-through graph", () => {
  expect(
    videoSetupProblem({
      ...setup(10),
      modelId: genjutsu,
      sourceVideoKey: "asset:99",
    })
  ).toMatch(/8 selected images/);
  const product = newWorkflowNode("app_input", "product");
  product.config.imageKeys = keys(10);
  product.config.imageKey = keys(10)[0];
  const review = newWorkflowNode("review", "review");
  const video = newWorkflowNode("generate_video", "video");
  video.config.modelId = genjutsu;
  video.config.sourceVideoKey = "asset:99";
  video.config.text = "Animate.";
  const graph = {
    nodes: [product, review, video],
    edges: [
      { id: "a", source: "product", target: "review", port: "context" },
      { id: "b", source: "review", target: "video", port: "image" },
    ],
  };
  expect(workflowRunProblem(graph)).toMatch(/8 total reference images/);
  video.config.modelId = seedance;
  video.config.sourceVideoKey = null;
  expect(workflowRunProblem(graph)).toBeNull();
  expect(workflowNodeImageKeys(product)).toEqual(keys(10));
  expect(calls.sign).not.toHaveBeenCalled();
});
