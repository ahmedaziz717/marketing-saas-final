vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: 10 } }),
}));
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
import { contentSchema } from "@shared/channels";
import { studioDraftKey, writeStudioDraft } from "@/lib/studioDrafts";
import { PROMPT_REGISTRY } from "@shared/promptRegistry";
const promptDefaults = PROMPT_REGISTRY.map(p => ({
  ...p,
  value: p.baseline,
  revision: 0,
  source: "system",
  updatedAtMs: null,
}));
import type { Publication } from "./PublicationComposer";

const api = vi.hoisted(() => ({
  save: vi.fn(),
  saveOptions: {} as any,
  reviewAsync: vi.fn(),
  submitAsync: vi.fn(),
  plan: undefined as any,
  brand: undefined as any,
  accounts: [] as any[],
  connectionsLoading: false,
  connectionsFetching: false,
  connectionsError: null as null | { message: string },
  connectionsAvailable: true,
  role: "owner",
  liveSocial: true,
  review: vi.fn(),
  queue: vi.fn(),
  submit: vi.fn(),
  retry: vi.fn(),
  resetFailed: vi.fn(),
}));
vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspace: () => ({ organizationId: 1, membership: { role: api.role } }),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    prompts: {
      list: { useQuery: () => ({ data: promptDefaults }) },
      change: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
    useUtils: () => ({
      prompts: { list: { invalidate: vi.fn() } },
      publishing: {
        list: { invalidate: vi.fn() },
        get: { invalidate: vi.fn() },
        history: { invalidate: vi.fn() },
      },
    }),
    brand: { get: { useQuery: () => ({ data: api.brand }) } },
    models: { credits: { useQuery: () => ({ data: { textEstimate: 1 } }) } },
    channels: {
      accountImage: { useQuery: () => ({ data: {} }) },
      draftAssetCopy: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      connections: {
        useQuery: () => ({
          data: api.connectionsAvailable
            ? {
                items: api.accounts,
                liveSocial: api.liveSocial,
                liveAds: api.liveSocial,
              }
            : undefined,
          isLoading: api.connectionsLoading,
          isFetching: api.connectionsFetching,
          error: api.connectionsError,
          refetch: vi.fn(),
        }),
      },
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
      save: {
        useMutation: (options: any) => {
          api.saveOptions = options;
          return { mutate: api.save, isPending: false };
        },
      },
      review: {
        useMutation: () => ({
          mutate: api.review,
          mutateAsync: api.reviewAsync,
          isPending: false,
        }),
      },
      queue: { useMutation: () => ({ mutate: api.queue, isPending: false }) },
      submit: {
        useMutation: () => ({
          mutate: api.submit,
          mutateAsync: api.submitAsync,
          isPending: false,
        }),
      },
      history: { useQuery: () => ({ data: [] }) },
      cancel: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      retry: { useMutation: () => ({ mutate: api.retry, isPending: false }) },
      resetFailed: {
        useMutation: () => ({ mutate: api.resetFailed, isPending: false }),
      },
      reconcile: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
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
import { PublicationComposer, PublicationDetails } from "./PublicationComposer";

const baseProps = { onClose: vi.fn(), onSaved: vi.fn() };
const caption = () =>
  screen.getByLabelText("Post caption") as HTMLTextAreaElement;
const saveDraft = () =>
  clickJourney(screen.getByRole("button", { name: "Save draft" }));
function chooseMedia(kind = "photo") {
  clickJourney(screen.getByRole("button", { name: "Browse approved assets" }));
  clickJourney(screen.getByRole("button", { name: `Choose ${kind}` }));
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
  localStorage.clear();
  localStorage.clear();
  vi.clearAllMocks();
  api.connectionsLoading = false;
  api.connectionsFetching = false;
  api.connectionsError = null;
  api.connectionsAvailable = true;
  api.plan = undefined;
  api.brand = undefined;
  api.role = "owner";
  api.liveSocial = true;
  api.reviewAsync
    .mockReset()
    .mockResolvedValue({ success: true, liveEnabled: true });
  api.submitAsync.mockReset().mockResolvedValue({ success: true });
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

function deliveryItem(overrides: Partial<Publication> = {}) {
  return {
    ...legacy({ link: "" }),
    assetKey: null,
    state: "draft",
    scheduledAtMs: Date.now() + 86400000,
    result: null,
    ...overrides,
  } as Publication;
}
function showDetails(item = deliveryItem()) {
  const onEdit = vi.fn();
  render(<PublicationDetails item={item} onClose={vi.fn()} onEdit={onEdit} />);
  return onEdit;
}

it("confirms the Page and time before approving and scheduling in a single request", () => {
  const item = deliveryItem({ timezone: "America/New_York" });
  showDetails(item);
  expect(screen.getByText("Time selected — not scheduled")).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Approve publication" })
  ).toBeNull();
  clickJourney(screen.getByRole("button", { name: "Approve & schedule" }));
  expect(api.review).not.toHaveBeenCalled();
  expect(api.queue).not.toHaveBeenCalled();
  const confirmation = within(
    screen.getByRole("dialog", { name: "Approve & schedule" })
  );
  expect(confirmation.getByText("Our Page")).toBeTruthy();
  expect(confirmation.getByText(/America\/New_York/)).toBeTruthy();
  clickJourney(
    confirmation.getByRole("button", { name: "Approve & schedule" })
  );
  expect(api.review).toHaveBeenCalledWith(
    expect.objectContaining({
      id: item.id,
      revision: item.revision,
      decision: "approved",
      delivery: { confirm: true, mode: "live" },
    })
  );
  expect(api.queue).not.toHaveBeenCalled();
});

it("makes immediate publishing explicit and allows backing out without an approval or send", () => {
  showDetails(deliveryItem({ scheduledAtMs: null }));
  clickJourney(screen.getByRole("button", { name: "Approve & publish now" }));
  const confirmation = within(
    screen.getByRole("dialog", { name: "Approve & publish now" })
  );
  expect(confirmation.getByText(/as soon as it is processed/)).toBeTruthy();
  clickJourney(confirmation.getByRole("button", { name: "Go back" }));
  expect(api.review).not.toHaveBeenCalled();
  expect(api.queue).not.toHaveBeenCalled();
});

it("shows existing approvals as not scheduled and only queues after a separate explicit confirmation", () => {
  showDetails(deliveryItem({ state: "approved" }));
  expect(screen.getByText("Approved · Not scheduled")).toBeTruthy();
  expect(api.queue).not.toHaveBeenCalled();
  clickJourney(screen.getByRole("button", { name: "Schedule post" }));
  clickJourney(
    within(screen.getByRole("dialog", { name: "Schedule post" })).getByRole(
      "button",
      { name: "Schedule post" }
    )
  );
  expect(api.queue).toHaveBeenCalledWith(
    expect.objectContaining({ confirm: true, mode: "live" })
  );
  expect(api.review).not.toHaveBeenCalled();
});

it("shows scheduled posts as automatic with change-schedule controls and no second scheduling action", () => {
  const onEdit = showDetails(
    deliveryItem({ state: "scheduled", result: { deliveryMode: "live" } })
  );
  expect(screen.getByText(/No further action is needed/)).toBeTruthy();
  expect(
    screen.queryByRole("button", {
      name: /Schedule post|Approve & schedule|Schedule delivery/,
    })
  ).toBeNull();
  clickJourney(screen.getByRole("button", { name: "Change schedule" }));
  expect(onEdit).toHaveBeenCalledTimes(1);
});

it("blocks activation when a selected time has passed and keeps delivery settings available", () => {
  const onEdit = showDetails(
    deliveryItem({ state: "approved", scheduledAtMs: Date.now() - 60000 })
  );
  expect(screen.getByRole("alert").textContent).toContain(
    "selected time has passed"
  );
  expect(
    (screen.getByRole("button", { name: "Schedule post" }) as HTMLButtonElement)
      .disabled
  ).toBe(true);
  clickJourney(screen.getByRole("button", { name: "Delivery settings" }));
  expect(onEdit).toHaveBeenCalledTimes(1);
  expect(api.queue).not.toHaveBeenCalled();
});

it("keeps creators on the request-approval flow", () => {
  api.role = "creator";
  showDetails();
  expect(screen.queryByRole("button", { name: /Approve &/ })).toBeNull();
  clickJourney(
    screen.getByRole("button", { name: "Submit for publishing approval" })
  );
  expect(api.submit).toHaveBeenCalledTimes(1);
  expect(api.review).not.toHaveBeenCalled();
});

it("clearly labels test schedules and explicitly confirms test mode", () => {
  api.liveSocial = false;
  showDetails();
  clickJourney(
    screen.getByRole("button", { name: "Approve & save test schedule" })
  );
  const confirmation = within(
    screen.getByRole("dialog", { name: "Approve & save test schedule" })
  );
  expect(confirmation.getByText(/No content will be sent/)).toBeTruthy();
  clickJourney(
    confirmation.getByRole("button", { name: "Approve & save test schedule" })
  );
  expect(api.review).toHaveBeenCalledWith(
    expect.objectContaining({ delivery: { confirm: true, mode: "test" } })
  );
});

it("does not describe an already published post as awaiting scheduling", () => {
  showDetails(
    deliveryItem({ state: "published", result: { deliveryMode: "live" } })
  );
  expect(screen.queryByText(/not scheduled/i)).toBeNull();
  expect(
    screen.queryByRole("button", { name: /Schedule post|Approve & schedule/ })
  ).toBeNull();
});

it("leads with the caption and automatically moves a preview link when media is added, without losing it on removal", () => {
  render(<PublicationComposer {...baseProps} />);
  expect(
    caption().compareDocumentPosition(
      screen.getByRole("button", { name: "Browse approved assets" })
    ) & Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy();
  expect(screen.queryByText("Write caption with AI (optional)")).toBeNull();
  changeField(caption(), { target: { value: "See our collection." } });
  changeField(screen.getByLabelText("Website preview (optional)"), {
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
  clickJourney(screen.getByRole("button", { name: "Remove media" }));
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
  clickJourney(screen.getByText("Write caption with AI (optional)"));
  clickJourney(screen.getByRole("button", { name: "Use AI caption" }));
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
  clickJourney(screen.getByRole("button", { name: "Add website link" }));
  changeField(screen.getByLabelText("Website URL"), {
    target: { value: "example.com/shop" },
  });
  clickJourney(screen.getByRole("button", { name: "Add to caption" }));
  expect(caption().value).toBe("https://example.com/shop");
  saveDraft();
  expect(api.save.mock.calls[0][0]).toMatchObject({
    assetKey: "asset:2",
    content: { link: "", message: "https://example.com/shop" },
  });
});

it("allows incomplete drafts but shows actionable required fields before continuing", () => {
  api.accounts.push({ ...api.accounts[0], id: "page2", name: "Other Page" });
  render(<PublicationComposer {...baseProps} />);
  clickJourney(screen.getByRole("button", { name: "Save & continue" }));
  expect(api.save).not.toHaveBeenCalled();
  expect(
    screen.getAllByText("Choose a connected Facebook Page before continuing.")
      .length
  ).toBeGreaterThan(0);
  saveDraft();
  expect(api.save).toHaveBeenCalledOnce();
  expect(api.save.mock.calls[0][0].content.title).toBe("Facebook post");
  api.save.mockClear();
  changeField(screen.getByRole("radiogroup", { name: "Social account" }), {
    target: { value: "page" },
  });
  clickJourney(screen.getByRole("button", { name: "Save & continue" }));
  expect(api.save).not.toHaveBeenCalled();
  expect(caption().getAttribute("aria-invalid")).toBe("true");
  changeField(caption(), { target: { value: "Ready for review." } });
  clickJourney(screen.getByRole("button", { name: "Save & continue" }));
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
    clickJourney(screen.getByRole("button", { name: "Save & continue" }));
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
  clickJourney(screen.getByRole("button", { name: "Continue to creative" }));
  expect(screen.queryByLabelText("Post caption")).toBeNull();
  changeField(screen.getByLabelText("Destination URL"), {
    target: { value: "https://example.com/ad" },
  });
  saveDraft();
  expect(api.save.mock.calls[0][0].content.link).toBe("https://example.com/ad");
});

it("keeps a Studio social draft intact across steps and saves timing without approving or sending", () => {
  render(
    <PublicationComposer
      {...baseProps}
      studio
      initialChannel="facebook"
      initialAssetKey="asset:1"
    />
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByRole("button", { name: "Select Our Page" })).toBeNull();
  clickJourney(screen.getByRole("button", { name: /Copy Words & AI/ }));
  clickJourney(screen.getByRole("button", { name: "Open Compose category" }));
  changeField(caption(), {
    target: { value: "Our new collection is here." },
  });
  clickJourney(screen.getByRole("button", { name: /Timing Plan delivery/ }));
  changeField(screen.getByLabelText("Time zone"), {
    target: { value: "UTC" },
  });
  changeField(screen.getByLabelText("Publish date and time"), {
    target: { value: "2099-06-15T12:30" },
  });
  clickJourney(screen.getByRole("button", { name: /Copy Words & AI/ }));
  expect(caption().value).toBe("Our new collection is here.");
  clickJourney(
    screen.getByRole("button", { name: /Review & activate Confirm delivery/ })
  );
  clickJourney(screen.getByRole("button", { name: "Save draft" }));
  expect(api.save).toHaveBeenCalledWith(
    expect.objectContaining({
      connectionId: "page",
      assetKey: "asset:1",
      timezone: "UTC",
      scheduledAtMs: new Date("2099-06-15T12:30:00Z").getTime(),
      content: expect.objectContaining({
        message: "Our new collection is here.",
      }),
    })
  );
  expect(api.review).not.toHaveBeenCalled();
  expect(api.queue).not.toHaveBeenCalled();
});

it("counts only eligible Pages and omits read-only and expired choices", () => {
  api.accounts.push({
    ...api.accounts[0],
    id: "read",
    name: "Read only Page",
    details: { capabilities: ["read"] },
  });
  api.accounts.push({
    ...api.accounts[0],
    id: "expired",
    name: "Expired Page",
    expired: true,
  });
  render(<PublicationComposer {...baseProps} studio />);
  expect(
    screen.queryByRole("button", { name: "Select Read only Page" })
  ).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Select Expired Page" })
  ).toBeNull();
  expect(screen.queryByRole("button", { name: "Select Our Page" })).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Open Facebook Page category" })
  ).toBeNull();
  saveDraft();
  expect(api.save).toHaveBeenCalledWith(
    expect.objectContaining({ connectionId: "page" })
  );
});

it("uses edited Studio timing for existing drafts and blocks dates in the past", () => {
  render(<PublicationComposer {...baseProps} studio item={deliveryItem()} />);
  clickJourney(screen.getByRole("button", { name: /Timing Plan delivery/ }));
  changeField(screen.getByLabelText("Publish date and time"), {
    target: { value: "2000-01-01T12:00" },
  });
  saveDraft();
  expect(api.save).not.toHaveBeenCalled();
  clickJourney(
    screen.getByRole("button", { name: "Select After confirmation" })
  );
  saveDraft();
  expect(api.save).toHaveBeenCalledWith(
    expect.objectContaining({ scheduledAtMs: null })
  );
});

it("does not discard the selected ad image when its selected format tile is clicked again", () => {
  render(
    <PublicationComposer
      {...baseProps}
      studio
      initialChannel="meta_ads"
      initialAssetKey="asset:1"
    />
  );
  clickJourney(
    screen.getByRole("button", { name: /Creative Assets & format/ })
  );
  clickJourney(screen.getByRole("button", { name: "Select Single image" }));
  saveDraft();
  expect(api.save).toHaveBeenCalledWith(
    expect.objectContaining({ assetKey: "asset:1" })
  );
});

it("saves copy direction and the selected Meta CTA, preserves them across sections and never publishes", () => {
  render(
    <PublicationComposer
      {...baseProps}
      studio
      initialChannel="meta_ads"
      initialAssetKey="asset:1"
    />
  );
  clickJourney(screen.getByRole("button", { name: /Copy Words & AI/ }));
  const copyCategories = within(
    document.querySelector(".journey-categories") as HTMLElement
  );
  expect(
    copyCategories
      .getAllByRole("button")
      .slice(0, 9)
      .map(
        button => button.querySelector(".journey-category-name")?.textContent
      )
  ).toEqual([
    "Messaging style",
    "Messaging angle",
    "Emotional tone",
    "Benefits vs. features",
    "Urgency",
    "Offer framing",
    "Specificity",
    "Copy length",
    "Brief",
  ]);
  expect(
    copyCategories
      .getByRole("button", { name: "Open Messaging style category" })
      .getAttribute("aria-current")
  ).toBe("true");
  clickJourney(screen.getByRole("button", { name: "Select Playful" }));
  clickJourney(screen.getByRole("button", { name: "Open Compose category" }));
  clickJourney(screen.getByText("Call to action: LEARN MORE"));
  clickJourney(screen.getByRole("button", { name: "Select Subscribe" }));
  clickJourney(
    screen.getByRole("button", { name: /Creative Assets & format/ })
  );
  clickJourney(screen.getByRole("button", { name: /Copy Words & AI/ }));
  expect(
    screen
      .getByRole("button", { name: "Select Subscribe" })
      .getAttribute("aria-pressed")
  ).toBe("true");
  saveDraft();
  expect(api.save).toHaveBeenCalledWith(
    expect.objectContaining({
      content: expect.objectContaining({
        callToAction: "SUBSCRIBE",
        copyDirection: { messaging_style: ["playful"] },
      }),
    })
  );
  expect(api.queue).not.toHaveBeenCalled();
  expect(api.review).not.toHaveBeenCalled();
});

it("navigates copy categories, filters selected tiles, and saves the brief without overwriting user inputs", () => {
  api.brand = {
    businessProfile: {
      audiences: "Brand audience",
      goals: "Drive sales",
      primaryOffer: "Brand offer",
    },
  };
  render(
    <PublicationComposer
      {...baseProps}
      studio
      initialChannel="meta_ads"
      initialAssetKey="asset:1"
    />
  );
  clickJourney(screen.getByRole("button", { name: /Copy Words & AI/ }));
  expect(screen.queryByRole("group", { name: "Copy attributes" })).toBeNull();
  clickJourney(screen.getByRole("button", { name: "Select Playful" }));
  clickJourney(screen.getByRole("button", { name: "Selected (1)" }));
  expect(
    screen.queryByRole("button", { name: "Select Provocative" })
  ).toBeNull();
  clickJourney(screen.getByRole("button", { name: "Next category" }));
  clickJourney(screen.getByRole("button", { name: "Previous category" }));
  expect(
    screen
      .getByRole("button", { name: "Select Playful" })
      .getAttribute("aria-pressed")
  ).toBe("true");
  clickJourney(screen.getByRole("button", { name: "Let AI choose" }));
  expect(
    screen
      .getByRole("button", { name: "AI chooses ✓" })
      .getAttribute("aria-pressed")
  ).toBe("true");
  expect(
    screen.queryByRole("button", { name: /Create copy with AI/ })
  ).toBeNull();
  clickJourney(screen.getByRole("button", { name: "Open Brief category" }));
  changeField(screen.getByLabelText("Audience"), {
    target: { value: "My audience" },
  });
  clickJourney(screen.getByRole("button", { name: "Fill from brand" }));
  expect((screen.getByLabelText("Audience") as HTMLTextAreaElement).value).toBe(
    "My audience"
  );
  expect((screen.getByLabelText("Goal") as HTMLTextAreaElement).value).toBe(
    "Drive sales"
  );
  changeField(screen.getByLabelText("Additional instructions (optional)"), {
    target: { value: "Use only verified claims." },
  });
  clickJourney(screen.getByRole("button", { name: "Next category" }));
  clickJourney(screen.getByRole("button", { name: "Previous category" }));
  expect(
    (
      screen.getByLabelText(
        "Additional instructions (optional)"
      ) as HTMLTextAreaElement
    ).value
  ).toBe("Use only verified claims.");
  saveDraft();
  expect(api.save).toHaveBeenCalledWith(
    expect.objectContaining({
      content: expect.objectContaining({
        copyInstructions: "Use only verified claims.",
        promotion: {
          audience: "My audience",
          goal: "Drive sales",
          offer: "Brand offer",
        },
      }),
    })
  );
  expect(api.queue).not.toHaveBeenCalled();
});

async function completeSave(revision = 1) {
  const request = api.save.mock.calls.at(-1)![0];
  await act(async () => {
    await api.saveOptions.onSuccess({
      ...deliveryItem(),
      ...request,
      revision,
      state: "draft",
      result: null,
    });
  });
}
it("keeps the Studio on Compose after saving and uses the saved revision on subsequent saves", async () => {
  const onSaved = vi.fn();
  render(
    <PublicationComposer
      {...baseProps}
      onSaved={onSaved}
      studio
      initialChannel="facebook"
      initialAssetKey="asset:1"
    />
  );
  clickJourney(screen.getByRole("button", { name: /Copy Words & AI/ }));
  clickJourney(screen.getByRole("button", { name: "Open Compose category" }));
  changeField(caption(), { target: { value: "First draft" } });
  saveDraft();
  await completeSave(1);
  expect(screen.getByRole("heading", { name: "Compose" })).toBeTruthy();
  expect(screen.getByText("Saved", { exact: true })).toBeTruthy();
  changeField(caption(), { target: { value: "Edited draft" } });
  expect(screen.getByText("Unsaved changes", { exact: true })).toBeTruthy();
  saveDraft();
  expect(api.save.mock.calls.at(-1)![0].revision).toBe(1);
  await completeSave(2);
  expect(api.reviewAsync).not.toHaveBeenCalled();
  expect(onSaved.mock.calls.at(-1)![1]).toBeUndefined();
});
it("saves the reviewed version and publishes once from Studio with the new revision", async () => {
  const onSaved = vi.fn();
  render(
    <PublicationComposer
      {...baseProps}
      onSaved={onSaved}
      studio
      item={deliveryItem({ scheduledAtMs: null })}
      studioEntry={{ section: "preview", visit: 1 }}
    />
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  const publish = screen.getByRole("button", {
    name: "Publish now",
  });
  clickJourney(publish);
  clickJourney(publish);
  expect(api.save).toHaveBeenCalledOnce();
  expect(api.reviewAsync).not.toHaveBeenCalled();
  await completeSave(3);
  expect(api.reviewAsync).toHaveBeenCalledWith(
    expect.objectContaining({
      revision: 3,
      decision: "approved",
      delivery: { confirm: true, mode: "live" },
    })
  );
  expect(api.reviewAsync).toHaveBeenCalledOnce();
  expect(onSaved).toHaveBeenCalledWith(
    expect.any(String),
    "activate",
    "facebook",
    expect.objectContaining({ revision: 4, state: "scheduled" })
  );
});
it("uses test mode explicitly and sends creator drafts for approval instead of publishing", async () => {
  api.liveSocial = false;
  render(
    <PublicationComposer
      {...baseProps}
      studio
      item={deliveryItem()}
      studioEntry={{ section: "preview", visit: 1 }}
    />
  );
  clickJourney(screen.getByRole("button", { name: "Save test schedule" }));
  await completeSave(3);
  expect(api.reviewAsync.mock.calls[0][0].delivery.mode).toBe("test");
  cleanup();
  api.reviewAsync.mockClear();
  api.role = "creator";
  render(
    <PublicationComposer
      {...baseProps}
      studio
      item={deliveryItem()}
      studioEntry={{ section: "preview", visit: 1 }}
    />
  );
  clickJourney(screen.getByRole("button", { name: "Submit for approval" }));
  await completeSave(3);
  expect(api.submitAsync).toHaveBeenCalledWith(
    expect.objectContaining({ revision: 3 })
  );
  expect(api.reviewAsync).not.toHaveBeenCalled();
});
it("keeps the saved draft and shows an inline error when activation fails", async () => {
  api.reviewAsync.mockRejectedValue(
    new Error("Publishing availability changed")
  );
  const onSaved = vi.fn();
  render(
    <PublicationComposer
      {...baseProps}
      onSaved={onSaved}
      studio
      item={deliveryItem()}
      studioEntry={{ section: "preview", visit: 1 }}
    />
  );
  clickJourney(screen.getByRole("button", { name: "Schedule post" }));
  await completeSave(3);
  expect(screen.getByRole("alert").textContent).toContain(
    "Publishing availability changed"
  );
  expect(onSaved.mock.calls.at(-1)![1]).toBeUndefined();
  clickJourney(screen.getByRole("button", { name: "Schedule post" }));
  expect(api.save.mock.calls.at(-1)![0].revision).toBe(3);
});
it("renders delivery status inside Studio without the old review dialog", () => {
  render(
    <PublicationDetails
      inline
      item={deliveryItem({ state: "scheduled" })}
      onClose={vi.fn()}
      onEdit={vi.fn()}
    />
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(
    screen.getByRole("region", { name: "Activation status" })
  ).toBeTruthy();
  expect(screen.getByRole("region", { name: "Content preview" })).toBeTruthy();
});
it("creates a Meta ad paused through the same confirmed Studio delivery action", async () => {
  api.accounts = [
    {
      id: "ad",
      channel: "meta_ads",
      name: "Ad account",
      status: "connected",
      expired: false,
      details: { capabilities: ["publish"] },
    },
  ];
  const item = deliveryItem({
    channel: "meta_ads",
    connectionId: "ad",
    assetKey: "asset:1",
    scheduledAtMs: null,
    content: contentSchema.parse({
      title: "Ad",
      message: "Primary text",
      headline: "Headline",
      link: "https://example.com",
      adSetId: "123",
    }),
  });
  render(
    <PublicationComposer
      {...baseProps}
      studio
      item={item}
      studioEntry={{ section: "preview", visit: 1 }}
    />
  );
  expect(
    screen.getByText(
      /This creates your ad in Meta with its status set to paused/
    )
  ).toBeTruthy();
  clickJourney(screen.getByRole("button", { name: "Create paused ad" }));
  await completeSave(3);
  expect(api.reviewAsync).toHaveBeenCalledWith(
    expect.objectContaining({
      revision: 3,
      decision: "approved",
      delivery: { confirm: true, mode: "live" },
    })
  );
});

function clickJourney(element: HTMLElement) {
  fireEvent.click(element);
  const keep = screen.queryByRole("button", {
    name: /^(Keep defaults & continue|Continue with current choices)$/,
  });
  if (keep) fireEvent.click(keep);
}

it("keeps recovery explicit and preserves the provider error for a retry-safe failure", () => {
  const item = deliveryItem({
    state: "failed",
    error: "Invalid parameter",
    result: { retrySafe: true },
  });
  showDetails(item);
  expect(
    screen.getByRole("region", { name: "Delivery status" }).textContent
  ).toContain("Delivery needs attention");
  expect(screen.getByRole("alert").textContent).toContain("Invalid parameter");
  expect(api.retry).not.toHaveBeenCalled();
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  fireEvent.click(
    screen.getByRole("button", { name: "Retry failed delivery" })
  );
  expect(api.retry).not.toHaveBeenCalled();
  confirm.mockReturnValue(true);
  fireEvent.click(
    screen.getByRole("button", { name: "Retry failed delivery" })
  );
  expect(api.retry).toHaveBeenCalledWith(
    expect.objectContaining({
      id: item.id,
      revision: item.revision,
      confirm: true,
    })
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Return failed item to draft" })
  );
  expect(api.resetFailed).toHaveBeenCalledWith(
    expect.objectContaining({
      id: item.id,
      revision: item.revision,
      confirm: true,
    })
  );
  confirm.mockRestore();
});
it("never exposes a retry for an unknown delivery and retains provider verification", () => {
  showDetails(
    deliveryItem({ state: "delivery_unknown", error: "Request timed out" })
  );
  expect(
    screen.getByRole("region", { name: "Delivery status" }).textContent
  ).toContain("Check Meta before continuing");
  expect(
    screen.queryByRole("button", { name: "Retry failed delivery" })
  ).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Return failed item to draft" })
  ).toBeNull();
  expect(
    screen.getByRole("button", { name: "Verify existing delivery" })
  ).toBeTruthy();
});
it("hides publisher recovery controls from creators", () => {
  api.role = "creator";
  showDetails(
    deliveryItem({
      state: "failed",
      error: "Invalid parameter",
      result: { retrySafe: true },
    })
  );
  expect(
    screen.queryByRole("button", { name: "Retry failed delivery" })
  ).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Return failed item to draft" })
  ).toBeNull();
});

it.each([false, true])(
  "auto-selects a single eligible social Page without a picker (studio=%s)",
  studio => {
    render(<PublicationComposer {...baseProps} studio={studio} />);
    expect(
      screen.queryByRole("radiogroup", { name: "Social account" })
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Select Our Page" })
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Open Facebook Page category" })
    ).toBeNull();
    expect(screen.getAllByText("Our Page").length).toBeGreaterThan(0);
    expect(api.save).not.toHaveBeenCalled();
    expect(api.reviewAsync).not.toHaveBeenCalled();
    saveDraft();
    expect(api.save).toHaveBeenCalledWith(
      expect.objectContaining({ connectionId: "page" })
    );
  }
);

it("keeps multiple social identities selectable independently of a single ad account", () => {
  api.accounts.push({ ...api.accounts[0], id: "page2", name: "Other Page" });
  api.accounts.push({
    ...api.accounts[0],
    channel: "meta_ads",
    id: "ad",
    name: "Only ad account",
  });
  render(<PublicationComposer {...baseProps} studio />);
  expect(screen.getByRole("button", { name: "Select Our Page" })).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Select Other Page" })
  ).toBeTruthy();
  saveDraft();
  expect(api.save).toHaveBeenCalledWith(
    expect.objectContaining({ connectionId: null })
  );
});

it("omits a single ad account and bound Page identity while retaining other setup and the review destination", () => {
  api.accounts = [
    {
      ...api.accounts[0],
      channel: "meta_ads",
      id: "ad",
      name: "Only ad account",
      details: {
        capabilities: ["publish"],
        pageId: "123",
        pageName: "Bound Page",
      },
    },
  ];
  render(
    <PublicationComposer
      {...baseProps}
      studio
      initialChannel="meta_ads"
      initialAdSetId="456"
      studioEntry={{ section: "preview", visit: 1 }}
    />
  );
  expect(
    screen.queryByRole("button", { name: "Select Only ad account" })
  ).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Open Ad account category" })
  ).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Open Page identity category" })
  ).toBeNull();
  expect(screen.queryByRole("button", { name: "Edit destination" })).toBeNull();
  expect(
    screen.getByText("Meta Ads · Only ad account · Page: Bound Page")
  ).toBeTruthy();
  clickJourney(screen.getByRole("button", { name: /Destination Channel/ }));
  expect(
    screen.getByRole("button", { name: "Open Campaign & ad set category" })
  ).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Open Ad details category" })
  ).toBeTruthy();
  expect(api.reviewAsync).not.toHaveBeenCalled();
});

it("keeps missing Page identity guidance even when the sole account picker is omitted", () => {
  api.accounts = [
    {
      ...api.accounts[0],
      channel: "meta_ads",
      id: "ad",
      name: "Only ad account",
    },
  ];
  render(
    <PublicationComposer {...baseProps} studio initialChannel="meta_ads" />
  );
  expect(
    screen.queryByRole("button", { name: "Select Only ad account" })
  ).toBeNull();
  expect(
    screen.getByRole("button", { name: "Open Page identity category" })
  ).toBeTruthy();
  expect(
    screen.getByText(/This ad account has no Page identity connected/)
  ).toBeTruthy();
});

it.each(["loading", "fetching", "error"])(
  "waits for successful account loading before singleton selection (%s)",
  async state => {
    api.connectionsLoading = state === "loading";
    api.connectionsFetching = state === "fetching";
    api.connectionsError =
      state === "error" ? { message: "Unavailable" } : null;
    const view = render(<PublicationComposer {...baseProps} studio />);
    expect(
      screen.getByRole("button", { name: "Open Facebook Page category" })
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Select Our Page" })
    ).toBeNull();
    saveDraft();
    expect(api.save).toHaveBeenCalledWith(
      expect.objectContaining({ connectionId: null })
    );
    await completeSave();
    api.save.mockClear();
    api.connectionsLoading = false;
    api.connectionsFetching = false;
    api.connectionsError = null;
    view.rerender(<PublicationComposer {...baseProps} studio />);
    expect(
      screen.queryByRole("button", { name: "Open Facebook Page category" })
    ).toBeNull();
    saveDraft();
    expect(api.save).toHaveBeenCalledWith(
      expect.objectContaining({ connectionId: "page" })
    );
  }
);

it("restores the account choice on one-to-many refresh and never retargets it when it disappears", () => {
  const view = render(<PublicationComposer {...baseProps} studio />);
  api.accounts.push({ ...api.accounts[0], id: "other", name: "Other Page" });
  view.rerender(<PublicationComposer {...baseProps} studio />);
  expect(
    screen
      .getByRole("button", { name: "Select Our Page" })
      .getAttribute("aria-pressed")
  ).toBe("true");
  expect(
    screen
      .getByRole("button", { name: "Select Other Page" })
      .getAttribute("aria-pressed")
  ).toBe("false");
  api.accounts = [api.accounts[1]];
  view.rerender(<PublicationComposer {...baseProps} studio />);
  expect(
    screen.getByText(/It has not been replaced automatically/)
  ).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Use Other Page instead" })
  ).toBeTruthy();
  saveDraft();
  expect(api.save).toHaveBeenCalledWith(
    expect.objectContaining({ connectionId: "page" })
  );
  api.accounts = [];
  view.rerender(<PublicationComposer {...baseProps} studio />);
  expect(
    screen.getByText(/No connected accounts with publishing permission/)
  ).toBeTruthy();
  expect(api.reviewAsync).not.toHaveBeenCalled();
});

it("requires explicit replacement of an unavailable saved destination", () => {
  render(
    <PublicationComposer
      {...baseProps}
      studio
      item={deliveryItem({ connectionId: "missing" })}
    />
  );
  expect(
    screen.getByText(/It has not been replaced automatically/)
  ).toBeTruthy();
  expect(api.save).not.toHaveBeenCalled();
  clickJourney(screen.getByRole("button", { name: "Use Our Page instead" }));
  saveDraft();
  expect(api.save).toHaveBeenCalledWith(
    expect.objectContaining({ connectionId: "page" })
  );
});

it("updates the bound identity and clears campaign fields when an ad account changes", () => {
  api.accounts = ["First", "Second"].map((name, i) => ({
    ...api.accounts[0],
    channel: "meta_ads",
    id: `ad${i}`,
    name: `${name} ad account`,
    details: {
      capabilities: ["publish"],
      pageId: `${i + 1}`,
      pageName: `${name} Page`,
    },
  }));
  render(
    <PublicationComposer
      {...baseProps}
      studio
      initialChannel="meta_ads"
      initialConnectionId="ad0"
      initialAdSetId="456"
    />
  );
  expect(
    screen.queryByRole("button", { name: "Open Page identity category" })
  ).toBeNull();
  clickJourney(
    screen.getByRole("button", { name: "Select Second ad account" })
  );
  saveDraft();
  expect(api.save).toHaveBeenCalledWith(
    expect.objectContaining({
      connectionId: "ad1",
      content: expect.objectContaining({ adSetId: "", metaCampaignId: "" }),
    })
  );
  expect(api.reviewAsync).not.toHaveBeenCalled();
});

it("does not overwrite a restored local destination with a new singleton default", () => {
  writeStudioDraft(studioDraftKey(10, 1, "activation:facebook", "new::"), {
    version: 1,
    value: {
      placement: false,
      carousel: false,
      connectionId: "previous-page",
      assetKey: "",
      content: contentSchema.parse({
        title: "Saved draft",
        message: "Keep this draft destination",
      }),
      timezone: "UTC",
      local: "",
    },
  });
  render(<PublicationComposer {...baseProps} studio />);
  expect(
    screen.getByText(/It has not been replaced automatically/)
  ).toBeTruthy();
  saveDraft();
  expect(api.save).toHaveBeenCalledWith(
    expect.objectContaining({ connectionId: "previous-page" })
  );
});
