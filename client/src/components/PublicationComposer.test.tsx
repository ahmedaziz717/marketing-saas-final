// @vitest-environment jsdom
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
import type { Publication } from "./PublicationComposer";

const api = vi.hoisted(() => ({
  save: vi.fn(),
  saveOptions: {} as any,
  reviewAsync: vi.fn(),
  submitAsync: vi.fn(),
  plan: undefined as any,
  brand: undefined as any,
  accounts: [] as any[],
  role: "owner",
  liveSocial: true,
  review: vi.fn(),
  queue: vi.fn(),
  submit: vi.fn(),
}));
vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspace: () => ({ organizationId: 1, membership: { role: api.role } }),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      publishing: {
        list: { invalidate: vi.fn() },
        get: { invalidate: vi.fn() },
        history: { invalidate: vi.fn() },
      },
    }),
    brand: { get: { useQuery: () => ({ data: api.brand }) } },
    models: { credits: { useQuery: () => ({ data: { textEstimate: 1 } }) } },
    channels: {
      draftAssetCopy: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      connections: {
        useQuery: () => ({
          data: {
            items: api.accounts,
            liveSocial: api.liveSocial,
            liveAds: api.liveSocial,
          },
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
      retry: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      resetFailed: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
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
  fireEvent.click(screen.getByRole("button", { name: "Approve & schedule" }));
  expect(api.review).not.toHaveBeenCalled();
  expect(api.queue).not.toHaveBeenCalled();
  const confirmation = within(
    screen.getByRole("dialog", { name: "Approve & schedule" })
  );
  expect(confirmation.getByText("Our Page")).toBeTruthy();
  expect(confirmation.getByText(/America\/New_York/)).toBeTruthy();
  fireEvent.click(
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
  fireEvent.click(
    screen.getByRole("button", { name: "Approve & publish now" })
  );
  const confirmation = within(
    screen.getByRole("dialog", { name: "Approve & publish now" })
  );
  expect(confirmation.getByText(/as soon as it is processed/)).toBeTruthy();
  fireEvent.click(confirmation.getByRole("button", { name: "Go back" }));
  expect(api.review).not.toHaveBeenCalled();
  expect(api.queue).not.toHaveBeenCalled();
});

it("shows existing approvals as not scheduled and only queues after a separate explicit confirmation", () => {
  showDetails(deliveryItem({ state: "approved" }));
  expect(screen.getByText("Approved · Not scheduled")).toBeTruthy();
  expect(api.queue).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Schedule post" }));
  fireEvent.click(
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
  fireEvent.click(screen.getByRole("button", { name: "Change schedule" }));
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
  fireEvent.click(screen.getByRole("button", { name: "Delivery settings" }));
  expect(onEdit).toHaveBeenCalledTimes(1);
  expect(api.queue).not.toHaveBeenCalled();
});

it("keeps creators on the request-approval flow", () => {
  api.role = "creator";
  showDetails();
  expect(screen.queryByRole("button", { name: /Approve &/ })).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Submit for publishing approval" })
  );
  expect(api.submit).toHaveBeenCalledTimes(1);
  expect(api.review).not.toHaveBeenCalled();
});

it("clearly labels test schedules and explicitly confirms test mode", () => {
  api.liveSocial = false;
  showDetails();
  fireEvent.click(
    screen.getByRole("button", { name: "Approve & save test schedule" })
  );
  const confirmation = within(
    screen.getByRole("dialog", { name: "Approve & save test schedule" })
  );
  expect(confirmation.getByText(/No content will be sent/)).toBeTruthy();
  fireEvent.click(
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
  fireEvent.click(screen.getByRole("button", { name: "Select Our Page" }));
  fireEvent.click(screen.getByRole("button", { name: /Copy Words & AI/ }));
  fireEvent.click(screen.getByRole("button", { name: "Compose" }));
  fireEvent.change(caption(), {
    target: { value: "Our new collection is here." },
  });
  fireEvent.click(screen.getByRole("button", { name: /Timing Plan delivery/ }));
  fireEvent.change(screen.getByLabelText("Time zone"), {
    target: { value: "UTC" },
  });
  fireEvent.change(screen.getByLabelText("Publish date and time"), {
    target: { value: "2099-06-15T12:30" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Copy Words & AI/ }));
  expect(caption().value).toBe("Our new collection is here.");
  fireEvent.click(
    screen.getByRole("button", { name: /Review & activate Confirm delivery/ })
  );
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
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

it("disables read-only Studio accounts and omits expired connections", () => {
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
    (
      screen.getByRole("button", {
        name: "Select Read only Page",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
  expect(
    screen.queryByRole("button", { name: "Select Expired Page" })
  ).toBeNull();
});

it("uses edited Studio timing for existing drafts and blocks dates in the past", () => {
  render(<PublicationComposer {...baseProps} studio item={deliveryItem()} />);
  fireEvent.click(screen.getByRole("button", { name: /Timing Plan delivery/ }));
  fireEvent.change(screen.getByLabelText("Publish date and time"), {
    target: { value: "2000-01-01T12:00" },
  });
  saveDraft();
  expect(api.save).not.toHaveBeenCalled();
  fireEvent.click(
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
  fireEvent.click(
    screen.getByRole("button", { name: /Creative Assets & format/ })
  );
  fireEvent.click(screen.getByRole("button", { name: "Select Single image" }));
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
  fireEvent.click(screen.getByRole("button", { name: /Copy Words & AI/ }));
  const copyCategories = within(
    screen.getByRole("group", { name: "Section categories" })
  );
  expect(
    copyCategories
      .getAllByRole("button")
      .slice(0, 9)
      .map(button => button.textContent)
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
      .getByRole("button", { name: "Messaging style" })
      .getAttribute("aria-pressed")
  ).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Select Playful" }));
  fireEvent.click(screen.getByRole("button", { name: "Compose" }));
  fireEvent.click(screen.getByText("Call to action: LEARN MORE"));
  fireEvent.click(screen.getByRole("button", { name: "Select Subscribe" }));
  fireEvent.click(
    screen.getByRole("button", { name: /Creative Assets & format/ })
  );
  fireEvent.click(screen.getByRole("button", { name: /Copy Words & AI/ }));
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
  fireEvent.click(screen.getByRole("button", { name: /Copy Words & AI/ }));
  expect(screen.queryByRole("group", { name: "Copy attributes" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Select Playful" }));
  fireEvent.click(screen.getByRole("button", { name: "Selected (1)" }));
  expect(
    screen.queryByRole("button", { name: "Select Provocative" })
  ).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Next: Messaging angle" })
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Previous: Messaging style" })
  );
  expect(
    screen
      .getByRole("button", { name: "Select Playful" })
      .getAttribute("aria-pressed")
  ).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Let AI choose" }));
  expect(
    screen
      .getByRole("button", { name: "AI chooses ✓" })
      .getAttribute("aria-pressed")
  ).toBe("true");
  expect(
    screen.queryByRole("button", { name: /Create copy with AI/ })
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Brief" }));
  fireEvent.change(screen.getByLabelText("Audience"), {
    target: { value: "My audience" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Fill from brand" }));
  expect((screen.getByLabelText("Audience") as HTMLTextAreaElement).value).toBe(
    "My audience"
  );
  expect((screen.getByLabelText("Goal") as HTMLTextAreaElement).value).toBe(
    "Drive sales"
  );
  fireEvent.change(
    screen.getByLabelText("Additional instructions (optional)"),
    { target: { value: "Use only verified claims." } }
  );
  fireEvent.click(screen.getByRole("button", { name: "Next: Compose" }));
  fireEvent.click(screen.getByRole("button", { name: "Previous: Brief" }));
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
  fireEvent.click(screen.getByRole("button", { name: /Copy Words & AI/ }));
  fireEvent.click(screen.getByRole("button", { name: "Compose" }));
  fireEvent.change(caption(), { target: { value: "First draft" } });
  saveDraft();
  await completeSave(1);
  expect(screen.getByRole("heading", { name: "Compose" })).toBeTruthy();
  expect(screen.getByText("Saved", { exact: true })).toBeTruthy();
  fireEvent.change(caption(), { target: { value: "Edited draft" } });
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
  fireEvent.click(publish);
  fireEvent.click(publish);
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
  fireEvent.click(screen.getByRole("button", { name: "Save test schedule" }));
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
  fireEvent.click(screen.getByRole("button", { name: "Submit for approval" }));
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
  fireEvent.click(screen.getByRole("button", { name: "Schedule post" }));
  await completeSave(3);
  expect(screen.getByRole("alert").textContent).toContain(
    "Publishing availability changed"
  );
  expect(onSaved.mock.calls.at(-1)![1]).toBeUndefined();
  fireEvent.click(screen.getByRole("button", { name: "Schedule post" }));
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
  fireEvent.click(screen.getByRole("button", { name: "Create paused ad" }));
  await completeSave(3);
  expect(api.reviewAsync).toHaveBeenCalledWith(
    expect.objectContaining({
      revision: 3,
      decision: "approved",
      delivery: { confirm: true, mode: "live" },
    })
  );
});
