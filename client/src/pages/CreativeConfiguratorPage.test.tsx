// @vitest-environment jsdom
import { changeField } from "@/test/choiceControls";
import {
  act,
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
import {
  newConfiguration,
  type ConfiguratorState,
} from "@shared/creativeConfigurator";
const api = vi.hoisted(() => ({
  save: vi.fn(),
  generate: vi.fn(),
  videoSave: vi.fn(),
  videoGenerate: vi.fn(),
  role: "owner",
  org: 1,
  route: vi.fn(),
  drafts: [] as any[],
  videoDrafts: [] as any[],
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
                specifications: { Power: "12 W", Material: "Aluminum" },
                description: "A dimmable desk lamp.",
                price: "89.00",
                currency: "USD",
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
                product: {
                  id: 1,
                  name: "Studio lamp",
                  specifications: { Power: "12 W", Material: "Aluminum" },
                  description: "A dimmable desk lamp.",
                  price: "89.00",
                  currency: "USD",
                },
              },
            ],
            nextOffset: null,
          },
        }),
      },
      list: { useQuery: () => ({ data: api.videoDrafts }) },
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
  api.videoDrafts = [];
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
  clickJourney(screen.getByRole("button", { name: "Select Video" }));
  section(/Story & Sound Tell your story/);
  const draft = screen.getByRole("button", {
    name: /Generate prompt from this setup/,
  }) as HTMLButtonElement;
  expect(draft.disabled).toBe(false);
  clickJourney(draft);
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
  await waitFor(
    () =>
      expect(
        (
          screen.getByRole("button", {
            name: "Generate video",
          }) as HTMLButtonElement
        ).disabled
      ).toBe(false),
    { timeout: 3000 }
  );
  section(/Type & Source Start with an idea/);
  clickJourney(
    screen.getByRole("button", { name: "Open Subject & sources category" })
  );
  clickJourney(screen.getByRole("button", { name: "Select Studio lamp" }));
  expect(screen.getByText("1 image selected")).toBeTruthy();
  clickJourney(screen.getByRole("button", { name: "Save draft" }));
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
  clickJourney(screen.getByRole("button", { name: "Clear image references" }));
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
  openSaved(config);
  section(/Story & Sound Tell your story/);
  expect(
    screen.getByText("Homeschool quiz", { selector: ".cfg-copy-source strong" })
  ).toBeTruthy();
  clickJourney(
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
  clickJourney(screen.getByRole("button", { name: "Review page details" }));
  expect(
    (screen.getByLabelText("Page details") as HTMLTextAreaElement).value
  ).toContain("12 questions");
});
it("shows every category and resets viewed status when the studio reopens", () => {
  const view = open();
  expect(
    screen.getByRole("button", { name: "Open Creative type category" })
      .textContent
  ).toContain("Viewed");
  clickJourney(
    screen.getByRole("button", { name: "Explore next: Subject & sources" })
  );
  expect(
    screen.getByRole("heading", { name: "Subject & sources" })
  ).toBeTruthy();
  clickJourney(screen.getByRole("button", { name: "Next category" }));
  expect(screen.getByRole("heading", { name: "Product details" })).toBeTruthy();
  clickJourney(screen.getByRole("button", { name: "Next category" }));
  expect(screen.getByRole("heading", { name: "Brand & logo" })).toBeTruthy();
  section(/Look & Feel/);
  expect(document.querySelectorAll(".journey-category")).toHaveLength(7);
  const people = screen.getByRole("button", {
    name: "Open People category",
  }) as HTMLButtonElement;
  expect(people.disabled).toBe(true);
  expect(people.textContent).toContain("Choose a people scene");
  clickJourney(screen.getByRole("button", { name: "Open Fonts category" }));
  expect(
    screen.getByRole("button", { name: "Open Fonts category" }).textContent
  ).toContain("Viewed");
  expect(
    screen.getByRole("button", { name: "Open Fonts category" }).textContent
  ).toContain("Automatic");
  view.unmount();
  open();
  section(/Look & Feel/);
  expect(
    screen.getByRole("button", { name: "Open Fonts category" }).textContent
  ).toContain("Not viewed");
  section(/Type & Source/);
  clickJourney(screen.getByRole("button", { name: "Select Video" }));
  expect(
    screen.getByRole("button", { name: "Open Brand & logo category" })
      .textContent
  ).toContain("Not viewed");
  section(/Look & Feel/);
  expect(
    screen.queryByRole("button", { name: "Open Fonts category" })
  ).toBeNull();
  section(/Story & Sound/);
  expect(
    screen.getByRole("button", { name: "Open Audio category" })
  ).toBeTruthy();
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
    clickJourney(screen.getByRole("checkbox", { name: "Compare " + name }));
  }
  expect(
    (
      screen.getByRole("checkbox", {
        name: "Compare GPT Image 1",
      }) as HTMLInputElement
    ).checked
  ).toBe(false);
  clickJourney(screen.getByRole("button", { name: "Compare models" }));
  const dialog = within(screen.getByRole("dialog"));
  expect(dialog.getByText("Compare image models")).toBeTruthy();
  expect(
    dialog.getByRole("rowheader", { name: "Starting estimate" })
  ).toBeTruthy();
  clickJourney(dialog.getByRole("checkbox", { name: "Show differences only" }));
  expect(dialog.queryByRole("rowheader", { name: "Model maker" })).toBeNull();
  expect(api.generate).not.toHaveBeenCalled();
  expect(api.videoGenerate).not.toHaveBeenCalled();
});
it("duplicates a build, preserves its snapshot, highlights changes, and swaps without overwriting a cloud draft", async () => {
  open();
  changeField(screen.getByLabelText("Creative name"), {
    target: { value: "Original build" },
  });
  clickJourney(screen.getByRole("button", { name: "Duplicate & compare" }));
  expect(
    (screen.getByLabelText("Creative name") as HTMLInputElement).value
  ).toBe("Original build · Alternative");
  section(/Look & Feel Make it yours/);
  clickJourney(
    screen.getByRole("button", { name: "Select Lifestyle · no people" })
  );
  clickJourney(screen.getByRole("button", { name: "Compare builds" }));
  const dialog = within(screen.getByRole("dialog"));
  expect(dialog.getByText("Original build")).toBeTruthy();
  clickJourney(dialog.getByRole("checkbox", { name: "Show differences only" }));
  expect(dialog.getByRole("rowheader", { name: "Scene" })).toBeTruthy();
  expect(dialog.queryByRole("rowheader", { name: "Theme" })).toBeNull();
  clickJourney(dialog.getByRole("button", { name: "Swap builds" }));
  expect(
    (screen.getByLabelText("Creative name") as HTMLInputElement).value
  ).toBe("Original build");
  clickJourney(screen.getByRole("button", { name: "Compare builds" }));
  expect(screen.getByText("Original build · Alternative")).toBeTruthy();
  expect(localStorage.getItem("el-configurator-v1:10:1:comparison")).toBeNull();
  expect(api.save).not.toHaveBeenCalled();
  expect(api.generate).not.toHaveBeenCalled();
});
it("exposes audio and subtitle categories only for video and does not imply subtitle support", () => {
  open();
  section(/Story & Sound Tell your story/);
  expect(
    screen.queryByRole("button", { name: "Open Subtitles category" })
  ).toBeNull();
  section(/Type & Source Start with an idea/);
  clickJourney(screen.getByRole("button", { name: "Select Video" }));
  section(/Story & Sound Tell your story/);
  const subtitles = screen.getByRole("button", {
    name: "Open Subtitles category",
  }) as HTMLButtonElement;
  expect(subtitles.disabled).toBe(true);
  expect(subtitles.textContent).toContain("Coming soon");
  expect(api.videoGenerate).not.toHaveBeenCalled();
});
afterEach(cleanup);

it.each(["image", "video"] as const)(
  "exposes catalog facts and saves only the selected %s highlights",
  async kind => {
    open();
    if (kind === "video")
      clickJourney(screen.getByRole("button", { name: "Select Video" }));
    clickJourney(
      screen.getByRole("button", { name: "Open Subject & sources category" })
    );
    clickJourney(screen.getByRole("button", { name: "Select Studio lamp" }));
    clickJourney(
      screen.getByRole("button", { name: /Choose product details for the ad/ })
    );
    expect(
      screen
        .getByRole("button", { name: /Include price/ })
        .getAttribute("aria-pressed")
    ).toBe("false");
    expect(
      screen.getByRole("button", { name: "Feature Material: Aluminum" })
    ).toBeTruthy();
    clickJourney(screen.getByRole("button", { name: "Feature Power: 12 W" }));
    clickJourney(screen.getByRole("button", { name: /Include price/ }));
    clickJourney(
      screen.getByRole("button", { name: /Description & benefits/ })
    );
    clickJourney(screen.getByRole("button", { name: "Save draft" }));
    const save = kind === "image" ? api.save : api.videoSave;
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
          setup: expect.objectContaining({
            [kind === "image" ? "products" : "productSelections"]: [
              expect.objectContaining({
                productId: 1,
                featuredSpecKeys: ["Power"],
                includePrice: true,
                includeDescription: true,
              }),
            ],
          }),
        })
      )
    );
    if (kind === "video") {
      clickJourney(
        screen.getByRole("button", { name: "Open Subject & sources category" })
      );
      clickJourney(screen.getByRole("button", { name: "Remove Studio lamp" }));
      clickJourney(
        screen.getByRole("button", { name: "Open Product details category" })
      );
      expect(
        screen.getByRole("heading", { name: "Choose a catalog product first" })
      ).toBeTruthy();
      clickJourney(screen.getByRole("button", { name: "Save draft" }));
      await waitFor(() =>
        expect(save).toHaveBeenLastCalledWith(
          expect.objectContaining({
            setup: expect.objectContaining({
              imageKeys: [],
              productSelections: [],
            }),
          })
        )
      );
    }
    expect(api.generate).not.toHaveBeenCalled();
    expect(api.videoGenerate).not.toHaveBeenCalled();
  }
);

function open() {
  const view = render(<CreativeConfiguratorPage />);
  const summary = screen.getByRole("button", { name: /Preview & summary/ });
  if (summary.getAttribute("aria-expanded") === "false") clickJourney(summary);
  return view;
}
function openSaved(config: ConfiguratorState) {
  const name = config.kind === "image" ? config.image.name : config.video.title;
  if (config.kind === "image")
    api.drafts = [{ id: 1, name, setup: config.image, updatedAtMs: 123 }];
  else
    api.videoDrafts = [
      { id: "video-draft", setup: config.video, revision: 1, status: "draft" },
    ];
  const view = open();
  clickJourney(screen.getByRole("button", { name: "Saved drafts" }));
  clickJourney(within(screen.getByRole("dialog")).getByText(name));
  return view;
}
function section(name: RegExp) {
  clickJourney(screen.getByRole("button", { name }));
  const keep = screen.queryByRole("button", {
    name: /^(Keep defaults & continue|Continue with current choices)$/,
  });
  if (keep) clickJourney(keep);
}
it("defaults to reference-image models for an image source and keeps a deliberate filter choice across categories", () => {
  open();
  section(/AI Model Choose your engine/);
  clickJourney(screen.getByRole("tab", { name: /Input/ }));
  expect(
    screen
      .getByRole("radio", { name: "All inputs" })
      .getAttribute("aria-checked")
  ).toBe("true");
  section(/Type & Source Start with an idea/);
  clickJourney(
    screen.getByRole("button", { name: "Open Subject & sources category" })
  );
  clickJourney(screen.getByRole("button", { name: "Select Studio lamp" }));
  section(/AI Model Choose your engine/);
  clickJourney(screen.getByRole("tab", { name: /Input/ }));
  expect(
    screen
      .getByRole("radio", { name: "Reference images" })
      .getAttribute("aria-checked")
  ).toBe("true");
  clickJourney(screen.getByRole("radio", { name: "All inputs" }));
  section(/Story & Sound Tell your story/);
  section(/AI Model Choose your engine/);
  clickJourney(screen.getByRole("tab", { name: /Input/ }));
  expect(
    screen
      .getByRole("radio", { name: "All inputs" })
      .getAttribute("aria-checked")
  ).toBe("true");
  clickJourney(screen.getByRole("button", { name: "Reset model filters" }));
  expect(
    screen
      .getByRole("radio", { name: "Reference images" })
      .getAttribute("aria-checked")
  ).toBe("true");
});
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
  render(<CreativeConfiguratorPage initialKind="video" />);
  const heading = screen.getByRole("heading", { level: 1 }).textContent;
  clickJourney(
    screen.getByRole("button", { name: "Open Brand & logo category" })
  );
  clickJourney(screen.getByRole("button", { name: "Select Brand wordmark" }));
  clickJourney(screen.getByRole("button", { name: /Save draft/ }));
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
  expect(
    screen
      .getByRole("button", { name: "Select Brand wordmark" })
      .getAttribute("aria-pressed")
  ).toBe("true");
  clickJourney(
    screen.getByRole("button", { name: "Open Creative type category" })
  );
  clickJourney(screen.getByRole("button", { name: "Select Image" }));
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(heading);
  clickJourney(
    screen.getByRole("button", { name: "Open Brand & logo category" })
  );
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
  let view: ReturnType<typeof openSaved>;
  // Advance the quote debounce deterministically, independent of CI CPU load.
  vi.useFakeTimers();
  try {
    view = openSaved(config);
    await act(() => vi.advanceTimersByTimeAsync(500));
  } finally {
    vi.useRealTimers();
  }
  const heading = screen.getByRole("heading", { level: 1 }).textContent;
  expect(
    (
      screen.getByRole("button", {
        name: "Generate video",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(false);
  clickJourney(screen.getByRole("button", { name: "Generate video" }));
  api.videoJob = {
    id: "video-draft",
    setup: config.video,
    revision: 1,
    status: "queued",
    assetKey: null,
    createdAtMs: 1000,
    cancelRequested: false,
  };
  clickJourney(
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
  clickJourney(
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
  clickJourney(
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
  clickJourney(screen.getByRole("button", { name: /Save draft/ }));
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
  const view = open();
  await waitFor(() =>
    expect(
      (screen.getByLabelText("Creative name") as HTMLInputElement).value
    ).toBe("Brand film")
  );
  clickJourney(
    screen.getByRole("button", { name: "Use these settings as a new draft" })
  );
  expect(api.route).toHaveBeenCalledWith("/app/creatives/studio", {
    replace: true,
  });
  api.search = "";
  view.rerender(<CreativeConfiguratorPage />);
  expect(
    (screen.getByLabelText("Creative name") as HTMLInputElement).value
  ).toBe("Brand film · new version");
  expect(localStorage.getItem("el-configurator-v1:10:1")).toBeNull();
  clickJourney(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() =>
    expect(api.videoSave).toHaveBeenCalledWith(
      expect.objectContaining({
        setup: expect.objectContaining({
          title: "Brand film · new version",
          logoAssetId: 4,
        }),
      })
    )
  );
  expect(api.videoGenerate).not.toHaveBeenCalled();
});
it("preserves each type during the visit, then resets unsaved image and video choices on return", () => {
  const view = open();
  changeField(screen.getByLabelText("Creative name"), {
    target: { value: "My image" },
  });
  clickJourney(screen.getByRole("button", { name: "Select Video" }));
  changeField(screen.getByLabelText("Creative name"), {
    target: { value: "My film" },
  });
  clickJourney(screen.getByRole("button", { name: "Select Image" }));
  expect(
    (screen.getByLabelText("Creative name") as HTMLInputElement).value
  ).toBe("My image");
  clickJourney(screen.getByRole("button", { name: "Select Video" }));
  expect(
    (screen.getByLabelText("Creative name") as HTMLInputElement).value
  ).toBe("My film");
  view.unmount();
  open();
  expect(
    (screen.getByLabelText("Creative name") as HTMLInputElement).value
  ).toBe("Untitled creative");
  clickJourney(screen.getByRole("button", { name: "Select Video" }));
  expect(
    (screen.getByLabelText("Creative name") as HTMLInputElement).value
  ).toBe("Untitled video");
  expect(api.save).not.toHaveBeenCalled();
  expect(api.videoSave).not.toHaveBeenCalled();
  expect(api.generate).not.toHaveBeenCalled();
});

it("ignores old browser choices and comparisons when starting a new studio visit", () => {
  const stale = newConfiguration();
  stale.kind = "video";
  stale.image.name = "Stale image";
  stale.video.title = "Stale video";
  localStorage.setItem("el-configurator-v1:10:1", JSON.stringify(stale));
  localStorage.setItem(
    "el-configurator-v1:10:1:comparison",
    JSON.stringify({ config: stale, credits: 10, capturedAt: Date.now() })
  );
  open();
  expect(
    (screen.getByLabelText("Creative name") as HTMLInputElement).value
  ).toBe("Untitled creative");
  expect(screen.queryByRole("button", { name: "Compare builds" })).toBeNull();
  clickJourney(screen.getByRole("button", { name: "Select Video" }));
  expect(
    (screen.getByLabelText("Creative name") as HTMLInputElement).value
  ).toBe("Untitled video");
});

it.each(["image", "video"] as const)(
  "reopens the explicitly saved %s choices without retaining later unsaved edits",
  async kind => {
    const view = open();
    if (kind === "video")
      clickJourney(screen.getByRole("button", { name: "Select Video" }));
    changeField(screen.getByLabelText("Creative name"), {
      target: { value: "Saved campaign" },
    });
    clickJourney(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() =>
      expect(screen.getByText("Saved to workspace")).toBeTruthy()
    );
    const saved = (kind === "image" ? api.save : api.videoSave).mock.calls[0][0]
      .setup;
    if (kind === "image")
      api.drafts = [
        { id: 1, name: saved.name, setup: saved, updatedAtMs: 123 },
      ];
    else
      api.videoDrafts = [
        { id: "video-draft", setup: saved, revision: 1, status: "draft" },
      ];
    changeField(screen.getByLabelText("Creative name"), {
      target: { value: "Unsaved revision" },
    });
    expect(
      screen.getByText("Unsaved choices · Save draft to keep")
    ).toBeTruthy();
    view.unmount();
    open();
    expect(
      (screen.getByLabelText("Creative name") as HTMLInputElement).value
    ).toBe("Untitled creative");
    clickJourney(screen.getByRole("button", { name: "Saved drafts" }));
    clickJourney(
      within(screen.getByRole("dialog")).getByText("Saved campaign")
    );
    expect(
      (screen.getByLabelText("Creative name") as HTMLInputElement).value
    ).toBe("Saved campaign");
    expect(screen.getByText("Saved to workspace")).toBeTruthy();
    expect(kind === "image" ? api.save : api.videoSave).toHaveBeenCalledTimes(
      1
    );
    expect(api.generate).not.toHaveBeenCalled();
    expect(api.videoGenerate).not.toHaveBeenCalled();
  }
);

it("keeps choices unsaved when saving fails", async () => {
  api.save.mockRejectedValueOnce(new Error("Could not save draft"));
  open();
  clickJourney(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain(
      "Could not save draft"
    )
  );
  expect(screen.getByText("Unsaved choices · Save draft to keep")).toBeTruthy();
  expect(screen.queryByText("Saved to workspace")).toBeNull();
});
it("explains the people dependency and unlocks its picker only for people scenes", () => {
  open();
  section(/Look & Feel Make it yours/);
  expect(
    (
      screen.getByRole("button", {
        name: "Open People category",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
  expect(screen.queryByRole("tablist", { name: "People filters" })).toBeNull();
  clickJourney(screen.getByRole("button", { name: "Open Scene category" }));
  clickJourney(
    screen.getByRole("button", { name: "Select Lifestyle · with people" })
  );
  clickJourney(screen.getByRole("button", { name: "Open People category" }));
  expect(screen.getByRole("tablist", { name: "People filters" })).toBeTruthy();
  expect(
    screen.getByRole("radiogroup", { name: "People gender" })
  ).toBeTruthy();
});
it("saves a real workspace draft without invoking generation", async () => {
  open();
  clickJourney(screen.getByRole("button", { name: "Save draft" }));
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
  api.job = { id: 12, status: "queued", variants: [] };
  const view = openSaved(config);
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Generate images",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false)
  );
  clickJourney(screen.getByRole("button", { name: "Generate images" }));
  expect(api.generate).not.toHaveBeenCalled();
  clickJourney(screen.getByRole("button", { name: "Confirm · 174 credits" }));
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
  clickJourney(
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
  openSaved(config);
  clickJourney(
    screen.getByRole("button", { name: "Open Subject & sources category" })
  );
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
  changeField(name, { target: { value: "Keep my current draft" } });
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Results" }), {
    button: 0,
    ctrlKey: false,
  });
  clickJourney(
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
  expect(
    screen.getByRole("tab", { name: "Review" }).getAttribute("aria-selected")
  ).toBe("true");
  clickJourney(
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
    clickJourney(
      screen.getByRole("button", { name: "Open Brand & logo category" })
    );
    expect(screen.getByRole("img", { name: "Website logo" })).toBeTruthy();
    clickJourney(screen.getByRole("button", { name: "Approve & use logo" }));
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
  openSaved(config);
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Generate images",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false)
  );
  clickJourney(screen.getByRole("button", { name: "Generate images" }));
  clickJourney(screen.getByRole("button", { name: "Confirm · 174 credits" }));
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
  clickJourney(screen.getByRole("button", { name: "Approve" }));
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
  api.job = {
    id: 12,
    status: "failed",
    errorMessage: "The provider could not finish this image.",
    variants: [],
  };
  openSaved(config);
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Generate images",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false)
  );
  clickJourney(screen.getByRole("button", { name: "Generate images" }));
  clickJourney(screen.getByRole("button", { name: "Confirm · 174 credits" }));
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
  clickJourney(
    screen.getByRole("button", { name: "Open Subject & sources category" })
  );
  const option = screen.getByRole("checkbox", {
    name: /Preserve original product/,
  });
  expect((option as HTMLInputElement).checked).toBe(false);
  clickJourney(option);
  clickJourney(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() =>
    expect(api.save).toHaveBeenCalledWith(
      expect.objectContaining({
        setup: expect.objectContaining({ preserveProduct: true }),
      })
    )
  );
  clickJourney(
    screen.getByRole("button", { name: "Open Creative type category" })
  );
  clickJourney(screen.getByRole("button", { name: "Select Video" }));
  clickJourney(
    screen.getByRole("button", { name: "Open Subject & sources category" })
  );
  expect(
    screen.queryByRole("checkbox", { name: /Preserve original product/ })
  ).toBeNull();
  clickJourney(
    screen.getByRole("button", { name: "Open Creative type category" })
  );
  clickJourney(screen.getByRole("button", { name: "Select Image" }));
  clickJourney(
    screen.getByRole("button", { name: "Open Subject & sources category" })
  );
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
  clickJourney(screen.getByRole("button", { name: "Open Fonts category" }));
  expect(
    (
      screen.getByRole("checkbox", {
        name: "Preserve selected font",
      }) as HTMLInputElement
    ).checked
  ).toBe(false);
  clickJourney(screen.getByRole("button", { name: "Select Rubik" }));
  expect(
    screen
      .getByRole("button", { name: "Select Rubik" })
      .getAttribute("aria-pressed")
  ).toBe("true");
  clickJourney(screen.getByRole("button", { name: "Save draft" }));
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
  clickJourney(
    screen.getByRole("button", { name: "Open Brand & logo category" })
  );
  expect(screen.queryByText("Logo import tools")).toBeNull();
  expect(
    screen.getByRole("link", { name: /Manage Brand Kit/ }).getAttribute("href")
  ).toBe("/app/brand");
  clickJourney(screen.getByRole("button", { name: "Select Original logo" }));
  clickJourney(
    screen.getByRole("checkbox", { name: "Preserve original logo" })
  );
  changeField(screen.getByRole("radiogroup", { name: "Logo position" }), {
    target: { value: "bottom-right" },
  });
  clickJourney(screen.getByRole("button", { name: "Save draft" }));
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
  clickJourney(screen.getByRole("button", { name: "Select No logo" }));
  expect(
    screen.queryByRole("checkbox", { name: "Preserve original logo" })
  ).toBeNull();
});

function clickJourney(element: HTMLElement) {
  fireEvent.click(element);
  const keep = screen.queryByRole("button", {
    name: /^(Keep defaults & continue|Continue with current choices)$/,
  });
  if (keep) fireEvent.click(keep);
}
