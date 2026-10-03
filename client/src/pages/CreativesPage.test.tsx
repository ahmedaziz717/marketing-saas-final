// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { contentSchema } from "@shared/channels";
const api = vi.hoisted(() => ({
  role: "owner",
  assets: [] as any[],
  posts: [] as any[],
  assetError: null as Error | null,
  studioQuery: vi.fn(),
  listQuery: vi.fn(),
  publishQuery: vi.fn(),
  refetch: vi.fn(),
}));
vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspace: () => ({ organizationId: 1, membership: { role: api.role } }),
}));
vi.mock("@/components/WorkspaceGate", () => ({
  WorkspaceGate: ({ children }: any) => children,
}));
vi.mock("@/components/CreativeBuilder", () => ({
  CreativeBuilder: () => <div>Image builder</div>,
}));
vi.mock("@/components/AssetWorkbench", () => ({
  AssetWorkbench: ({ detailsOnly, onDetailsClose }: any) => (
    <div>
      Asset details {String(detailsOnly)}
      <button onClick={onDetailsClose}>Close asset details</button>
    </div>
  ),
}));
vi.mock("@/components/AssetUploadDialog", () => ({
  AssetUploadDialog: () => <div>Upload dialog</div>,
}));
vi.mock("@/components/PublicationComposer", () => ({
  PublicationComposer: ({ initialChannel, onClose }: any) => (
    <div>
      Composer: {initialChannel}
      <button onClick={onClose}>Close composer</button>
    </div>
  ),
  PublicationStatus: ({ item }: any) => <span>{item.state}</span>,
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      assetLibrary: {
        list: { invalidate: vi.fn() },
        studioList: { invalidate: vi.fn() },
      },
      creatives: { overview: { invalidate: vi.fn() } },
      brand: { assets: { invalidate: vi.fn() } },
      activity: { list: { invalidate: vi.fn() } },
    }),
    video: { list: { useQuery: () => ({ data: [], refetch: api.refetch }) } },
    publishing: {
      list: {
        useQuery: (...args: any[]) => {
          api.publishQuery(...args);
          return { data: { items: api.posts }, refetch: api.refetch };
        },
      },
      get: {
        useQuery: (input: any) => ({
          data: api.posts.find(p => p.id === input.id),
        }),
      },
    },
    creatives: {
      overview: {
        useQuery: () => ({ data: { jobs: [] }, refetch: api.refetch }),
      },
    },
    assetLibrary: {
      studioList: {
        useQuery: (...args: any[]) => {
          api.studioQuery(...args);
          return {
            data: api.assets,
            error: api.assetError,
            refetch: api.refetch,
          };
        },
      },
      list: {
        useQuery: (...args: any[]) => {
          api.listQuery(...args);
          return {
            data: api.assets.filter(a => a.state === "approved"),
            refetch: api.refetch,
          };
        },
      },
    },
  },
}));
import CreativesPage from "./CreativesPage";
function setup(path = "/app/creatives") {
  const router = memoryLocation({ path, record: true });
  render(
    <Router hook={router.hook} searchHook={router.searchHook}>
      <CreativesPage />
    </Router>
  );
  return router;
}
const asset = (id: number, values: Record<string, any> = {}) => ({
  key: `asset:${id}`,
  name: `Image ${id}`,
  state: "draft",
  createdAtMs: id * 1000,
  reviewedAtMs: null,
  mediaType: "image",
  url: `/image-${id}.png`,
  campaignPlanId: 7,
  width: 1080,
  height: 1080,
  ...values,
});
const post = (
  id: string,
  channel = "facebook",
  values: Record<string, any> = {}
) => ({
  id,
  channel,
  state: "draft",
  content: contentSchema.parse({
    title: id,
    message: `Caption ${id}`,
    campaignPlanId: 7,
  }),
  updatedAtMs: 10000,
  assetKey: "asset:2",
  ...values,
});
beforeEach(() => {
  vi.clearAllMocks();
  api.role = "owner";
  api.assetError = null;
  api.assets = [
    asset(1, { name: "Emerald hero" }),
    asset(2, { state: "approved" }),
    asset(3, {
      name: "Returned gold photo",
      state: "changes_requested",
      campaignPlanId: 8,
    }),
    asset(4, { name: "Uploaded video", mediaType: "video" }),
  ];
  api.posts = [
    post("Facebook draft"),
    post("Ad draft", "meta_ads"),
    post("Scheduled post", "facebook", { state: "scheduled" }),
  ];
});
afterEach(cleanup);

it("offers only New content and Drafts, with four creation cards and no draft list on New content", () => {
  setup("/app/creatives?plan=7");
  const nav = within(
    screen.getByRole("navigation", { name: "Content Studio" })
  );
  expect(nav.getAllByRole("link").map(a => a.textContent)).toEqual([
    "New content",
    "Drafts",
  ]);
  expect(
    nav.getByRole("link", { name: "New content" }).getAttribute("aria-current")
  ).toBe("page");
  expect(
    screen.getByRole("link", { name: "Create an image" }).getAttribute("href")
  ).toBe("/app/creatives/images?plan=7");
  expect(
    screen
      .getByRole("link", { name: "Create a social post" })
      .getAttribute("href")
  ).toContain("social?new=1&plan=7");
  expect(
    screen.getByRole("link", { name: "Create an ad" }).getAttribute("href")
  ).toContain("ads?new=1&plan=7");
  expect(screen.queryByLabelText("Search drafts")).toBeNull();
  expect(screen.queryByText("Your drafts")).toBeNull();
  expect(api.publishQuery).not.toHaveBeenCalled();
  expect(api.studioQuery).not.toHaveBeenCalled();
});

it("combines working image, video, post and ad drafts while filtering out approved and scheduled records", () => {
  setup("/app/creatives/drafts");
  expect(screen.getAllByRole("article")).toHaveLength(5);
  expect(
    screen.queryByRole("article", { name: /Scheduled post|Image 2/ })
  ).toBeNull();
  expect(
    screen
      .getByRole("article", { name: "Social post: Facebook draft" })
      .querySelector("img")
      ?.getAttribute("src")
  ).toBe("/image-2.png");
  fireEvent.click(screen.getByRole("button", { name: "Images" }));
  expect(screen.getAllByRole("article")).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Social posts" }));
  expect(screen.getAllByRole("article")).toHaveLength(1);
  expect(
    screen.getByRole("article", { name: "Social post: Facebook draft" })
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Ads" }));
  expect(screen.getByRole("article", { name: "Ad: Ad draft" })).toBeTruthy();
});

it("preserves search, type and campaign context when opening and closing an image draft", () => {
  setup("/app/creatives/drafts?plan=7");
  expect(
    screen.queryByRole("article", { name: /Returned gold photo/ })
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Images" }));
  fireEvent.change(screen.getByLabelText("Search drafts"), {
    target: { value: "Emerald" },
  });
  const open = screen.getByRole("link", { name: "Open draft" });
  expect(open.getAttribute("href")).toBe(
    "/app/creatives/drafts?filter=images&plan=7&q=Emerald&asset=asset%3A1"
  );
  fireEvent.click(open);
  expect(screen.getByText(/Asset details true/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Close asset details" }));
  expect(screen.queryByText(/Asset details true/)).toBeNull();
  expect(
    (screen.getByLabelText("Search drafts") as HTMLInputElement).value
  ).toBe("Emerald");
  expect(
    screen.getByRole("button", { name: "Images" }).getAttribute("aria-pressed")
  ).toBe("true");
});

it("does not expose cached private image drafts to a publisher role", () => {
  api.role = "publisher";
  setup("/app/creatives/drafts");
  expect(api.studioQuery.mock.calls[0][1].enabled).toBe(false);
  expect(api.listQuery.mock.calls[0][1].enabled).toBe(true);
  expect(screen.getAllByRole("article")).toHaveLength(2);
  expect(screen.queryByRole("link", { name: "Open draft" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Upload media" })).toBeNull();
});

it("keeps available post drafts visible when image drafts fail to load", () => {
  api.assets = [];
  api.assetError = new Error("Unavailable");
  setup("/app/creatives/drafts");
  expect(screen.getByRole("alert").textContent).toContain(
    "Media drafts could not be loaded"
  );
  expect(screen.getAllByRole("article")).toHaveLength(2);
  expect(screen.queryByText("No drafts yet")).toBeNull();
});

it("retains older asset links and sends older social landing links to the correct draft filter", () => {
  setup("/app/creatives/saved?asset=asset%3A1");
  expect(screen.getByText(/Asset details true/)).toBeTruthy();
  expect(
    within(screen.getByRole("navigation", { name: "Content Studio" }))
      .getByRole("link", { name: "Drafts" })
      .getAttribute("aria-current")
  ).toBe("page");
  cleanup();
  setup("/app/creatives/social?plan=7");
  expect(
    screen
      .getByRole("button", { name: "Social posts" })
      .getAttribute("aria-pressed")
  ).toBe("true");
  expect(screen.getAllByRole("article")).toHaveLength(1);
});

it("opens the existing upload flow from Drafts", () => {
  setup("/app/creatives/drafts");
  fireEvent.click(screen.getByRole("button", { name: "Upload media" }));
  expect(screen.getByText("Upload dialog")).toBeTruthy();
});
