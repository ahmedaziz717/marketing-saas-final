// @vitest-environment jsdom
import { changeField } from "@/test/choiceControls";
import { useState } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({
  search: "",
  current: undefined as any,
  prompt: vi.fn(),
  save: vi.fn(),
  generate: vi.fn(),
  toast: vi.fn(),
  items: [
    {
      key: "product_image:11",
      name: "Studio lamp",
      detail: "Front angle",
      url: "/lamp.png",
      origin: "catalog" as const,
      product: { id: 7 },
    },
    {
      key: "product_image:12",
      name: "Studio lamp",
      detail: "Side angle",
      url: "/lamp-side.png",
      origin: "catalog" as const,
      product: { id: 7 },
    },
  ],
}));
vi.mock("wouter", () => ({
  useSearch: () => api.search,
  useLocation: () => ["/app/creatives/video", vi.fn()],
  Link: ({ children, href }: any) => <a href={href}>{children}</a>,
}));
vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspace: () => ({ organizationId: 1, membership: { role: "owner" } }),
}));
vi.mock("@/hooks/usePromptDefaults", async () => {
  const { PROMPT_REGISTRY } = await import("@shared/promptRegistry");
  const data = PROMPT_REGISTRY.map(p => ({
    ...p,
    value: p.baseline,
    revision: 0,
    source: "system",
  }));
  return { usePromptDefaults: () => ({ data }), announcePromptChange: vi.fn() };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), info: api.toast } }));
vi.mock("./AssetUploadDialog", () => ({ AssetUploadDialog: () => null }));
vi.mock("./LifestylePersonPicker", () => ({
  LifestylePersonPicker: () => null,
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    prompts: {
      change: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
    models: {
      catalog: { useQuery: () => ({ data: [] }) },
      credits: { useQuery: () => ({ data: { textEstimate: 10 } }) },
    },
    useUtils: () => ({
      video: { list: { invalidate: vi.fn() }, get: { invalidate: vi.fn() } },
      assetLibrary: { studioList: { invalidate: vi.fn() } },
    }),
    video: {
      options: { useQuery: () => ({ data: { ready: true } }) },
      list: { useQuery: () => ({ data: [] }) },
      get: { useQuery: () => ({ data: api.current }) },
      quote: { useQuery: () => ({ data: { credits: 105 } }) },
      catalogImages: {
        useQuery: (input: any) => ({
          data: {
            items: input.selectedOnly
              ? api.items.filter(item => input.selectedKeys.includes(item.key))
              : api.items,
            nextOffset: null,
          },
        }),
      },
      draftPrompt: { useMutation: () => ({ mutateAsync: api.prompt }) },
      save: { useMutation: () => ({ mutateAsync: api.save }) },
      generate: { useMutation: () => ({ mutateAsync: api.generate }) },
      cancel: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      checkAgain: { useMutation: () => ({ mutateAsync: vi.fn() }) },
    },
    assetLibrary: {
      studioList: {
        useQuery: () => ({
          data: [
            {
              key: "asset:21",
              name: "Warm living room",
              url: "/room.png",
              origin: "generated",
              mediaType: "image",
              mimeType: "image/png",
              state: "approved",
            },
          ],
        }),
      },
    },
  },
}));
import { defaultVideoSetup } from "@shared/videoCreation";
import {
  DEFAULT_VIDEO_MODEL,
  generationModels,
  imageReferenceBudget,
} from "@shared/modelCatalog";
import { VideoStudio } from "./VideoStudio";
import { VideoReferencePicker } from "./VideoReferencePicker";
beforeEach(() => {
  vi.clearAllMocks();
  api.search = "";
  api.current = undefined;
  api.prompt.mockResolvedValue({
    prompt: "Orbit the lamp in Image 1 in a softly lit living room.",
  });
  api.save.mockResolvedValue({
    id: "00000000-0000-4000-8000-000000000001",
    revision: 1,
    status: "draft",
  });
});
afterEach(cleanup);
function chooseProduct() {
  fireEvent.click(screen.getByRole("button", { name: "Add images" }));
  fireEvent.click(
    screen.getByRole("checkbox", { name: /^Use 1 for Studio lamp/ })
  );
  fireEvent.click(screen.getByRole("button", { name: "Use selected images" }));
}
it("combines catalog photos and assets, generates an editable prompt, undoes it, and saves creative direction", async () => {
  render(<VideoStudio />);
  expect(
    (
      screen.getByRole("button", {
        name: /^Generate prompt from images/,
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
  chooseProduct();
  fireEvent.click(screen.getByRole("button", { name: "Add images" }));
  fireEvent.click(screen.getByRole("button", { name: "Image assets" }));
  fireEvent.click(screen.getByRole("button", { name: "Warm living room" }));
  fireEvent.click(screen.getByRole("button", { name: "Use selected images" }));
  expect(
    screen.getByRole("img", { name: "Reference 1: Studio lamp" })
  ).toBeTruthy();
  expect(
    screen.getByRole("img", { name: "Reference 2: Warm living room" })
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Browse themes" }));
  changeField(screen.getByLabelText("Search theme choices"), {
    target: { value: "Holiday" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Select Holiday" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  changeField(screen.getByRole("radiogroup", { name: "Mood" }), {
    target: { value: "warm" },
  });
  changeField(screen.getByRole("radiogroup", { name: "Art style" }), {
    target: { value: "cinematic" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: /^Generate prompt from images/ })
  );
  await waitFor(() =>
    expect(
      (screen.getByLabelText(/Describe your video/) as HTMLTextAreaElement)
        .value
    ).toContain("Orbit the lamp")
  );
  expect(api.prompt.mock.calls[0][0].setup).toMatchObject({
    imageKeys: ["product_image:11", "asset:21"],
    direction: { theme: "holiday", mood: "warm", artStyle: "cinematic" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Undo prompt" }));
  expect(
    (screen.getByLabelText(/Describe your video/) as HTMLTextAreaElement).value
  ).toBe("");
  changeField(screen.getByLabelText(/Describe your video/), {
    target: { value: "My edited camera direction." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(api.save).toHaveBeenCalledOnce());
  expect(api.save.mock.calls[0][0].setup).toMatchObject({
    prompt: "My edited camera direction.",
    imageKeys: ["product_image:11", "asset:21"],
    direction: { theme: "holiday", mood: "warm", artStyle: "cinematic" },
  });
  expect(api.generate).not.toHaveBeenCalled();
});
it("preserves edits made while a prompt is generating", async () => {
  let finish!: (value: { prompt: string }) => void;
  api.prompt.mockImplementation(
    () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
  render(<VideoStudio />);
  chooseProduct();
  fireEvent.click(
    screen.getByRole("button", { name: /^Generate prompt from images/ })
  );
  changeField(screen.getByLabelText(/Describe your video/), {
    target: { value: "Keep my latest edit" },
  });
  finish({ prompt: "A stale generated prompt" });
  await waitFor(() => expect(api.toast).toHaveBeenCalled());
  expect(
    (screen.getByLabelText(/Describe your video/) as HTMLTextAreaElement).value
  ).toBe("Keep my latest edit");
});
it("enforces a combined reference limit across sources", () => {
  function Picker() {
    const [selected, setSelected] = useState(["asset:21"]);
    return (
      <VideoReferencePicker
        organizationId={1}
        kind="images"
        assets={[]}
        selected={selected}
        limit={2}
        onChange={setSelected}
        onClose={vi.fn()}
        onUpload={vi.fn()}
      />
    );
  }
  render(<Picker />);
  fireEvent.click(
    screen.getByRole("checkbox", { name: /^Use 1 for Studio lamp/ })
  );
  expect(screen.getByText("2 / 2 selected")).toBeTruthy();
  expect(
    (
      screen.getByRole("checkbox", {
        name: /^Use 2 for Studio lamp/,
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
  fireEvent.click(
    screen.getByRole("checkbox", { name: /^Use 1 for Studio lamp/ })
  );
  expect(
    (
      screen.getByRole("checkbox", {
        name: /^Use 2 for Studio lamp/,
      }) as HTMLButtonElement
    ).disabled
  ).toBe(false);
});

it("retains ten references in the legacy Studio using selected provider budget", () => {
  api.search = "?video=saved-budget";
  api.current = {
    id: "saved-budget",
    revision: 1,
    status: "draft",
    setup: {
      ...defaultVideoSetup,
      modelId: DEFAULT_VIDEO_MODEL,
      imageKeys: Array.from({ length: 10 }, (_, i) => `asset:${i + 1}`),
    },
  };
  render(<VideoStudio />);
  expect(screen.getByText("10 / 30")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Remove image 10" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Add images" })).toBeTruthy();
});
it("retains incompatible saved references with guidance, removal and logo/people reservation", () => {
  const limited = generationModels.find(
    m => m.kind === "video" && imageReferenceBudget(m).total === 8
  )!;
  api.search = "?video=saved-budget";
  api.current = {
    id: "saved-budget",
    revision: 1,
    status: "draft",
    setup: {
      ...defaultVideoSetup,
      modelId: limited.id,
      imageKeys: Array.from({ length: 7 }, (_, i) => `asset:${i + 1}`),
      logoAssetId: 50,
      people: [{ kind: "library", id: "female-black-0" }],
    },
  };
  render(<VideoStudio />);
  expect(screen.getByText("7 / 6")).toBeTruthy();
  expect(
    screen.getByText(/Your selected references are retained/)
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Add images" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Remove image 7" }));
  expect(screen.getByText("6 / 6")).toBeTruthy();
  expect(
    screen.queryByText(/Your selected references are retained/)
  ).toBeNull();
});

it("does not silently truncate a legacy draft when switching operation", () => {
  api.search = "?video=saved-budget";
  api.current = {
    id: "saved-budget",
    revision: 1,
    status: "draft",
    setup: {
      ...defaultVideoSetup,
      modelId: undefined,
      imageKeys: Array.from({ length: 10 }, (_, i) => `asset:${i + 1}`),
    },
  };
  render(<VideoStudio />);
  fireEvent.click(screen.getByRole("button", { name: "Motion control" }));
  expect(screen.getByRole("button", { name: "Remove image 10" })).toBeTruthy();
  expect(screen.getByText("10 / 8")).toBeTruthy();
  expect(
    screen.getByText(/Your selected references are retained/)
  ).toBeTruthy();
});
