// @vitest-environment jsdom
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
    },
    {
      key: "product_image:12",
      name: "Studio lamp",
      detail: "Side angle",
      url: "/lamp-side.png",
      origin: "catalog" as const,
    },
  ],
}));
vi.mock("wouter", () => ({
  useSearch: () => "",
  useLocation: () => ["/app/creatives/video", vi.fn()],
  Link: ({ children, href }: any) => <a href={href}>{children}</a>,
}));
vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspace: () => ({ organizationId: 1, membership: { role: "owner" } }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), info: api.toast } }));
vi.mock("./AssetUploadDialog", () => ({ AssetUploadDialog: () => null }));
vi.mock("./LifestylePersonPicker", () => ({
  LifestylePersonPicker: () => null,
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
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
      get: { useQuery: () => ({ data: undefined }) },
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
import { VideoStudio } from "./VideoStudio";
import { VideoReferencePicker } from "./VideoReferencePicker";
beforeEach(() => {
  vi.clearAllMocks();
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
    screen.getByRole("button", { name: "Studio lamp · Front angle" })
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
  fireEvent.change(screen.getByLabelText("Search creative themes"), {
    target: { value: "Holiday" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Holiday" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.change(screen.getByLabelText("Mood"), {
    target: { value: "warm" },
  });
  fireEvent.change(screen.getByLabelText("Art style"), {
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
  fireEvent.change(screen.getByLabelText(/Describe your video/), {
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
  fireEvent.change(screen.getByLabelText(/Describe your video/), {
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
    screen.getByRole("button", { name: "Studio lamp · Front angle" })
  );
  expect(screen.getByText("2 / 2 selected")).toBeTruthy();
  expect(
    (
      screen.getByRole("button", {
        name: "Studio lamp · Side angle",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
  fireEvent.click(
    screen.getByRole("button", { name: "Studio lamp · Front angle" })
  );
  expect(
    (
      screen.getByRole("button", {
        name: "Studio lamp · Side angle",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(false);
});
