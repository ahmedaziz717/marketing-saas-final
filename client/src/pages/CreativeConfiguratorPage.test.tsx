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
  LifestylePersonPicker: () => <div>People library picker</div>,
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
  Link: ({ children, href }: any) => <a href={href}>{children}</a>,
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      creativeBuilder: { options: { invalidate: vi.fn() } },
      video: { list: { invalidate: vi.fn() } },
      assetLibrary: { studioList: { invalidate: vi.fn() } },
      models: { credits: { invalidate: vi.fn() } },
    }),
    creativeBuilder: {
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
      refreshCopy: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      quote: {
        useQuery: () => ({ data: { credits: 174 }, isFetching: false }),
      },
    },
    models: {
      catalog: {
        useQuery: () => ({
          data: [
            DEFAULT_IMAGE_MODEL,
            "openai:gpt-image-2.5-flare",
            "openai:gpt-image-2",
            "openai:gpt-image-1",
            DEFAULT_VIDEO_MODEL,
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
    assetLibrary: { studioList: { useQuery: () => ({ data: [] }) } },
    video: {
      list: { useQuery: () => ({ data: [] }) },
      options: { useQuery: () => ({ data: { ready: true } }) },
      save: { useMutation: () => ({ mutateAsync: api.videoSave }) },
      generate: { useMutation: () => ({ mutateAsync: api.videoGenerate }) },
      draftPrompt: { useMutation: () => ({ mutateAsync: vi.fn() }) },
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
  api.save.mockResolvedValue({ briefId: 1, updatedAtMs: 123 });
  api.generate.mockResolvedValue({ status: "queued" });
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
  fireEvent.change(screen.getByLabelText("Configuration name"), {
    target: { value: "Original build" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Duplicate & compare" }));
  expect(
    (screen.getByLabelText("Configuration name") as HTMLInputElement).value
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
    (screen.getByLabelText("Configuration name") as HTMLInputElement).value
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
  render(<CreativeConfiguratorPage />);
}
function section(name: RegExp) {
  fireEvent.click(screen.getByRole("button", { name }));
}
it("preserves each type's name and setup when switching Image/Video", () => {
  open();
  fireEvent.change(screen.getByLabelText("Configuration name"), {
    target: { value: "My image" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Select Video" }));
  fireEvent.change(screen.getByLabelText("Configuration name"), {
    target: { value: "My film" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Select Image" }));
  expect(
    (screen.getByLabelText("Configuration name") as HTMLInputElement).value
  ).toBe("My image");
  fireEvent.click(screen.getByRole("button", { name: "Select Video" }));
  expect(
    (screen.getByLabelText("Configuration name") as HTMLInputElement).value
  ).toBe("My film");
  expect(api.generate).not.toHaveBeenCalled();
});
it("explains the people dependency and unlocks its picker only for people scenes", () => {
  open();
  section(/Look & Feel Make it yours/);
  fireEvent.click(
    screen.getByRole("button", { name: /People Needs people scene/ })
  );
  expect(screen.queryByText("People library picker")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Choose a scene/ }));
  fireEvent.click(
    screen.getByRole("button", { name: "Select Lifestyle · with people" })
  );
  fireEvent.click(screen.getByRole("button", { name: "People" }));
  expect(screen.getByText("People library picker")).toBeTruthy();
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
  open();
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
});
it("does not reuse another workspace's local draft", () => {
  const config = newConfiguration();
  config.image.name = "Other tenant";
  localStorage.setItem("el-configurator-v1:10:2", JSON.stringify(config));
  open();
  expect(
    (screen.getByLabelText("Configuration name") as HTMLInputElement).value
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
