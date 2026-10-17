// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  generationModel,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
} from "@shared/modelCatalog";
import { newConfiguration } from "@shared/creativeConfigurator";
const api = vi.hoisted(() => ({
  save: vi.fn(),
  generate: vi.fn(),
  videoSave: vi.fn(),
  videoGenerate: vi.fn(),
  role: "owner",
  org: 1,
  route: vi.fn(),
  drafts: [] as any[],
  history: [] as any[],
  job: undefined as any,
  assets: [] as any[],
  approveLogo: vi.fn(),
  reviewLogo: vi.fn(),
  submitLogo: vi.fn(),
  refreshCopy: vi.fn(),
  draftPrompt: vi.fn(),
  videoJob: undefined as any,
  search: "",
  cancelVideo: vi.fn(),
  checkVideo: vi.fn(),
}));
vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspace: () => ({
    organizationId: api.org,
    membership: { role: api.role },
  }),
}));
vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: 10 } }),
}));
vi.mock("@/components/WorkspaceGate", () => ({
  WorkspaceGate: ({ children }: any) => children,
}));
vi.mock("@/components/LifestylePersonPicker", () => ({
  PersonPortrait: ({ person }: any) => (
    <div role="img" aria-label={person.name} />
  ),
}));
vi.mock("@/components/VideoReferencePicker", () => ({
  VideoReferencePicker: () => null,
}));
vi.mock("@/components/AssetUploadDialog", () => ({
  AssetUploadDialog: () => null,
}));
vi.mock("@/components/ModelPicker", () => ({
  ModelSettings: () => <div>Supported model settings</div>,
}));
vi.mock("@/components/ActionCredits", () => ({
  ActionCredits: () => <span>2 credits</span>,
}));
vi.mock("wouter", () => ({
  useLocation: () => ["/app/creatives/configurator", api.route],
  useSearch: () => api.search,
  Link: ({ children, href }: any) => <a href={href}>{children}</a>,
}));
vi.mock("@/components/LogoSourceTools", () => ({
  LogoSourceTools: () => <div>Logo import tools</div>,
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      creativeBuilder: { options: { invalidate: vi.fn() } },
      video: {
        get: { invalidate: vi.fn() },
        list: { invalidate: vi.fn() },
        catalogImages: { invalidate: vi.fn() },
      },
      assetLibrary: {
        studioList: { invalidate: vi.fn() },
        list: { invalidate: vi.fn() },
      },
      models: { credits: { invalidate: vi.fn() } },
    }),
    creativeBuilder: {
      studioJob: { useQuery: () => ({ data: api.job }) },
      studioHistory: {
        useQuery: () => ({ data: api.history, refetch: vi.fn() }),
      },
      people: { useQuery: () => ({ data: [] }) },
      options: {
        useQuery: () => ({
          data: {
            brand: {
              name: "Example",
              status: "active",
              businessProfile: { model: "products", summary: "Brand story" },
            },
            products: [
              {
                id: 1,
                name: "Studio lamp",
                recordType: "product",
                images: [{ id: 2, url: "/lamp.png" }],
              },
            ],
            logos: [],
            references: [],
            drafts: api.drafts,
          },
        }),
      },
      save: { useMutation: () => ({ mutateAsync: api.save }) },
      generate: { useMutation: () => ({ mutateAsync: api.generate }) },
      refreshCopy: { useMutation: () => ({ mutateAsync: api.refreshCopy }) },
      quote: {
        useQuery: () => ({ data: { credits: 174 }, isFetching: false }),
      },
    },
    models: {
      studioEstimate: {
        useQuery: () => ({
          data: { credits: 31, assumptions: "Estimate for selected settings" },
        }),
      },
      studioCatalog: {
        useQuery: () => ({
          data: [
            DEFAULT_IMAGE_MODEL,
            "openai:gpt-image-2.5-flare",
            "openai:gpt-image-2",
            "openai:gpt-image-1",
            DEFAULT_VIDEO_MODEL,
            "higgsfield:bytedance/seedance-2.5/text-to-video",
          ].map(id => ({
            ...generationModel(id),
            routeId: id,
            available: true,
            enabled: true,
            direct: true,
            estimatedCredits: 174,
            estimatedSeconds: 5,
          })),
        }),
      },
    },
    assetLibrary: {
      studioList: { useQuery: () => ({ data: api.assets }) },
      approveAndAdd: { useMutation: () => ({ mutateAsync: api.approveLogo }) },
      review: { useMutation: () => ({ mutateAsync: api.reviewLogo }) },
      submit: { useMutation: () => ({ mutateAsync: api.submitLogo }) },
    },
    catalogSources: {
      previewPage: {
        useMutation: () => ({ reset: vi.fn(), mutateAsync: vi.fn() }),
      },
      previewProductPage: {
        useMutation: () => ({ reset: vi.fn(), mutateAsync: vi.fn() }),
      },
      addEntries: { useMutation: () => ({ mutateAsync: vi.fn() }) },
    },
    video: {
      get: {
        useQuery: (input: any) => ({
          data: api.videoJob?.id === input.id ? api.videoJob : undefined,
        }),
      },
      cancel: { useMutation: () => ({ mutateAsync: api.cancelVideo }) },
      checkAgain: { useMutation: () => ({ mutateAsync: api.checkVideo }) },
      catalogImages: {
        useQuery: () => ({
          data: {
            items: [
              {
                key: "product_image:2",
                name: "Studio lamp",
                detail: "Photo 1",
                url: "/lamp.png",
              },
            ],
            nextOffset: null,
          },
        }),
      },
      list: { useQuery: () => ({ data: [] }) },
      options: { useQuery: () => ({ data: { ready: true } }) },
      save: { useMutation: () => ({ mutateAsync: api.videoSave }) },
      generate: { useMutation: () => ({ mutateAsync: api.videoGenerate }) },
      draftPrompt: { useMutation: () => ({ mutateAsync: api.draftPrompt }) },
      quote: {
        useQuery: () => ({ data: { credits: 200 }, isFetching: false }),
      },
    },
  },
}));
import CreativeConfiguratorPage from "./CreativeConfiguratorPage";
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  api.role = "owner";
  api.org = 1;
  api.drafts = [];
  api.history = [];
  api.job = undefined;
  api.videoJob = undefined;
  api.search = "";
  api.assets = [];
  api.approveLogo.mockReset().mockResolvedValue({ success: true });
  api.reviewLogo.mockReset().mockResolvedValue({ success: true });
  api.submitLogo.mockReset().mockResolvedValue({ success: true });
  api.save.mockResolvedValue({ briefId: 1, updatedAtMs: 123 });
  api.generate.mockResolvedValue({ status: "queued", jobId: 12 });
  api.videoSave.mockResolvedValue({ id: "video-draft", revision: 1 });
  api.videoGenerate.mockResolvedValue({
    id: "video-draft",
    revision: 1,
    status: "queued",
  });
  api.draftPrompt.mockResolvedValue({
    prompt:
      "Open on a softly lit studio, move slowly through the scene and finish with a close-up.",
  });
  api.refreshCopy.mockResolvedValue({
    headline: "Find your homeschool style",
    subheadline: "Explore learning approaches in 12 questions.",
    cta: "Take the quiz",
  });
});
it("allows a video prompt with zero images, switches Seedance input modes with references, and keeps generation gated by the quote", async () => {
  open();
  fireEvent.click(screen.getByRole("button", { name: "Select Video" }));
  section(/Story & Sound Tell your story/);
  const draft = screen.getByRole("button", {
    name: /Generate prompt from this setup/,
  }) as HTMLButtonElement;
  expect(draft.disabled).toBe(false);
  fireEvent.click(draft);
  await waitFor(() =>
    expect(api.draftPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        setup: expect.objectContaining({
          imageKeys: [],
          modelId: "higgsfield:bytedance/seedance-2.5/text-to-video",
        }),
      })
    )
  );
  await waitFor(() =>
    expect(
      (screen.getByLabelText("Video prompt · required") as HTMLTextAreaElement)
        .value
    ).toContain("softly lit studio")
  );
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Generate video",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false)
  );
  section(/Type & Source Start with an idea/);
  fireEvent.click(screen.getByRole("button", { name: "Subject & sources" }));
  fireEvent.click(screen.getByRole("button", { name: "Select Studio lamp" }));
  expect(screen.getByText("1 image selected")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() =>
    expect(api.videoSave).toHaveBeenLastCalledWith(
      expect.objectContaining({
        setup: expect.objectContaining({
          modelId: DEFAULT_VIDEO_MODEL,
          imageKeys: ["product_image:2"],
        }),
      })
    )
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Clear image references" })
  );
  expect(screen.getByText("0 images selected")).toBeTruthy();
  expect(api.videoGenerate).not.toHaveBeenCalled();
});
it("generates copy from the saved page snapshot and shows which page is being used", async () => {
  const config = newConfiguration();
  config.image.promotionMode = "platform";
  config.image.promotion = {
    kind: "general",
    title: "Homeschool quiz",
    description: "Explore your family's style.",
    sourceUrl: "https://learn.example.test/quiz/",
    pageContent: "Answer 12 questions about your routines.",
  };
  localStorage.setItem("el-configurator-v1:10:1", JSON.stringify(config));
  open();
  section(/Story & Sound Tell your story/);
  expect(
    screen.getByText("Homeschool quiz", { selector: ".cfg-copy-source strong" })
  ).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: /Generate copy from this setup/ })
  );
  await waitFor(() =>
    expect(api.refreshCopy).toHaveBeenCalledWith({
      organizationId: 1,
      setup: config.image,
    })
  );
  await waitFor(() =>
    expect(
      (screen.getByLabelText("Headline · required") as HTMLInputElement).value
    ).toBe("Find your homeschool style")
  );
  fireEvent.click(screen.getByRole("button", { name: "Review page details" }));
  expect(
    (screen.getByLabelText("Page details") as HTMLTextAreaElement).value
  ).toContain("12 questions");
});
it("guides discovery through categories, exposes every option, and remembers visits separately for each creative type", () => {
  const view = open();
  expect(
    screen.getByRole("button", { name: /Options map 1\/15 explored/ })
  ).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Explore next: Subject & sources" })
  );
  expect(
    screen.getByRole("heading", { name: "Subject & sources" })
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Next: Brand & logo" }));
  expect(screen.getByRole("heading", { name: "Brand & logo" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Options map/ }));
  const map = within(
    screen.getByRole("region", { name: "All creative categories" })
  );
  expect(
    map.getByRole("button", { name: "Explore People" }).textContent
  ).toContain("Needs people scene");
  expect(map.queryByRole("button", { name: "Explore Audio" })).toBeNull();
  fireEvent.click(map.getByRole("button", { name: "Explore Fonts" }));
  expect(screen.getByRole("heading", { name: "Fonts" })).toBeTruthy();
  expect(
    screen
      .getByRole("button", { name: "Fonts" })
      .getAttribute("aria-description")
  ).toBe("Explored");
  expect(
    screen.getByRole("button", { name: /Options map 4\/15 explored/ })
  ).toBeTruthy();
  view.unmount();
  open();
  expect(
    screen.getByRole("button", { name: /Options map 4\/15 explored/ })
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Select Video" }));
  expect(
    screen.getByRole("button", { name: /Options map 1\/16 explored/ })
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Options map/ }));
  const videoMap = within(
    screen.getByRole("region", { name: "All creative categories" })
  );
  expect(videoMap.queryByRole("button", { name: "Explore Fonts" })).toBeNull();
  expect(videoMap.getByRole("button", { name: "Explore Audio" })).toBeTruthy();
});
it("compares at most three models and never invokes generation", () => {
  open();
  section(/AI Model Choose your engine/);
  for (const name of [
    "GPT Image 2.5 Sunburst",
    "GPT Image 2.5 Flare",
    "GPT Image 2",
    "GPT Image 1",
  ]) {
    fireEvent.click(screen.getByRole("checkbox", { name: "Compare " + name }));
  }
  expect(
    (
      screen.getByRole("checkbox", {
        name: "Compare GPT Image 1",
      }) as HTMLInputElement
    ).checked
  ).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Compare models" }));
  const dialog = within(screen.getByRole("dialog"));
  expect(dialog.getByText("Compare image models")).toBeTruthy();
  expect(
    dialog.getByRole("rowheader", { name: "Starting estimate" })
  ).toBeTruthy();
  fireEvent.click(
    dialog.getByRole("checkbox", { name: "Show differences only" })
  );
  expect(dialog.queryByRole("rowheader", { name: "Model maker" })).toBeNull();
  expect(api.generate).not.toHaveBeenCalled();
  expect(api.videoGenerate).not.toHaveBeenCalled();
});
it("duplicates a build, preserves its snapshot, highlights changes, and swaps without overwriting a cloud draft", async () => {
  open();
  fireEvent.change(screen.getByLabelText("Creative name"), {
    target: { value: "Original build" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Duplicate & compare" }));
  expect(
    (screen.getByLabelText("Creative name") as HTMLInputElement).value
  ).toBe("Original build · Alternative");
  section(/Look & Feel Make it yours/);
  fireEvent.click(
    screen.getByRole("button", { name: "Select Lifestyle · no people" })
  );
  fireEvent.click(screen.getByRole("button", { name: "Compare builds" }));
  const dialog = within(screen.getByRole("dialog"));
  expect(dialog.getByText("Original build")).toBeTruthy();
  fireEvent.click(
    dialog.getByRole("checkbox", { name: "Show differences only" })
  );
  expect(dialog.getByRole("rowheader", { name: "Scene" })).toBeTruthy();
  expect(dialog.queryByRole("rowheader", { name: "Theme" })).toBeNull();
  fireEvent.click(dialog.getByRole("button", { name: "Swap builds" }));
  expect(
    (screen.getByLabelText("Creative name") as HTMLInputElement).value
  ).toBe("Original build");
  const stored = JSON.parse(
    localStorage.getItem("el-configurator-v1:10:1:comparison")!
  );
  expect(stored.config.image.shot).toBe("lifestyle");
  expect(api.save).not.toHaveBeenCalled();
  expect(api.generate).not.toHaveBeenCalled();
});
it("exposes audio and subtitle categories only for video and does not imply subtitle support", () => {
  open();
  section(/Story & Sound Tell your story/);
  expect(screen.queryByRole("button", { name: "Subtitles" })).toBeNull();
  section(/Type & Source Start with an idea/);
  fireEvent.click(screen.getByRole("button", { name: "Select Video" }));
  section(/Story & Sound Tell your story/);
  fireEvent.click(screen.getByRole("button", { name: "Subtitles" }));
  expect(
    screen.getByText(
      /Subtitle transcription, timing and style selection are not available/
    )
  ).toBeTruthy();
  expect(api.videoGenerate).not.toHaveBeenCalled();
});
afterEach(cleanup);
function open() {
  return render(<CreativeConfiguratorPage />);
}
function section(name: RegExp) {
  fireEvent.click(screen.getByRole("button", { name }));
}
it("shows the shared brand logos in video and saves the choice without changing image branding", async () => {
  api.assets = [
    {
      key: "asset:4",
      name: "Brand wordmark",
      url: "/logo.png",
      mediaType: "image",
      sourceType: "logo",
      state: "approved",
      revision: "a".repeat(64),
    },
  ];
  const view = render(<CreativeConfiguratorPage initialKind="video" />);
  const heading = screen.getByRole("heading", { level: 1 }).textContent;
  fireEvent.click(screen.getByRole("button", { name: "Brand & logo" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Select Brand wordmark" })
  );
  fireEvent.click(screen.getByRole("button", { name: /Save draft/ }));
  await waitFor(() =>
    expect(api.videoSave).toHaveBeenCalledWith(
      expect.objectContaining({
        setup: expect.objectContaining({
          logoAssetId: 4,
          imageKeys: [],
          modelId: "higgsfield:bytedance/seedance-2.5/reference-to-video",
        }),
      })
    )
  );
  view.unmount();
  open();
  fireEvent.click(screen.getByRole("button", { name: "Brand & logo" }));
  expect(
    screen
      .getByRole("button", { name: "Select Brand wordmark" })
      .getAttribute("aria-pressed")
  ).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Creative type" }));
  fireEvent.click(screen.getByRole("button", { name: "Select Image" }));
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(heading);
  fireEvent.click(screen.getByRole("button", { name: "Brand & logo" }));
  expect(
    screen
      .getByRole("button", { name: "Select No logo" })
      .getAttribute("aria-pressed")
  ).toBe("true");
});

it("keeps video generation, playback and approval in the same Studio layout", async () => {
  const config = newConfiguration();
  config.kind = "video";
  config.video.prompt = "A slow sunrise over a mountain lake";
  localStorage.setItem("el-configurator-v1:10:1", JSON.stringify(config));
  const view = open();
  const heading = screen.getByRole("heading", { level: 1 }).textContent;
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Generate video",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false)
  );
  fireEvent.click(screen.getByRole("button", { name: "Generate video" }));
  api.videoJob = {
    id: "video-draft",
    setup: config.video,
    revision: 1,
    status: "queued",
    assetKey: null,
    createdAtMs: 1000,
    cancelRequested: false,
  };
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Confirm · 200 credits",
    })
  );
  await waitFor(() =>
    expect(screen.getByLabelText("Video generation")).toBeTruthy()
  );
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(heading);
  expect(api.route).toHaveBeenCalledWith(
    "/app/creatives/studio?video=video-draft",
    { replace: true }
  );
  expect(
    screen.getByRole("button", { name: "Request cancellation" })
  ).toBeTruthy();
  expect(
    (
      screen.getByRole("button", {
        name: "Generate video",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
  api.videoJob = { ...api.videoJob, status: "completed", assetKey: "asset:11" };
  api.assets = [
    {
      key: "asset:11",
      name: "Finished film",
      url: "/finished.mp4",
      mediaType: "video",
      sourceType: "generated",
      state: "draft",
      revision: "b".repeat(64),
    },
  ];
  view.rerender(<CreativeConfiguratorPage />);
  await waitFor(() =>
    expect(
      screen.getByLabelText("Generated video preview").getAttribute("src")
    ).toBe("/finished.mp4")
  );
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(heading);
  expect(screen.getByRole("button", { name: "Approve" })).toBeTruthy();
  expect(api.approveLogo).not.toHaveBeenCalled();
  expect(api.videoGenerate).toHaveBeenCalledTimes(1);
  fireEvent.click(
    screen.getByRole("button", { name: "Use these settings as a new draft" })
  );
  expect(
    (screen.getByLabelText("Creative name") as HTMLInputElement).value
  ).toContain("new version");
  expect(screen.queryByLabelText("Generated video preview")).toBeNull();
});

it("opens a saved video in the shared header and checks an uncertain request without starting another", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  api.search = `video=${id}`;
  api.videoJob = {
    id,
    setup: {
      ...newConfiguration().video,
      title: "Saved brand film",
      logoAssetId: 4,
    },
    revision: 2,
    status: "attention",
    error: "Waiting for the provider to confirm the result.",
    assetKey: null,
    createdAtMs: 1000,
  };
  open();
  await waitFor(() =>
    expect(
      (screen.getByLabelText("Creative name") as HTMLInputElement).value
    ).toBe("Saved brand film")
  );
  expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(
    "Creative Studio"
  );
  expect(screen.getByRole("alert").textContent).toContain(
    "Waiting for the provider"
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Check same request again" })
  );
  await waitFor(() =>
    expect(api.checkVideo).toHaveBeenCalledWith({ organizationId: 1, id })
  );
  expect(api.videoGenerate).not.toHaveBeenCalled();
});
it("keeps creator-video campaign context in the shared entry point", async () => {
  api.search = "plan=7&type=ugc";
  render(<CreativeConfiguratorPage initialKind="video" />);
  fireEvent.click(screen.getByRole("button", { name: /Save draft/ }));
  await waitFor(() =>
    expect(api.videoSave).toHaveBeenCalledWith(
      expect.objectContaining({
        setup: expect.objectContaining({
          category: "ugc",
          campaignPlanId: 7,
          direction: expect.objectContaining({ setting: "people" }),
        }),
      })
    )
  );
});
it("opens a failed request in Studio and detaches a new version from its old link", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  api.search = `video=${id}`;
  api.videoJob = {
    id,
    setup: { ...newConfiguration().video, title: "Brand film", logoAssetId: 4 },
    revision: 2,
    status: "failed",
    error: "The provider could not finish this video.",
    assetKey: null,
    createdAtMs: 1000,
  };
  open();
  await waitFor(() =>
    expect(
      (screen.getByLabelText("Creative name") as HTMLInputElement).value
    ).toBe("Brand film")
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Use these settings as a new draft" })
  );
  expect(api.route).toHaveBeenCalledWith("/app/creatives/studio", {
    replace: true,
  });
  expect(
    JSON.parse(localStorage.getItem("el-configurator-v1:10:1")!).video
  ).toMatchObject({ title: "Brand film · new version", logoAssetId: 4 });
  expect(api.videoGenerate).not.toHaveBeenCalled();
});
it("preserves each type's name and setup when switching Image/Video", () => {
  open();
  fireEvent.change(screen.getByLabelText("Creative name"), {
    target: { value: "My image" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Select Video" }));
  fireEvent.change(screen.getByLabelText("Creative name"), {
    target: { value: "My film" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Select Image" }));
  expect(
    (screen.getByLabelText("Creative name") as HTMLInputElement).value
  ).toBe("My image");
  fireEvent.click(screen.getByRole("button", { name: "Select Video" }));
  expect(
    (screen.getByLabelText("Creative name") as HTMLInputElement).value
  ).toBe("My film");
  expect(api.generate).not.toHaveBeenCalled();
});
it("explains the people dependency and unlocks its picker only for people scenes", () => {
  open();
  section(/Look & Feel Make it yours/);
  fireEvent.click(
    screen.getByRole("button", { name: /People Needs people scene/ })
  );
  expect(screen.queryByRole("group", { name: "People gender" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Choose a scene/ }));
  fireEvent.click(
    screen.getByRole("button", { name: "Select Lifestyle · with people" })
  );
  fireEvent.click(screen.getByRole("button", { name: "People" }));
  expect(screen.getByRole("group", { name: "People gender" })).toBeTruthy();
});
it("saves a real workspace draft without invoking generation", async () => {
  open();
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() =>
    expect(api.save).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 1,
        setup: expect.objectContaining({ name: "Untitled creative" }),
      })
    )
  );
  expect(api.generate).not.toHaveBeenCalled();
});
it("requires a valid current quote and explicit confirmation before image generation", async () => {
  const config = newConfiguration();
  config.image.products = [
    { productId: 1, imageId: 2, featuredSpecKeys: [], includePrice: false },
  ];
  localStorage.setItem("el-configurator-v1:10:1", JSON.stringify(config));
  api.job = { id: 12, status: "queued", variants: [] };
  const view = open();
  fireEvent.click(screen.getByRole("button", { name: "Generate images" }));
  expect(api.generate).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Confirm · 174 credits" })
  );
  await waitFor(() =>
    expect(api.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 1,
        briefId: 1,
        quotedCredits: 174,
        expectedUpdatedAtMs: 123,
      })
    )
  );
  expect(await screen.findByText("Your images are queued")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Generate images" })).toBeNull();
  expect(document.querySelector(".cfg-bottom")).toBeNull();
  expect(screen.queryByRole("progressbar")).toBeNull();
  api.job = { id: 12, status: "running", variants: [] };
  view.rerender(<CreativeConfiguratorPage />);
  expect(screen.getByText("Creating your images")).toBeTruthy();
  expect(api.generate).toHaveBeenCalledTimes(1);
});
it("does not reuse another workspace's local draft", () => {
  const config = newConfiguration();
  config.image.name = "Other tenant";
  localStorage.setItem("el-configurator-v1:10:2", JSON.stringify(config));
  open();
  expect(
    (screen.getByLabelText("Creative name") as HTMLInputElement).value
  ).toBe("Untitled creative");
});
it("disables generation for incomplete source selection even if a cached quote exists", () => {
  open();
  expect(
    (
      screen.getByRole("button", {
        name: "Generate images",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
});
it("opens model details without changing selection or spending credits", () => {
  open();
  section(/AI Model Choose your engine/);
  fireEvent.click(
    screen.getByRole("button", { name: "More about GPT Image 2.5 Sunburst" })
  );
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(
    within(screen.getByRole("dialog")).getByText("Reference images")
  ).toBeTruthy();
  expect(api.generate).not.toHaveBeenCalled();
});

it("keeps an estimated credit total visible before required sources are selected", () => {
  open();
  expect(screen.getAllByText("≈ 31 credits").length).toBeGreaterThan(0);
  expect(screen.queryByText(/Complete setup for quote/i)).toBeNull();
  expect(
    (
      screen.getByRole("button", {
        name: "Generate images",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
});
it("renders selected catalog source photos and titles in video builds", () => {
  const config = newConfiguration();
  config.kind = "video";
  config.video.imageKeys = ["product_image:2"];
  localStorage.setItem("el-configurator-v1:10:1", JSON.stringify(config));
  open();
  fireEvent.click(screen.getByRole("button", { name: "Subject & sources" }));
  const sources = within(
    screen.getByRole("region", { name: "Selected sources" })
  );
  expect(sources.getByText("Studio lamp")).toBeTruthy();
  expect(
    (
      sources.getByRole("img", { name: "Studio lamp" }) as HTMLImageElement
    ).getAttribute("src")
  ).toBe("/lamp.png");
  expect(screen.queryByText(/Catalog reference 1/)).toBeNull();
});

it("previews a generated version without changing settings or generating, and reuses only on explicit action", () => {
  const trial = newConfiguration().image;
  trial.name = "Previous lamp";
  api.history = [
    {
      id: 8,
      title: "Previous lamp square",
      url: "/prior-lamp.png",
      createdAtMs: 1791979200000,
      status: "pending",
      setup: trial,
    },
  ];
  open();
  const name = screen.getByRole("textbox", { name: "Creative name" });
  fireEvent.change(name, { target: { value: "Keep my current draft" } });
  fireEvent.click(
    screen.getByRole("button", { name: "Preview Previous lamp square" })
  );
  expect(
    screen
      .getByRole("img", { name: "Previous lamp square" })
      .getAttribute("src")
  ).toBe("/prior-lamp.png");
  expect((name as HTMLInputElement).value).toBe("Keep my current draft");
  expect(api.save).not.toHaveBeenCalled();
  expect(api.generate).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Use these settings as a new draft" })
  );
  expect((name as HTMLInputElement).value).toBe("Previous lamp · new version");
  expect(api.save).not.toHaveBeenCalled();
  expect(api.generate).not.toHaveBeenCalled();
});

it.each(["draft", "needs_review"])(
  "shows a %s logo and uses the existing versioned approval flow",
  async state => {
    api.assets = [
      {
        key: "asset:4",
        name: "Website logo",
        url: "/logo.png",
        mediaType: "image",
        sourceType: "logo",
        state,
        revision: "a".repeat(64),
      },
    ];
    open();
    fireEvent.click(screen.getByRole("button", { name: "Brand & logo" }));
    expect(screen.getByRole("img", { name: "Website logo" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Approve & use logo" }));
    const input = {
      organizationId: 1,
      key: "asset:4",
      revision: "a".repeat(64),
    };
    if (state === "draft") {
      await waitFor(() => expect(api.approveLogo).toHaveBeenCalledWith(input));
      expect(api.reviewLogo).not.toHaveBeenCalled();
    } else {
      await waitFor(() =>
        expect(api.reviewLogo).toHaveBeenCalledWith({
          ...input,
          decision: "approved",
          note: "Approved from Creative Studio's logo picker.",
        })
      );
      expect(api.approveLogo).not.toHaveBeenCalled();
    }
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Select Website logo" })
          .getAttribute("aria-pressed")
      ).toBe("true")
    );
    expect(api.generate).not.toHaveBeenCalled();
  }
);

it("keeps completed generation in the large preview and requires explicit approval", async () => {
  const config = newConfiguration();
  config.image.products = [
    { productId: 1, imageId: 2, featuredSpecKeys: [], includePrice: false },
  ];
  localStorage.setItem("el-configurator-v1:10:1", JSON.stringify(config));
  api.job = {
    id: 12,
    status: "completed",
    variants: [
      {
        id: 55,
        title: "Fresh creative",
        url: "/fresh.png",
        createdAtMs: 1,
        status: "pending",
      },
    ],
  };
  api.assets = [
    {
      key: "creative:55",
      name: "Fresh creative",
      url: "/fresh.png",
      state: "draft",
      revision: "a".repeat(64),
      mediaType: "image",
      sourceType: "creative",
    },
  ];
  open();
  fireEvent.click(screen.getByRole("button", { name: "Generate images" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Confirm · 174 credits" })
  );
  await waitFor(() =>
    expect(
      screen.getByRole("img", { name: "Fresh creative" }).getAttribute("src")
    ).toBe("/fresh.png")
  );
  expect(screen.queryByLabelText("Image generation")).toBeNull();
  expect(screen.getByRole("button", { name: "Generate images" })).toBeTruthy();
  expect(api.route).not.toHaveBeenCalled();
  expect(api.approveLogo).not.toHaveBeenCalled();
  expect(
    screen
      .getByRole("link", { name: "Activate / Publish" })
      .getAttribute("href")
  ).toBe("/app/activate/studio?asset=creative%3A55");
  // Following the link opens preparation; asset approval remains explicit.
  expect(api.approveLogo).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Approve" }));
  await waitFor(() =>
    expect(api.approveLogo).toHaveBeenCalledWith({
      organizationId: 1,
      key: "creative:55",
      revision: "a".repeat(64),
    })
  );
});
it("reports a failed generation in place without navigating or approving", async () => {
  const config = newConfiguration();
  config.image.products = [
    { productId: 1, imageId: 2, featuredSpecKeys: [], includePrice: false },
  ];
  localStorage.setItem("el-configurator-v1:10:1", JSON.stringify(config));
  api.job = {
    id: 12,
    status: "failed",
    errorMessage: "The provider could not finish this image.",
    variants: [],
  };
  open();
  fireEvent.click(screen.getByRole("button", { name: "Generate images" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Confirm · 174 credits" })
  );
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain(
      "The provider could not finish"
    )
  );
  expect(screen.queryByLabelText("Image generation")).toBeNull();
  expect(screen.getByRole("button", { name: "Generate images" })).toBeTruthy();
  expect(api.route).not.toHaveBeenCalled();
  expect(api.approveLogo).not.toHaveBeenCalled();
});

it("persists product preservation in image drafts and retains it when switching creative types", async () => {
  open();
  fireEvent.click(screen.getByRole("button", { name: "Subject & sources" }));
  const option = screen.getByRole("checkbox", {
    name: /Preserve original product/,
  });
  expect((option as HTMLInputElement).checked).toBe(false);
  fireEvent.click(option);
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() =>
    expect(api.save).toHaveBeenCalledWith(
      expect.objectContaining({
        setup: expect.objectContaining({ preserveProduct: true }),
      })
    )
  );
  fireEvent.click(screen.getByRole("button", { name: "Creative type" }));
  fireEvent.click(screen.getByRole("button", { name: "Select Video" }));
  fireEvent.click(screen.getByRole("button", { name: "Subject & sources" }));
  expect(
    screen.queryByRole("checkbox", { name: /Preserve original product/ })
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Creative type" }));
  fireEvent.click(screen.getByRole("button", { name: "Select Image" }));
  fireEvent.click(screen.getByRole("button", { name: "Subject & sources" }));
  expect(
    (
      screen.getByRole("checkbox", {
        name: /Preserve original product/,
      }) as HTMLInputElement
    ).checked
  ).toBe(true);
  expect(api.generate).not.toHaveBeenCalled();
});

it("offers Rubik and keeps font preservation off until explicitly selected", async () => {
  open();
  section(/Look & Feel/);
  fireEvent.click(screen.getByRole("button", { name: "Fonts" }));
  expect(
    (
      screen.getByRole("checkbox", {
        name: "Preserve selected font",
      }) as HTMLInputElement
    ).checked
  ).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Select Rubik" }));
  expect(
    screen
      .getByRole("button", { name: "Select Rubik" })
      .getAttribute("aria-pressed")
  ).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() =>
    expect(api.save).toHaveBeenCalledWith(
      expect.objectContaining({
        setup: expect.objectContaining({
          fontFamily: "Rubik",
          preserveFont: false,
        }),
      })
    )
  );
});

it("keeps logo imports in Brand and saves original-logo settings independently of product preservation", async () => {
  api.assets = [
    {
      key: "asset:4",
      name: "Original logo",
      url: "/logo.png",
      mediaType: "image",
      sourceType: "logo",
      state: "approved",
      revision: "a".repeat(64),
    },
  ];
  open();
  fireEvent.click(screen.getByRole("button", { name: "Brand & logo" }));
  expect(screen.queryByText("Logo import tools")).toBeNull();
  expect(
    screen.getByRole("link", { name: /Manage Brand Kit/ }).getAttribute("href")
  ).toBe("/app/brand");
  fireEvent.click(screen.getByRole("button", { name: "Select Original logo" }));
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Preserve original logo" })
  );
  fireEvent.change(screen.getByRole("combobox", { name: "Logo position" }), {
    target: { value: "bottom-right" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() =>
    expect(api.save).toHaveBeenCalledWith(
      expect.objectContaining({
        setup: expect.objectContaining({
          logoAssetId: 4,
          preserveLogo: true,
          logoPosition: "bottom-right",
        }),
      })
    )
  );
  fireEvent.click(screen.getByRole("button", { name: "Select No logo" }));
  expect(
    screen.queryByRole("checkbox", { name: "Preserve original logo" })
  ).toBeNull();
});
