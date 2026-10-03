// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { contentSchema } from "@shared/channels";
import type { Publication } from "./PublicationComposer";

const api = vi.hoisted(() => ({
  save: vi.fn(),
  plan: undefined as any,
  accounts: [] as any[],
}));
vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspace: () => ({ organizationId: 1, membership: { role: "owner" } }),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      publishing: {
        list: { invalidate: vi.fn() },
        get: { invalidate: vi.fn() },
      },
    }),
    brand: { get: { useQuery: () => ({ data: undefined }) } },
    channels: {
      connections: { useQuery: () => ({ data: { items: api.accounts } }) },
    },
    assetLibrary: {
      list: {
        useQuery: () => ({
          data: [
            {
              key: "asset:1",
              name: "Approved photo",
              mediaType: "image",
              purpose: "finished",
              state: "approved",
              url: "/image.png",
            },
            {
              key: "asset:2",
              name: "Approved video",
              mediaType: "video",
              purpose: "finished",
              state: "approved",
              url: "/video.mp4",
            },
          ],
        }),
      },
    },
    publishing: {
      save: { useMutation: () => ({ mutate: api.save, isPending: false }) },
    },
    briefs: { get: { useQuery: () => ({ data: api.plan }) } },
  },
}));
vi.mock("./CampaignPlanSelect", () => ({
  CampaignPlanSelect: () => <span>Optional campaign plan</span>,
}));
vi.mock("./AdCampaignPicker", () => ({ AdCampaignPicker: () => null }));
vi.mock("./StudioMediaDialog", () => ({ StudioMediaDialog: () => null }));
vi.mock("./AdTextOptionsEditor", () => ({
  AdTextOptionsEditor: () => <span>Ad text options</span>,
}));
vi.mock("./AdCopyAssistant", () => ({
  AdCopyAssistant: ({ onUse }: any) => (
    <button
      onClick={() =>
        onUse({ message: "New AI caption", headline: "", description: "" })
      }
    >
      Use AI caption
    </button>
  ),
}));
vi.mock("./ApprovedAssetPicker", () => ({
  ApprovedAssetPicker: ({ onSelect, onClose }: any) => (
    <div>
      {[1, 2].map(id => (
        <button
          key={id}
          onClick={() => {
            onSelect([`asset:${id}`]);
            onClose();
          }}
        >
          Choose {id === 1 ? "photo" : "video"}
        </button>
      ))}
    </div>
  ),
}));
import { PublicationComposer } from "./PublicationComposer";

const baseProps = { onClose: vi.fn(), onSaved: vi.fn() };
const caption = () =>
  screen.getByLabelText("Post caption") as HTMLTextAreaElement;
const saveDraft = () =>
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
function chooseMedia(kind = "photo") {
  fireEvent.click(
    screen.getByRole("button", { name: "Browse approved assets" })
  );
  fireEvent.click(screen.getByRole("button", { name: `Choose ${kind}` }));
}
function legacy(content: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    revision: 2,
    channel: "facebook",
    assetKey: "asset:1",
    connectionId: "page",
    timezone: "UTC",
    content: contentSchema.parse({
      title: "Untitled post",
      message: "Our collection.",
      link: "https://example.com/shop",
      ...content,
    }),
  } as Publication;
}
beforeEach(() => {
  vi.clearAllMocks();
  api.plan = undefined;
  api.accounts = [
    {
      id: "page",
      channel: "facebook",
      name: "Our Page",
      status: "connected",
      expired: false,
      details: { capabilities: ["publish"] },
    },
  ];
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

it("leads with the caption and automatically moves a preview link when media is added, without losing it on removal", () => {
  render(<PublicationComposer {...baseProps} />);
  expect(
    caption().compareDocumentPosition(
      screen.getByRole("button", { name: "Browse approved assets" })
    ) & Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy();
  expect(screen.queryByText("Write caption with AI (optional)")).toBeNull();
  fireEvent.change(caption(), { target: { value: "See our collection." } });
  fireEvent.change(screen.getByLabelText("Website preview (optional)"), {
    target: { value: "https://example.com/shop" },
  });
  chooseMedia();
  expect(screen.queryByLabelText("Website preview (optional)")).toBeNull();
  expect(caption().value).toBe(
    "See our collection.\n\nhttps://example.com/shop"
  );
  expect(
    screen.getByText("Write caption with AI (optional)").closest("details")
      ?.open
  ).toBe(false);
  expect(screen.getByLabelText("Content preview").textContent).toContain(
    caption().value
  );
  fireEvent.click(screen.getByRole("button", { name: "Remove media" }));
  expect(
    (screen.getByLabelText("Website preview (optional)") as HTMLInputElement)
      .value
  ).toBe("");
  expect(caption().value).toContain("https://example.com/shop");
  saveDraft();
  expect(api.save.mock.calls[0][0]).toMatchObject({
    assetKey: null,
    content: {
      title: "See our collection.",
      message: "See our collection.\n\nhttps://example.com/shop",
      link: "",
    },
  });
});

it("repairs an older photo/link draft before editing and keeps its URL when AI copy is applied", () => {
  render(<PublicationComposer {...baseProps} item={legacy()} />);
  expect(caption().value).toContain("https://example.com/shop");
  expect(screen.queryByLabelText("Website preview (optional)")).toBeNull();
  fireEvent.click(screen.getByText("Write caption with AI (optional)"));
  fireEvent.click(screen.getByRole("button", { name: "Use AI caption" }));
  expect(caption().value).toBe("New AI caption\n\nhttps://example.com/shop");
  saveDraft();
  expect(api.save.mock.calls[0][0].content.link).toBe("");
  expect(api.save.mock.calls[0][0].content.message).toBe(caption().value);
});

it("merges a plan URL arriving after media selection into the caption", async () => {
  api.plan = {
    audience: "Customers",
    creativeDirection: "Browse the collection",
    offer: "",
    destinationUrl: "https://example.com/plan",
  };
  render(
    <PublicationComposer
      {...baseProps}
      initialAssetKey="asset:1"
      initialPlanId={7}
    />
  );
  await waitFor(() => expect(caption().value).toBe("https://example.com/plan"));
  expect(screen.queryByLabelText("Website preview (optional)")).toBeNull();
  saveDraft();
  expect(api.save.mock.calls[0][0].content.link).toBe("");
});

it("adds a valid website link directly to a video caption and hides image-only AI tools", () => {
  render(<PublicationComposer {...baseProps} />);
  chooseMedia("video");
  expect(screen.queryByText("Write caption with AI (optional)")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Add website link" }));
  fireEvent.change(screen.getByLabelText("Website URL"), {
    target: { value: "example.com/shop" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add to caption" }));
  expect(caption().value).toBe("https://example.com/shop");
  saveDraft();
  expect(api.save.mock.calls[0][0]).toMatchObject({
    assetKey: "asset:2",
    content: { link: "", message: "https://example.com/shop" },
  });
});

it("allows incomplete drafts but shows actionable required fields before continuing", () => {
  render(<PublicationComposer {...baseProps} />);
  fireEvent.click(screen.getByRole("button", { name: "Save & continue" }));
  expect(api.save).not.toHaveBeenCalled();
  expect(
    screen.getAllByText("Choose a connected Facebook Page before continuing.")
      .length
  ).toBeGreaterThan(0);
  saveDraft();
  expect(api.save).toHaveBeenCalledOnce();
  expect(api.save.mock.calls[0][0].content.title).toBe("Facebook post");
  api.save.mockClear();
  fireEvent.change(screen.getByLabelText("Social account"), {
    target: { value: "page" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save & continue" }));
  expect(api.save).not.toHaveBeenCalled();
  expect(caption().getAttribute("aria-invalid")).toBe("true");
  fireEvent.change(caption(), { target: { value: "Ready for review." } });
  fireEvent.click(screen.getByRole("button", { name: "Save & continue" }));
  expect(api.save).toHaveBeenCalledOnce();
});

it("does not truncate an older caption when moving its link, and blocks an oversize save", () => {
  render(
    <PublicationComposer
      {...baseProps}
      item={legacy({ message: "x".repeat(5000) })}
    />
  );
  expect(caption().value.length).toBeGreaterThan(5000);
  expect(caption().value).toContain("https://example.com/shop");
  saveDraft();
  expect(api.save).not.toHaveBeenCalled();
  expect(
    screen.getByText(
      "Your caption is over 5,000 characters. Shorten it before saving."
    )
  ).toBeTruthy();
});

it.each(["media", "link"])(
  "allows a %s post without an optional caption",
  kind => {
    const item = {
      ...legacy({
        message: "",
        link: kind === "link" ? "https://example.com" : "",
      }),
      assetKey: kind === "media" ? "asset:1" : null,
    };
    render(<PublicationComposer {...baseProps} item={item} />);
    expect(caption().getAttribute("aria-required")).toBe("false");
    expect(screen.queryByText("Your text will appear here.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save & continue" }));
    expect(api.save).toHaveBeenCalledOnce();
    expect(api.save.mock.calls[0][0].content.message).toBe("");
  }
);

it("keeps the destination URL separate for paid ads", () => {
  render(
    <PublicationComposer
      {...baseProps}
      initialChannel="meta_ads"
      initialAssetKey="asset:1"
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "Continue to creative" }));
  expect(screen.queryByLabelText("Post caption")).toBeNull();
  fireEvent.change(screen.getByLabelText("Destination URL"), {
    target: { value: "https://example.com/ad" },
  });
  saveDraft();
  expect(api.save.mock.calls[0][0].content.link).toBe("https://example.com/ad");
});
