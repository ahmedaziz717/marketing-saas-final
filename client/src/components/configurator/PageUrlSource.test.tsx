// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PageUrlSource } from "./PageUrlSource";
import { defaultCreativeSetup } from "@shared/creativeBuilder";
import { defaultVideoSetup } from "@shared/videoCreation";
const api = vi.hoisted(() => ({
  preview: vi.fn(),
  import: vi.fn(),
  page: undefined as any,
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    catalogSources: {
      previewPage: {
        useMutation: () => ({
          mutateAsync: api.preview,
          data: api.page,
          reset: vi.fn(),
        }),
      },
      addEntries: { useMutation: () => ({ mutateAsync: api.import }) },
    },
  },
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
beforeEach(() => {
  vi.clearAllMocks();
  api.page = {
    title: "Homeschool style quiz",
    description: "Explore approaches to learning.",
    pageContent:
      "Answer 12 questions about your family's routines and learning preferences.",
    url: "https://learn.example.test/quiz/",
    imageUrl: "",
    product: null,
  };
  api.preview.mockImplementation(async () => api.page);
  api.import.mockResolvedValue([{}]);
});
afterEach(cleanup);
function setup(kind: "image" | "video" = "image", saved?: any) {
  const updateImage = vi.fn(),
    updateVideo = vi.fn();
  render(
    <PageUrlSource
      organizationId={3}
      kind={kind}
      image={{
        ...defaultCreativeSetup(),
        preserveProduct: true,
        ...(saved ? { promotionMode: "platform", promotion: saved } : {}),
      }}
      video={defaultVideoSetup}
      updateImage={updateImage}
      updateVideo={updateVideo}
      onUploaded={async () => {}}
      onManual={vi.fn()}
    />
  );
  return { updateImage, updateVideo };
}
async function readPage() {
  fireEvent.change(screen.getByLabelText("Page URL"), {
    target: { value: "https://learn.example.test/quiz/" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Get page details" }));
  await screen.findByRole("link", { name: "View source page" });
}
it("offers the three types and applies editable quiz context without a catalog import", async () => {
  const { updateImage } = setup();
  fireEvent.click(screen.getByRole("button", { name: /General promotion/ }));
  await readPage();
  fireEvent.change(screen.getByLabelText("Promotion title"), {
    target: { value: "Discover your homeschool style" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Use page for promotion" })
  );
  expect(updateImage).toHaveBeenCalledWith(
    expect.objectContaining({
      promotionMode: "platform",
      products: [],
      preserveProduct: false,
      promotion: {
        kind: "general",
        title: "Discover your homeschool style",
        description: api.page.description,
        sourceUrl: api.page.url,
        pageContent: api.page.pageContent,
      },
    })
  );
  expect(api.import).not.toHaveBeenCalled();
  expect(
    screen.getByRole("button", { name: "Page added to brief" })
  ).toBeTruthy();
});
it("lets a non-product preview switch type without fetching or importing again", async () => {
  setup("video");
  await readPage();
  expect(
    screen.getByText(/does not appear to be a catalog product/)
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /^Service/ }));
  expect(screen.getByLabelText("Promotion title")).toBeTruthy();
  expect(api.preview).toHaveBeenCalledTimes(1);
});
it("retains the product review path", async () => {
  api.page.product = {
    name: "Lamp",
    description: "Desk lamp",
    productUrl: "https://shop.example.test/lamp/",
  };
  setup();
  await readPage();
  fireEvent.click(
    screen.getByRole("button", { name: "Add to catalog for review" })
  );
  await waitFor(() =>
    expect(api.import).toHaveBeenCalledWith({
      organizationId: 3,
      entries: [api.page.product],
    })
  );
  expect(
    await screen.findByRole("link", { name: "Review and approve the product" })
  ).toBeTruthy();
});
it("restores saved page context and clears stale preview when its URL changes", () => {
  setup("image", {
    kind: "general",
    title: "Saved quiz",
    description: "Saved facts",
    sourceUrl: api.page.url,
  });
  expect(
    (screen.getByLabelText("Promotion title") as HTMLInputElement).value
  ).toBe("Saved quiz");
  fireEvent.change(screen.getByLabelText("Page URL"), {
    target: { value: "https://other.example.test" },
  });
  expect(
    screen.queryByRole("button", { name: "Use page for promotion" })
  ).toBeNull();
});
it("carries reviewed service context into video configuration", async () => {
  const { updateVideo } = setup("video");
  fireEvent.click(screen.getByRole("button", { name: /^Service/ }));
  await readPage();
  fireEvent.click(
    screen.getByRole("button", { name: "Use page for promotion" })
  );
  expect(updateVideo).toHaveBeenCalledWith(
    expect.objectContaining({
      promotion: expect.objectContaining({
        kind: "service",
        sourceUrl: api.page.url,
      }),
      imageKeys: [],
    })
  );
});
