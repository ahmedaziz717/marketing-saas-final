vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: 10 } }),
}));
// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Router, useLocation, useSearch } from "wouter";
import { memoryLocation } from "wouter/memory-location";
const api = vi.hoisted(() => ({
  calls: vi.fn(),
  mutate: vi.fn(),
  videoUpload: vi.fn(),
  validate: vi.fn(),
  publish: vi.fn(),
  generateCopy: vi.fn(),
  prompts: [] as any[],
  inventory: {} as any,
  library: [] as any[],
  resources: [] as any[],
  drafts: [] as any[],
  accounts: [] as any[],
  brand: null as any,
  brandLoading: false,
}));
const account = {
  id: "google",
  name: "Google account",
  channel: "google_ads",
  accountId: "123",
  status: "connected",
  details: { currency: "USD", timezone: "America/New_York" },
};
vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspace: () => ({ membership: { role: "owner" } }),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    brand: {
      get: {
        useQuery: () => ({ data: api.brand, isLoading: api.brandLoading }),
      },
    },
    prompts: {
      list: { useQuery: () => ({ data: api.prompts, refetch: vi.fn() }) },
      change: { useMutation: () => ({ mutateAsync: vi.fn() }) },
    },
    catalog: {
      overview: {
        useQuery: () => ({ data: { products: [], hasMore: false } }),
      },
    },
    assetLibrary: {
      list: { useQuery: () => ({ data: api.library, refetch: vi.fn() }) },
      upload: { useMutation: () => ({ mutateAsync: api.mutate }) },
    },
    googleAds: {
      connections: {
        useQuery: () => ({
          data: { items: api.accounts, livePublishingEnabled: true },
        }),
      },
      campaigns: {
        merchantFeedLabels: {
          useQuery: () => ({ data: [], isLoading: false, refetch: vi.fn() }),
        },
        assetMetrics: {
          useQuery: () => ({
            data: undefined,
            isPending: false,
            isError: false,
            refetch: vi.fn(),
          }),
        },
        draftPmaxCopy: {
          useMutation: () => ({
            mutateAsync: api.generateCopy,
            isPending: false,
          }),
        },
        inventory: {
          useQuery: (input: any) => {
            api.calls(input);
            return { data: api.inventory };
          },
        },
        drafts: { useQuery: () => ({ data: api.drafts, refetch: vi.fn() }) },
        resources: { useQuery: () => ({ data: api.resources }) },
        videoUploadStatus: {
          useQuery: () => ({ data: null, refetch: vi.fn() }),
        },
        uploadVideo: { useMutation: () => ({ mutateAsync: api.videoUpload }) },
        save: { useMutation: () => ({ mutateAsync: api.mutate }) },
        validate: { useMutation: () => ({ mutateAsync: api.validate }) },
        publish: { useMutation: () => ({ mutateAsync: api.publish }) },
      },
    },
  },
}));

import GoogleCampaignStudioPage from "./GoogleCampaignStudioPage";
import { googleCampaignCreateSchema } from "@shared/googleCampaigns";
import { GoogleCampaignComposer } from "@/components/google/GoogleCampaignComposer";
const click = (name: RegExp | string) =>
  fireEvent.click(screen.getByRole("button", { name }));
const section = (name: string) => click(new RegExp(`^${name} `));
function setup(query = "?connectionId=google") {
  const route = memoryLocation({ path: `/app/activate/studio${query}` });
  return render(
    <Router hook={route.hook} searchHook={route.searchHook}>
      <div className="cfg-root">
        <GoogleCampaignComposer
          organizationId={1}
          channelChoices={<p>Shared channel choices</p>}
        />
      </div>
    </Router>
  );
}
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  api.accounts = [account];
  api.brand = null;
  api.brandLoading = false;
  api.prompts = [];
  api.library = [];
  api.resources = [];
  api.drafts = [];
  api.inventory = {
    campaigns: [],
    groups: [],
    assets: [],
    ads: [],
    limited: false,
  };
});
afterEach(cleanup);
it.each([
  ["Search", "Keyword match type"],
  ["Performance Max", "Product feed label"],
  ["Display", "EU political advertising declaration"],
  ["Shopping", "Product feed label"],
  ["Demand Gen", "Demand Gen surfaces"],
  ["App installs", "App ID"],
])(
  "keeps %s native controls within the shared destination, creative, copy and delivery flow",
  (type, field) => {
    setup();
    click("New campaign");
    click(`Select ${type}`);
    const draftKey = Object.keys(localStorage).find(key =>
      key.includes("activation:google")
    )!;
    expect(
      JSON.parse(localStorage.getItem(draftKey)!).value.change
    ).toMatchObject({
      locationIds: ["2840"],
      languageIds: ["1000"],
    });
    fireEvent.change(screen.getByLabelText("Campaign name"), {
      target: { value: `${type} launch` },
    });
    click("Open Campaign options category");
    expect(screen.getByLabelText(field)).toBeTruthy();
    section("Creative");
    click("Open Assets & details category");
    expect(
      screen.getByLabelText(
        type === "Performance Max" ? "Asset group name" : "Ad name"
      )
    ).toBeTruthy();
    section("Copy");
    if (type === "Shopping")
      expect(screen.getByText(/Shopping ads use titles/)).toBeTruthy();
    else if (["Performance Max", "Display"].includes(type))
      expect(
        screen.getByRole("region", { name: "Headlines draft editor" })
      ).toBeTruthy();
    else expect(screen.getByLabelText(/Headlines · one per line/)).toBeTruthy();
    section("Delivery");
    expect(
      (screen.getByLabelText("Campaign name") as HTMLInputElement).value
    ).toBe(`${type} launch`);
    section("Destination");
    click("Open Channel category");
    expect(screen.getByText("Shared channel choices")).toBeTruthy();
    expect(api.mutate).not.toHaveBeenCalled();
  }
);
it("requires an explicit account when multiple are connected and keeps inactive campaign discovery off", () => {
  api.accounts = [
    account,
    { ...account, id: "google-other", name: "Other Google account" },
  ];
  setup("");
  expect(
    screen
      .getByRole("button", { name: "Open Campaign category" })
      .hasAttribute("disabled")
  ).toBe(true);
  click("Select Google account");
  expect(api.calls).toHaveBeenCalledWith(
    expect.objectContaining({ connectionId: "google", includeInactive: false })
  );
  expect(
    (screen.getByLabelText("Include inactive campaigns") as HTMLInputElement)
      .checked
  ).toBe(false);
  fireEvent.click(screen.getByLabelText("Include inactive campaigns"));
  expect(api.calls).toHaveBeenCalledWith(
    expect.objectContaining({ connectionId: "google", includeInactive: true })
  );
  expect(api.mutate).not.toHaveBeenCalled();
});
it("does not silently substitute another account for a missing deep-linked account", () => {
  setup("?connectionId=unavailable");
  expect(
    screen.getByText("Choose a connected Google Ads account in Destination.")
  ).toBeTruthy();
  expect(api.calls).not.toHaveBeenCalledWith(
    expect.objectContaining({ connectionId: "google" })
  );
  expect(api.mutate).not.toHaveBeenCalled();
});
it("retains the legacy route's asset and account when redirecting to Activation Studio", () => {
  const route = memoryLocation({
    path: "/app/activate/google?asset=asset%3A1&connectionId=google",
  });
  function Address() {
    const [path] = useLocation();
    const search = useSearch();
    return (
      <output data-testid="address">
        {path}?{search}
      </output>
    );
  }
  render(
    <Router hook={route.hook} searchHook={route.searchHook}>
      <GoogleCampaignStudioPage />
      <Address />
    </Router>
  );
  expect(screen.getByTestId("address").textContent).toBe(
    "/app/activate/studio?asset=asset%3A1&connectionId=google&channel=google_ads"
  );
});

function existingCampaign(
  type = "PERFORMANCE_MAX",
  brandGuidelinesEnabled = false
) {
  api.inventory = {
    campaigns: [
      {
        campaign: {
          id: "11",
          name: "Existing campaign",
          advertisingChannelType: type,
          status: "ENABLED",
          brandGuidelinesEnabled,
        },
        campaignBudget: { amountMicros: "25000000" },
      },
    ],
    groups: [
      type === "PERFORMANCE_MAX"
        ? {
            assetGroup: { id: "22", name: "Existing group", status: "ENABLED" },
          }
        : { adGroup: { id: "22", name: "Existing group", status: "ENABLED" } },
    ],
    assets: [],
    ads: [],
    currency: "USD",
  };
  api.library = [
    {
      key: "asset:1",
      name: "Approved image",
      mediaType: "image",
      state: "approved",
      url: "https://example.com/image.png",
      width: 1200,
      height: 628,
    },
    { key: "asset:2", name: "Draft image", mediaType: "image", state: "draft" },
    {
      key: "asset:3",
      name: "Library video",
      url: "https://example.com/clip.mp4",
      revision: "approved-revision",
      mediaType: "video",
      state: "approved",
    },
  ];
  api.resources = [
    { id: "41", name: "Google image", type: "IMAGE" },
    { id: "42", name: "Google video", type: "YOUTUBE_VIDEO" },
  ];
  setup();
  click(/^Existing campaign /);
  click(type === "PERFORMANCE_MAX" ? "Add images, videos & text" : "Add an ad");
}
it("adds images and videos to the selected existing asset group without changing its budget or removing assets", async () => {
  existingCampaign();
  expect(screen.getByRole("button", { name: "Select Images" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Select Videos" })).toBeTruthy();
  click("Select Images");
  expect(
    screen.queryByRole("button", { name: "Select Draft image" })
  ).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Select Library video" })
  ).toBeNull();
  click("Select Approved image");
  click("Select Videos");
  expect(
    screen.queryByRole("button", { name: "Select Google image" })
  ).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Select Approved image" })
  ).toBeNull();
  click("Select Google Ads Library");
  click("Select Google video");
  expect(screen.getByText(/Approved image/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: /^Delivery / })).toBeNull();
  expect(api.mutate).not.toHaveBeenCalled();
  api.mutate.mockImplementation(async input => ({
    ...input,
    id: "draft",
    revision: 1,
    state: "draft",
  }));
  api.validate.mockImplementation(async input => ({
    ...input,
    change: jsonbRoundTrip(api.mutate.mock.calls.at(-1)![0].change),
    state: "validated",
    reviewHash: "hash",
  }));
  click("Continue to Copy →");
  click("Review change →");
  await waitFor(() => expect(api.mutate).toHaveBeenCalledTimes(1));
  expect(api.mutate).toHaveBeenCalledWith({
    organizationId: 1,
    connectionId: "google",
    change: {
      kind: "asset_group_assets",
      campaignId: "11",
      assetGroupId: "22",
      add: [
        {
          field: "MARKETING_IMAGE",
          source: { kind: "library", key: "asset:1" },
        },
        { field: "YOUTUBE_VIDEO", source: { kind: "existing", id: "42" } },
      ],
      remove: [],
    },
  });
});
it("validates YouTube entries and keeps video/text sources separate", () => {
  existingCampaign();
  click("Select Videos");
  click("Select YouTube link");
  fireEvent.change(screen.getByLabelText("YouTube link or video ID"), {
    target: { value: "invalid" },
  });
  click("Add asset");
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(api.mutate).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("YouTube link or video ID"), {
    target: { value: "https://youtu.be/abcdefghijk" },
  });
  click("Add asset");
  expect(screen.queryByRole("alert")).toBeNull();
  section("Copy");
  click("Write headline");
  expect(screen.getByLabelText("Headlines 1")).toBeTruthy();
  expect(screen.queryByLabelText("YouTube link or video ID")).toBeNull();
});
it.each(["DISPLAY", "DEMAND_GEN"])(
  "only offers implemented %s formats for an existing ad group",
  type => {
    existingCampaign(type);
    expect(screen.queryByRole("button", { name: "Select Videos" })).toBeNull();
    click(type === "SEARCH" ? "Select Text" : "Select Images");
    expect(screen.getByLabelText("Ad name")).toBeTruthy();
    expect(api.mutate).not.toHaveBeenCalled();
  }
);
it("keeps campaign-level brand assets out of the asset-group picker", () => {
  existingCampaign("PERFORMANCE_MAX", true);
  expect(screen.queryByRole("button", { name: "Select Logos" })).toBeNull();
  section("Copy");
  expect(
    screen.getByRole("region", { name: "Headlines draft editor" })
  ).toBeTruthy();
  expect(screen.queryByLabelText(/Business name/)).toBeNull();
});

it("offers all three source tiles and renders uploads inline without mutating on selection", () => {
  existingCampaign();
  click("Select Images");
  expect(
    screen.getByRole("button", { name: "Select EvokeLoop Library" })
  ).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Select Google Ads Library" })
  ).toBeTruthy();
  click("Select Upload");
  expect(screen.getByLabelText("Choose files")).toBeTruthy();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(api.mutate).not.toHaveBeenCalled();
});
it("filters the visual library and toggles image selection directly on its tile", () => {
  existingCampaign();
  click("Select Images");
  click("Select Approved image");
  expect(
    screen
      .getByRole("button", { name: "Select Approved image" })
      .getAttribute("aria-pressed")
  ).toBe("true");
  click("Select Approved image");
  expect(
    screen
      .getByRole("button", { name: "Select Approved image" })
      .getAttribute("aria-pressed")
  ).toBe("false");
  fireEvent.change(screen.getByLabelText("Search assets"), {
    target: { value: "no match" },
  });
  expect(
    screen.queryByRole("button", { name: "Select Approved image" })
  ).toBeNull();
});
it("requires a separate explicit confirmation before transferring an EL video to Google", async () => {
  existingCampaign();
  click("Select Videos");
  click("Select EvokeLoop Library");
  click("Select Library video");
  expect(
    (
      screen.getByRole("button", {
        name: "Upload video to Google",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
  expect(api.videoUpload).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByLabelText(
      "I approve uploading this video to Google as unlisted"
    )
  );
  api.videoUpload.mockResolvedValue({ state: "PROCESSING" });
  click("Upload video to Google");
  await waitFor(() =>
    expect(api.videoUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "asset:3",
        revision: "approved-revision",
        confirm: true,
      })
    )
  );
  expect(api.mutate).not.toHaveBeenCalled();
});
it.each([1, 2])(
  "restores local Google edits only for matching saved revision %s",
  async revision => {
    const view = setup();
    click("New campaign");
    click("Select Search");
    fireEvent.change(screen.getByLabelText("Campaign name"), {
      target: { value: "Local unsaved name" },
    });
    const key = Object.keys(localStorage).find(key =>
      key.includes("activation:google")
    )!;
    const entry = JSON.parse(localStorage.getItem(key)!);

    view.unmount();
    entry.value.draftId = "saved-google";
    entry.value.draftRevision = 1;
    localStorage.setItem(key, JSON.stringify(entry));
    api.drafts = [
      {
        id: "saved-google",
        revision,
        state: "draft",
        change: { ...entry.value.change, name: "Server name" },
      },
    ];
    setup();
    section("Delivery");
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Campaign name") as HTMLInputElement).value
      ).toBe(revision === 1 ? "Local unsaved name" : "Server name")
    );
    if (revision === 2)
      expect(screen.getByText(/current version was opened/)).toBeTruthy();
    expect(api.mutate).not.toHaveBeenCalled();
  }
);
it("keeps missing saved Google drafts unavailable instead of submitting local content", async () => {
  const view = setup();
  click("New campaign");
  click("Select Search");
  const key = Object.keys(localStorage).find(key =>
    key.includes("activation:google")
  )!;
  const entry = JSON.parse(localStorage.getItem(key)!);

  view.unmount();
  entry.value.draftId = "deleted-draft";
  entry.value.draftRevision = 1;
  localStorage.setItem(key, JSON.stringify(entry));
  setup();
  expect(screen.queryByRole("button", { name: /^Delivery / })).toBeNull();
  await waitFor(() =>
    expect(screen.getByText(/saved Google draft is unavailable/)).toBeTruthy()
  );
  expect(api.mutate).not.toHaveBeenCalled();
  expect(JSON.parse(localStorage.getItem(key)!).value.draftId).toBe(
    "deleted-draft"
  );
});

it("filters existing destinations by supported media and clears the old selection", () => {
  api.inventory.campaigns = [
    "SEARCH",
    "SHOPPING",
    "VIDEO",
    "APP",
    "DISPLAY",
    "DEMAND_GEN",
    "PERFORMANCE_MAX",
    "UNKNOWN",
  ].map((type, index) => ({
    campaign: {
      id: String(index + 1),
      name: `${type} campaign`,
      advertisingChannelType: type,
      status: "ENABLED",
    },
    campaignBudget: {},
  }));
  setup();
  for (const type of ["DISPLAY", "DEMAND_GEN", "PERFORMANCE_MAX"])
    expect(
      screen.getByRole("button", { name: new RegExp(`^${type} campaign`) })
    ).toBeTruthy();
  for (const type of ["SEARCH", "SHOPPING", "VIDEO", "APP", "UNKNOWN"])
    expect(
      screen.queryByRole("button", { name: new RegExp(`^${type} campaign`) })
    ).toBeNull();
  click(/^DISPLAY campaign/);
  expect(screen.queryByRole("button", { name: /^Delivery / })).toBeNull();
  section("Review & activate");
  expect(
    screen.queryByRole("button", { name: "Publish reviewed changes" })
  ).toBeNull();
  section("Destination");
  click("Open Campaign category");
  fireEvent.change(screen.getByLabelText("Creative to add"), {
    target: { value: "video" },
  });
  expect(
    screen.queryByRole("button", { name: /^DISPLAY campaign/ })
  ).toBeNull();
  expect(
    screen.queryByRole("button", { name: /^DEMAND_GEN campaign/ })
  ).toBeNull();
  expect(
    screen.getByRole("button", { name: /^PERFORMANCE_MAX campaign/ })
  ).toBeTruthy();
  expect(screen.queryByText("Edit name, status & budget")).toBeNull();
  expect(api.mutate).not.toHaveBeenCalled();
});
it("opens approved Creative Studio outputs directly from the Creative step", () => {
  existingCampaign();
  section("Destination");
  click("Open Campaign category");
  click(/^Existing campaign /);
  api.library.push({
    key: "creative:55",
    name: "Approved Studio creative",
    mediaType: "image",
    state: "approved",
    url: "https://example.com/studio.png",
    width: 1200,
    height: 628,
  });
  section("Creative");
  click("Select Existing group");
  expect(
    screen
      .getByRole("button", { name: "Select EvokeLoop Library" })
      .getAttribute("aria-pressed")
  ).toBe("true");
  click("Select Approved Studio creative");
  expect(
    screen
      .getByRole("button", { name: "Select Approved Studio creative" })
      .getAttribute("aria-pressed")
  ).toBe("true");
  expect(api.publish).not.toHaveBeenCalled();
});
// JSONB round trips reorder keys recursively, unlike the old identity mocks.
function jsonbRoundTrip(value: any): any {
  if (Array.isArray(value)) return value.map(jsonbRoundTrip);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(key => [key, jsonbRoundTrip(value[key])])
  );
}
it("checks automatically and only publishes after explicit approval", async () => {
  existingCampaign();
  click("Select Images");
  click("Select Approved image");
  let saved: any;
  api.mutate.mockImplementation(
    async input =>
      (saved = {
        ...input,
        change: jsonbRoundTrip(input.change),
        id: "draft",
        revision: 1,
        state: "draft",
      })
  );
  api.validate.mockImplementation(async () => ({
    ...saved,
    state: "validated",
    reviewHash: "review",
    validatedAtMs: Date.now(),
  }));
  click("Continue to Copy →");
  click("Review change →");
  expect(
    screen.queryByRole("button", { name: "Validate with Google" })
  ).toBeNull();
  await waitFor(() =>
    expect(
      screen.getByText("Compatibility checked. Ready for your review.")
    ).toBeTruthy()
  );
  expect(api.validate).toHaveBeenCalledTimes(1);
  expect(api.publish).not.toHaveBeenCalled();
  expect(
    (
      screen.getByRole("button", {
        name: "Add creative to asset group",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
  fireEvent.click(
    screen.getByLabelText(
      "I confirm adding this creative to the asset group shown above. Existing assets and budget stay unchanged."
    )
  );
  api.publish.mockResolvedValue({
    ...saved,
    state: "published",
    result: { resources: [] },
  });
  click("Add creative to asset group");
  await waitFor(() =>
    expect(api.publish).toHaveBeenCalledWith({
      organizationId: 1,
      id: "draft",
      revision: 1,
      reviewHash: "review",
      confirm: true,
    })
  );
});
it("keeps provider failures visible and retries the saved draft without publishing", async () => {
  existingCampaign();
  click("Select Images");
  click("Select Approved image");
  let saved: any;
  api.mutate.mockImplementation(
    async input =>
      (saved = {
        ...input,
        change: jsonbRoundTrip(input.change),
        id: "draft",
        revision: 1,
        state: "draft",
      })
  );
  api.validate.mockRejectedValueOnce(new Error("Landscape image too small"));
  click("Continue to Copy →");
  click("Review change →");
  await waitFor(() =>
    expect(screen.getByText("Landscape image too small")).toBeTruthy()
  );
  expect(
    screen.queryByRole("button", { name: "Publish reviewed changes" })
  ).toBeNull();
  api.validate.mockImplementation(async () => ({
    ...saved,
    state: "validated",
    reviewHash: "review",
  }));
  click("Retry check");
  await waitFor(() =>
    expect(
      screen.getByText("Compatibility checked. Ready for your review.")
    ).toBeTruthy()
  );
  expect(api.mutate).toHaveBeenCalledTimes(1);
  expect(api.publish).not.toHaveBeenCalled();
});
it("ignores a late check after switching accounts or leaving review", async () => {
  existingCampaign();
  click("Select Images");
  click("Select Approved image");
  let saved: any;
  let finish: (value: any) => void = () => {};
  api.mutate.mockImplementation(
    async input =>
      (saved = {
        ...input,
        change: jsonbRoundTrip(input.change),
        id: "draft",
        revision: 1,
        state: "draft",
      })
  );
  api.validate.mockImplementation(
    () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
  click("Continue to Copy →");
  click("Review change →");
  await waitFor(() => expect(api.validate).toHaveBeenCalled());
  section("Destination");
  click("Open Campaign category");
  fireEvent.change(screen.getByLabelText("Creative to add"), {
    target: { value: "video" },
  });
  finish({ ...saved, state: "validated", reviewHash: "stale" });
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(screen.queryByText(/Saved revision/)).toBeNull();
  expect(api.publish).not.toHaveBeenCalled();
});

it("carries an approved Creative Studio image into its selected asset group", () => {
  existingCampaign();
  cleanup();
  localStorage.clear();
  api.library.push({
    key: "creative:55",
    name: "Studio square",
    mediaType: "image",
    state: "approved",
    url: "https://example.com/square.png",
    width: 1080,
    height: 1080,
  });
  setup("?connectionId=google&asset=creative%3A55");
  click(/^Existing campaign /);
  section("Creative");
  click("Select Existing group");
  expect(
    within(screen.getByRole("radiogroup", { name: "Placement" }))
      .getByRole("radio", { name: "Automatic image size · recommended" })
      .getAttribute("aria-checked")
  ).toBe("true");
  expect(
    screen
      .getByRole("button", { name: "Select Studio square" })
      .getAttribute("aria-pressed")
  ).toBe("true");
  expect(api.mutate).not.toHaveBeenCalled();
});
it("keeps a Creative Studio video in the EvokeLoop picker and filters its destination", () => {
  existingCampaign();
  cleanup();
  localStorage.clear();
  setup("?connectionId=google&asset=asset%3A3");
  expect(
    (screen.getByLabelText("Creative to add") as HTMLSelectElement).value
  ).toBe("video");
  click(/^Existing campaign /);
  section("Creative");
  click("Select Existing group");
  expect(
    screen
      .getByRole("button", { name: "Select EvokeLoop Library" })
      .getAttribute("aria-pressed")
  ).toBe("true");
  expect(
    screen
      .getByRole("button", { name: "Select Library video" })
      .getAttribute("aria-pressed")
  ).toBe("true");
  expect(api.videoUpload).not.toHaveBeenCalled();
});
it("shows incomplete details without submitting a Google check", async () => {
  existingCampaign();
  click("Select Images");
  click("Continue to Copy →");
  click("Review change →");
  await waitFor(() =>
    expect(
      screen.getByLabelText("Required items before activation")
    ).toBeTruthy()
  );
  expect(api.mutate).not.toHaveBeenCalled();
  expect(api.validate).not.toHaveBeenCalled();
  expect(api.publish).not.toHaveBeenCalled();
});

it("shows a contextual activation action and preview before checks finish without publishing", () => {
  existingCampaign();
  click("Select Images");
  click("Select Approved image");
  click("Continue to Copy →");
  click("Review change →");
  expect(screen.getByAltText("To add: Approved image")).toBeTruthy();
  expect(
    (
      screen.getByRole("button", {
        name: "Add creative to asset group",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
  expect(
    screen.getByText(/Compatibility checks do not activate anything/)
  ).toBeTruthy();
  expect(api.publish).not.toHaveBeenCalled();
});
it("requires explicit image replacement at capacity, and cancelling keeps all existing images", async () => {
  existingCampaign();
  api.inventory.assets = Array.from({ length: 20 }, (_, index) => ({
    assetGroup: { id: "22" },
    asset: {
      id: String(100 + index),
      name: `Existing image ${index}`,
      imageAsset: { fullSize: { url: "https://example.com/existing.png" } },
    },
    assetGroupAsset: {
      fieldType: "MARKETING_IMAGE",
      resourceName: `link-${index}`,
    },
  }));
  click("Select Images");
  click("Select Approved image");
  expect(screen.getByText("Choose images to replace")).toBeTruthy();
  click("Continue to Copy →");
  click("Review change →");
  await waitFor(() =>
    expect(screen.getByText(/Image capacity reached/)).toBeTruthy()
  );
  expect(api.validate).not.toHaveBeenCalled();
  expect(api.publish).not.toHaveBeenCalled();
  let saved: any;
  api.mutate.mockImplementation(
    async input =>
      (saved = {
        ...input,
        change: jsonbRoundTrip(input.change),
        id: "draft",
        revision: 1,
        state: "draft",
      })
  );
  api.validate.mockImplementation(async () => ({
    ...saved,
    state: "validated",
    reviewHash: "review",
    validatedAtMs: Date.now(),
  }));
  fireEvent.click(screen.getByLabelText(/Replace Existing image 0 ·/));
  await waitFor(() => expect(api.validate).toHaveBeenCalledTimes(1));
  expect(saved.change.remove).toEqual([
    { assetId: "100", field: "MARKETING_IMAGE" },
  ]);
  expect(
    (
      screen.getByRole("button", {
        name: "Confirm replacement & activate",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
  expect(api.publish).not.toHaveBeenCalled();
  click(/Cancel replacements/);
  await waitFor(() =>
    expect(screen.getByText(/Image capacity reached/)).toBeTruthy()
  );
  expect(api.publish).not.toHaveBeenCalled();
});

it("generates copy for a full existing group and saves only the explicitly chosen text replacement", async () => {
  existingCampaign();
  api.prompts = [
    { id: "google.pmax.copy", value: "Brand prompt", revision: 1 },
  ];
  api.inventory.assets = [
    ...Array.from({ length: 15 }, (_, index) => ({
      field: "HEADLINE",
      text: `Existing headline ${index}`,
    })),
    ...Array.from({ length: 5 }, (_, index) => ({
      field: "LONG_HEADLINE",
      text: `Existing long headline ${index}`,
    })),
    ...Array.from({ length: 5 }, (_, index) => ({
      field: "DESCRIPTION",
      text: `Existing description ${index}`,
    })),
  ].map((item, index) => ({
    assetGroup: { id: "22" },
    asset: { id: String(100 + index), textAsset: { text: item.text } },
    assetGroupAsset: {
      fieldType: item.field,
      resourceName: `text-link-${index}`,
    },
  }));
  api.generateCopy.mockResolvedValue({
    headlines: ["New AI headline"],
    longHeadlines: [],
    descriptions: [],
  });
  click("Select Approved image");
  click("Continue to Copy →");
  expect(
    (screen.getByText("Create suggestions with AI") as HTMLButtonElement)
      .disabled
  ).toBe(false);
  click("Create suggestions with AI");
  const suggestion = await screen.findByDisplayValue("New AI headline");
  expect(api.generateCopy).toHaveBeenCalledWith(
    expect.objectContaining({
      selectedAssets: [
        {
          field: "MARKETING_IMAGE",
          source: { kind: "library", key: "asset:1" },
        },
      ],
      copyRequest: expect.objectContaining({
        counts: { headlines: 15, longHeadlines: 5, descriptions: 5 },
      }),
    })
  );
  const row = within(suggestion.closest(".ad-copy-proposal") as HTMLElement);
  fireEvent.click(row.getByText("Replace existing text…"));
  const option = row.getByRole("option", {
    name: "Google: Existing headline 0",
  }) as HTMLOptionElement;
  fireEvent.change(row.getByRole("combobox"), {
    target: { value: option.value },
  });
  expect(api.mutate).not.toHaveBeenCalled();
  fireEvent.click(row.getByText("Replace selected text in draft"));
  expect(api.publish).not.toHaveBeenCalled();
  // Revisiting the creative picker must not silently undo the text replacement.
  section("Creative");
  click("Select Approved image");
  click("Select Approved image");
  click("Continue to Copy →");
  let saved: any;
  api.mutate.mockImplementation(
    async input =>
      (saved = {
        ...input,
        change: jsonbRoundTrip(input.change),
        id: "draft",
        revision: 1,
        state: "draft",
      })
  );
  api.validate.mockImplementation(async () => ({
    ...saved,
    state: "validated",
    reviewHash: "review",
    validatedAtMs: Date.now(),
  }));
  click("Review change →");
  await waitFor(() => expect(api.mutate).toHaveBeenCalledTimes(1));
  expect(saved.change).toEqual({
    kind: "asset_group_assets",
    campaignId: "11",
    assetGroupId: "22",
    add: [
      { field: "HEADLINE", source: { kind: "text", text: "New AI headline" } },
      { field: "MARKETING_IMAGE", source: { kind: "library", key: "asset:1" } },
    ],
    remove: [{ assetId: "100", field: "HEADLINE" }],
  });
  expect(
    screen.getByText("Selected headline to replace: Existing headline 0")
  ).toBeTruthy();
  expect(api.publish).not.toHaveBeenCalled();
});
it("submits only once for repeated activation clicks while a request is pending", async () => {
  existingCampaign();
  click("Select Images");
  click("Select Approved image");
  let saved: any;
  api.mutate.mockImplementation(
    async input =>
      (saved = {
        ...input,
        change: jsonbRoundTrip(input.change),
        id: "draft",
        revision: 1,
        state: "draft",
      })
  );
  api.validate.mockImplementation(async () => ({
    ...saved,
    state: "validated",
    reviewHash: "review",
    validatedAtMs: Date.now(),
  }));
  let finish: (value: any) => void = () => {};
  api.publish.mockImplementation(
    () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
  click("Continue to Copy →");
  click("Review change →");
  await waitFor(() =>
    expect(
      screen.getByText("Compatibility checked. Ready for your review.")
    ).toBeTruthy()
  );
  fireEvent.click(screen.getByLabelText(/I confirm adding this creative/));
  click("Add creative to asset group");
  click("Add creative to asset group");
  expect(api.publish).toHaveBeenCalledTimes(1);
  finish({ ...saved, state: "published", result: { resources: [] } });
  await waitFor(() =>
    expect(
      screen.getByText("Google confirmed your creative update.")
    ).toBeTruthy()
  );
});

it("opens the sole connected account automatically without mutating Google", () => {
  setup("");
  expect(api.calls).toHaveBeenCalledWith(
    expect.objectContaining({ connectionId: "google", includeInactive: false })
  );
  expect(
    screen
      .getByRole("button", { name: "Open Campaign category" })
      .hasAttribute("disabled")
  ).toBe(false);
  expect(api.mutate).not.toHaveBeenCalled();
  expect(api.publish).not.toHaveBeenCalled();
});

it("shows approved assets immediately and preserves picks across format and source navigation", () => {
  existingCampaign();
  expect(
    screen.getByRole("button", { name: "Select Approved image" })
  ).toBeTruthy();
  expect(
    screen.queryByLabelText("Required items before activation")
  ).toBeNull();
  click("Select Approved image");
  click("Select Videos");
  click("Select Google Ads Library");
  click("Select Google video");
  click("Select Images");
  click("Select EvokeLoop Library");
  expect(
    screen
      .getByRole("button", { name: "Select Approved image" })
      .getAttribute("aria-pressed")
  ).toBe("true");
  click("Select Videos");
  click("Select Google Ads Library");
  expect(
    screen
      .getByRole("button", { name: "Select Google video" })
      .getAttribute("aria-pressed")
  ).toBe("true");
  expect(api.mutate).not.toHaveBeenCalled();
});

it("keeps actionable required items visible while navigating back to fix them", async () => {
  existingCampaign();
  expect(
    screen.queryByLabelText("Required items before activation")
  ).toBeNull();
  click("Continue to Copy →");
  expect(
    screen.getByLabelText("Required items before activation")
  ).toBeTruthy();
  click("Review change →");
  await waitFor(() =>
    expect(
      screen.getByLabelText("Required items before activation")
    ).toBeTruthy()
  );
  section("Creative");
  expect(
    screen.getByLabelText("Required items before activation")
  ).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Select Approved image" })
  ).toBeTruthy();
  expect(api.validate).not.toHaveBeenCalled();
  expect(api.publish).not.toHaveBeenCalled();
});

it("retains workspace picks on explicit account change but never retargets old Google assets", async () => {
  api.accounts = [
    account,
    {
      ...account,
      id: "google-other",
      name: "Other Google account",
      accountId: "456",
    },
  ];
  existingCampaign();
  click("Select Approved image");
  click("Select Videos");
  click("Select Google Ads Library");
  click("Select Google video");
  section("Destination");
  click("Open Account category");
  click("Select Other Google account");
  expect(
    screen.getByText(/Workspace library selections are kept/)
  ).toBeTruthy();
  click(/^Existing campaign /);
  click("Add images, videos & text");
  expect(
    screen
      .getByRole("button", { name: "Select Approved image" })
      .getAttribute("aria-pressed")
  ).toBe("true");
  click("Select Videos");
  click("Select Google Ads Library");
  expect(
    screen
      .getByRole("button", { name: "Select Google video" })
      .getAttribute("aria-pressed")
  ).toBe("false");
  api.mutate.mockImplementation(async input => ({
    ...input,
    id: "draft",
    revision: 1,
    state: "draft",
  }));
  api.validate.mockImplementation(async input => ({
    ...input,
    change: jsonbRoundTrip(api.mutate.mock.calls.at(-1)![0].change),
    state: "validated",
    reviewHash: "hash",
  }));
  click("Continue to Copy →");
  click("Review change →");
  await waitFor(() => expect(api.mutate).toHaveBeenCalledTimes(1));
  expect(api.mutate.mock.calls[0][0]).toMatchObject({
    connectionId: "google-other",
    change: {
      add: [
        {
          field: "MARKETING_IMAGE",
          source: { kind: "library", key: "asset:1" },
        },
      ],
      remove: [],
    },
  });
  expect(api.publish).not.toHaveBeenCalled();
});

it("creates a new group inside the existing PMax campaign without requiring new-campaign budget settings", async () => {
  existingCampaign("PERFORMANCE_MAX", true);
  api.library.push({
    key: "asset:4",
    name: "Approved square",
    mediaType: "image",
    state: "approved",
    width: 1080,
    height: 1080,
    url: "https://example.com/square.png",
  });
  section("Destination");
  click("Open Campaign category");
  expect(screen.getByRole("button", { name: "New asset group" })).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Add images, videos & text" })
  ).toBeTruthy();
  click("New asset group");
  expect(screen.queryByLabelText("Daily budget")).toBeNull();
  expect(screen.queryByRole("button", { name: /^Delivery / })).toBeNull();
  fireEvent.change(screen.getByLabelText("Asset group name"), {
    target: { value: "Seasonal products" },
  });
  fireEvent.change(screen.getByLabelText("Landing page"), {
    target: { value: "https://example.com/seasonal" },
  });
  click("Select Approved image");
  click("Select Approved square");
  click("Continue to Copy →");
  const textFields = [
    [
      "Write headline",
      "Headlines",
      ["Shop seasonal", "Explore seasonal products", "Find your next favorite"],
    ],
    [
      "Write long headline",
      "Long headlines",
      ["Explore seasonal products for your next project"],
    ],
    [
      "Write description",
      "Descriptions",
      [
        "Browse the seasonal collection.",
        "Find product details and choose what suits you.",
      ],
    ],
  ] as const;
  for (const [button, label, values] of textFields)
    values.forEach((value, index) => {
      click(button);
      fireEvent.change(screen.getByLabelText(`${label} ${index + 1}`), {
        target: { value },
      });
    });
  api.mutate.mockImplementation(async input => ({
    ...input,
    id: "new-group-draft",
    revision: 1,
    state: "draft",
  }));
  api.validate.mockImplementation(async input => ({
    ...input,
    change: jsonbRoundTrip(api.mutate.mock.calls.at(-1)![0].change),
    state: "validated",
    reviewHash: "group-hash",
  }));
  click("Review change →");
  await waitFor(() => expect(api.mutate).toHaveBeenCalledTimes(1));
  const change = api.mutate.mock.calls[0][0].change;
  expect(change).toEqual({
    kind: "asset_group_create",
    campaignId: "11",
    name: "Seasonal products",
    finalUrl: "https://example.com/seasonal",
    assets: [
      { field: "MARKETING_IMAGE", source: { kind: "library", key: "asset:1" } },
      {
        field: "SQUARE_MARKETING_IMAGE",
        source: { kind: "library", key: "asset:4" },
      },
      ...textFields.flatMap(([, label, values]) =>
        values.map(text => ({
          field:
            label === "Headlines"
              ? "HEADLINE"
              : label === "Long headlines"
                ? "LONG_HEADLINE"
                : "DESCRIPTION",
          source: { kind: "text", text },
        }))
      ),
    ],
  });
  expect(change).not.toHaveProperty("dailyBudget");
  expect(change).not.toHaveProperty("remove");
  expect(api.publish).not.toHaveBeenCalled();
});

it("requires group name and landing page for new groups without showing new-campaign required settings", async () => {
  existingCampaign();
  section("Destination");
  click("Open Campaign category");
  click("New asset group");
  click("Select Approved image");
  click("Continue to Copy →");
  click("Review change →");
  await waitFor(() =>
    expect(
      screen.getByLabelText("Required items before activation")
    ).toBeTruthy()
  );
  const required = screen.getByLabelText("Required items before activation");
  expect(required.textContent).toContain("name");
  expect(required.textContent).toContain("Landing page");
  expect(required.textContent).not.toMatch(
    /dailyBudget|bidding|locationIds|languageIds/
  );
  expect(api.mutate).not.toHaveBeenCalled();
});

it("clears a prior review failure when switching to Saved drafts before choosing another draft", async () => {
  existingCampaign();
  click("Select Approved image");
  api.mutate.mockImplementation(async input => ({
    ...input,
    id: "prior-draft",
    revision: 1,
    state: "draft",
  }));
  api.validate.mockRejectedValueOnce(
    new Error("Previous destination failed validation")
  );
  click("Continue to Copy →");
  click("Review change →");
  await waitFor(() =>
    expect(
      screen.getByText("Previous destination failed validation")
    ).toBeTruthy()
  );
  section("Destination");
  click("Open Campaign category");
  click("Saved drafts");
  expect(
    screen.queryByText("Previous destination failed validation")
  ).toBeNull();
  expect(
    screen.queryByLabelText("Required items before activation")
  ).toBeNull();
  expect(api.publish).not.toHaveBeenCalled();
});

it("does not expose placeholder new-campaign controls after switching back to existing destinations", () => {
  setup();
  click("New campaign");
  click("Select Performance Max");
  fireEvent.change(screen.getByLabelText("Campaign name"), {
    target: { value: "Unsaved new launch" },
  });
  section("Destination");
  click("Open Campaign category");
  click("New campaign");
  section("Delivery");
  expect(
    (screen.getByLabelText("Campaign name") as HTMLInputElement).value
  ).toBe("Unsaved new launch");
  section("Destination");
  click("Open Campaign category");
  click("Existing campaigns");
  expect(screen.queryByRole("button", { name: /^Copy / })).toBeNull();
  expect(screen.queryByRole("button", { name: /^Delivery / })).toBeNull();
  expect(screen.queryByLabelText("Campaign name")).toBeNull();
  expect(
    screen.queryByLabelText("Required items before activation")
  ).toBeNull();
  expect(api.mutate).not.toHaveBeenCalled();
  expect(api.publish).not.toHaveBeenCalled();
});

it("opens a saved new-campaign draft without attaching the previous existing destination", () => {
  existingCampaign();
  api.drafts = [
    {
      id: "saved-new",
      revision: 2,
      state: "draft",
      change: {
        kind: "campaign_create",
        type: "SEARCH",
        name: "Saved launch",
        status: "ENABLED",
        politicalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
        dailyBudget: 10,
        ad: {
          name: "Saved ad",
          finalUrl: "https://example.com",
          headlines: [],
          descriptions: [],
          assets: [],
          path1: "",
          path2: "",
        },
        bidding: { strategy: "MAXIMIZE_CONVERSIONS" },
        locationIds: [],
        languageIds: [],
        keywords: [],
      },
    },
  ];
  section("Destination");
  click("Open Campaign category");
  click("Saved drafts");
  click(/Saved launch/);
  expect(screen.queryByText("Existing campaign")).toBeNull();
  section("Delivery");
  expect(
    (screen.getByLabelText("Campaign name") as HTMLInputElement).value
  ).toBe("Saved launch");
  const key = Object.keys(localStorage).find(key =>
    key.includes("activation:google")
  )!;
  expect(JSON.parse(localStorage.getItem(key)!).value.change).toMatchObject({
    locationIds: [],
    languageIds: [],
  });
  expect(api.mutate).not.toHaveBeenCalled();
});

it.each(["DISPLAY", "PERFORMANCE_MAX"] as const)(
  "allows confirmation for a valid saved %s campaign after JSONB key reordering, then invalidates a genuine edit",
  async type => {
    const change = googleCampaignCreateSchema.parse({
      kind: "campaign_create",
      type,
      name: "Ready launch",
      dailyBudget: 10,
      bidding: { strategy: "MAXIMIZE_CONVERSIONS" },
      politicalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
      locationIds: ["2840"],
      languageIds: ["1000"],
      ad: {
        name: "Ready ad",
        finalUrl: "https://example.com",
        businessName: "CLX Gaming",
        headlines: ["Find your PC", "Explore gaming PCs", "Shop CLX"],
        longHeadline: "Explore CLX gaming PCs and choose your next system",
        descriptions: ["Explore the collection.", "Find your next gaming PC."],
        assets: ["MARKETING_IMAGE", "SQUARE_MARKETING_IMAGE", "LOGO"].map(
          (field, i) => ({
            field,
            source: { kind: "existing", id: String(41 + i) },
          })
        ),
      },
    });
    const saved = {
      id: "ready-campaign",
      revision: 2,
      state: "draft",
      change: jsonbRoundTrip(change),
    };
    api.drafts = [saved];
    api.validate.mockResolvedValue({
      ...saved,
      state: "validated",
      reviewHash: "exact-review",
      validatedAtMs: Date.now(),
    });
    setup();
    click("Saved drafts");
    click(/Ready launch/);
    section("Review");
    const confirmation = () =>
      screen.getByLabelText(
        "I approve the settings, creative and budget shown above."
      ) as HTMLInputElement;
    await waitFor(() => expect(confirmation().disabled).toBe(false));
    expect(api.mutate).not.toHaveBeenCalled();
    expect(api.validate).toHaveBeenCalledWith({
      organizationId: 1,
      id: "ready-campaign",
      revision: 2,
    });
    fireEvent.click(confirmation());
    expect(
      (
        screen.getByRole("button", {
          name: "Publish campaign to Google Ads",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false);
    expect(api.publish).not.toHaveBeenCalled();
    section("Delivery");
    fireEvent.change(screen.getByLabelText(/Daily budget/), {
      target: { value: "20" },
    });
    click("Review change →");
    expect(confirmation().checked).toBe(false);
    expect(confirmation().disabled).toBe(true);
    expect(api.publish).not.toHaveBeenCalled();
  }
);

it("keeps confirmation disabled with an actionable reason when a response lacks a review hash", async () => {
  existingCampaign();
  click("Select Approved image");
  let saved: any;
  api.mutate.mockImplementation(
    async input =>
      (saved = {
        ...input,
        change: jsonbRoundTrip(input.change),
        id: "missing-hash",
        revision: 1,
        state: "draft",
      })
  );
  api.validate.mockImplementation(async () => ({
    ...saved,
    state: "validated",
    reviewHash: null,
  }));
  click("Continue to Copy →");
  click("Review change →");
  await waitFor(() => expect(api.validate).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(
      screen.getByText(
        "A successful Google compatibility check is required before confirming."
      )
    ).toBeTruthy()
  );
  const checkbox = screen.getByLabelText(
    /I confirm adding this creative/
  ) as HTMLInputElement;
  expect(checkbox.disabled).toBe(true);
  expect(checkbox.getAttribute("aria-describedby")).toBe(
    "google-confirmation-blocker"
  );
  expect(api.publish).not.toHaveBeenCalled();
});

it.each([
  { locationIds: [], languageIds: [] },
  { locationIds: ["2124"], languageIds: ["1002"] },
])("preserves local targeting choices on restoration: %j", targeting => {
  const view = setup();
  click("New campaign");
  click("Select Search");
  const key = Object.keys(localStorage).find(key =>
    key.includes("activation:google")
  )!;
  const entry = JSON.parse(localStorage.getItem(key)!);
  view.unmount();
  Object.assign(entry.value.change, targeting);
  localStorage.setItem(key, JSON.stringify(entry));
  setup();
  section("Delivery");
  click("Open Locations & languages category");
  expect(JSON.parse(localStorage.getItem(key)!).value.change).toMatchObject(
    targeting
  );
  expect(api.mutate).not.toHaveBeenCalled();
  expect(api.publish).not.toHaveBeenCalled();
});

it("does not reapply defaults after the user removes both targeting selections", () => {
  setup();
  click("New campaign");
  click("Select Performance Max");
  click("Open Locations & languages category");
  click("Remove United States");
  click("Remove English");
  click("Open Budget & bidding category");
  click("Open Locations & languages category");
  expect(
    screen.queryByRole("button", { name: "Remove United States" })
  ).toBeNull();
  expect(screen.queryByRole("button", { name: "Remove English" })).toBeNull();
  const key = Object.keys(localStorage).find(key =>
    key.includes("activation:google")
  )!;
  expect(JSON.parse(localStorage.getItem(key)!).value.change).toMatchObject({
    locationIds: [],
    languageIds: [],
  });
  expect(api.mutate).not.toHaveBeenCalled();
  expect(api.publish).not.toHaveBeenCalled();
});

it("routes the missing-logo hint to Logos and keeps a 1080 square image in both explicit roles", async () => {
  api.library = [
    {
      key: "asset:95",
      name: "Square brand mark",
      mediaType: "image",
      state: "approved",
      width: 1080,
      height: 1080,
    },
  ];
  setup();
  click("New campaign");
  click("Select Performance Max");
  fireEvent.click(
    within(
      screen.getByRole("navigation", { name: "Activation sections" })
    ).getByRole("button", { name: /^Creative / })
  );
  click("Open Assets & details category");
  click("Select Square brand mark");
  click("Continue to Copy →");
  fireEvent.click(
    within(
      screen.getByRole("navigation", { name: "Activation sections" })
    ).getByRole("button", { name: /^Creative / })
  );
  expect(
    screen.getByText(/A square image is not automatically a logo/)
  ).toBeTruthy();
  click("Choose Logos");
  expect(
    screen
      .getByRole("button", { name: "Select Logos" })
      .getAttribute("aria-pressed")
  ).toBe("true");
  expect(
    screen.getByText(/minimum 128 × 128 px; 1200 × 1200 px recommended/)
  ).toBeTruthy();
  click("Select Images");
  const required = screen.getByLabelText("Required items before activation");
  expect(required.textContent).toContain(
    "recommended 1200 × 628 px; minimum 600 × 314 px"
  );
  fireEvent.click(
    within(required).getByRole("button", { name: /square logos/ })
  );
  expect(
    screen
      .getByRole("button", { name: "Select Logos" })
      .getAttribute("aria-pressed")
  ).toBe("true");
  click("Select Square brand mark");
  const selected = screen.getByText(
    "Selected for this draft · 2"
  ).parentElement!;
  expect(selected.textContent).toContain("Square image · 1:1");
  expect(selected.textContent).toContain("Square logo · 1:1");
  expect(screen.queryByRole("button", { name: "Choose Logos" })).toBeNull();
  expect(api.mutate).not.toHaveBeenCalled();
  expect(api.publish).not.toHaveBeenCalled();
});

function currentGoogleAdDraft() {
  const key = Object.keys(localStorage).find(key =>
    key.includes("activation:google")
  )!;
  return JSON.parse(localStorage.getItem(key)!).value.change.ad;
}
it("defaults a fresh campaign's business identity and landing page from its workspace brand", () => {
  api.brand = {
    organizationId: 1,
    name: "CLX Gaming",
    businessProfile: { website: "clxgaming.com" },
  };
  setup();
  click("New campaign");
  click("Select Performance Max");
  expect(currentGoogleAdDraft()).toMatchObject({
    businessName: "CLX Gaming",
    finalUrl: "https://clxgaming.com",
  });
  expect(api.mutate).not.toHaveBeenCalled();
});
it("does not default another workspace's business identity", () => {
  api.brand = {
    organizationId: 2,
    name: "Other business",
    businessProfile: { website: "other.example" },
  };
  setup();
  click("New campaign");
  click("Select Performance Max");
  expect(currentGoogleAdDraft().businessName).toBeUndefined();
  expect(currentGoogleAdDraft().finalUrl).toBe("");
});
it("does not overwrite a restored campaign with current business defaults", () => {
  const view = setup();
  click("New campaign");
  click("Select Performance Max");
  view.unmount();
  api.brand = {
    organizationId: 1,
    name: "CLX Gaming",
    businessProfile: { website: "clxgaming.com" },
  };
  setup();
  expect(currentGoogleAdDraft().finalUrl).toBe("");
  expect(currentGoogleAdDraft().businessName ?? "").toBe("");
});
it("fills untouched fields after business data loads but preserves a user-edited then cleared landing page", () => {
  api.brand = undefined;
  api.brandLoading = true;
  setup();
  click("New campaign");
  click("Select Performance Max");
  section("Creative");
  click("Open Assets & details category");
  fireEvent.change(screen.getByLabelText("Landing page"), {
    target: { value: "https://my.example" },
  });
  fireEvent.change(screen.getByLabelText("Landing page"), {
    target: { value: "" },
  });
  api.brand = {
    organizationId: 1,
    name: "CLX Gaming",
    businessProfile: { website: "clxgaming.com" },
  };
  api.brandLoading = false;
  section("Delivery");
  expect(currentGoogleAdDraft()).toMatchObject({
    businessName: "CLX Gaming",
    finalUrl: "",
  });
});

it.each(["Search", "Shopping", "App installs"])(
  "does not insert a hidden business name for %s",
  type => {
    api.brand = {
      organizationId: 1,
      name: "A very long business name requiring approval",
      businessProfile: { website: "example.com" },
    };
    setup();
    click("New campaign");
    click(`Select ${type}`);
    expect(currentGoogleAdDraft().businessName).toBeUndefined();
    if (type !== "Search") expect(currentGoogleAdDraft().finalUrl).toBe("");
  }
);
it("shows an overlong business name as guidance without poisoning draft restoration", () => {
  const name = "A very long business name requiring approval";
  api.brand = {
    organizationId: 1,
    name,
    businessProfile: { website: "example.com" },
  };
  const view = setup();
  click("New campaign");
  click("Select Performance Max");
  fireEvent.change(screen.getByLabelText("Campaign name"), {
    target: { value: "Keep my draft" },
  });
  section("Copy");
  expect(
    screen.getByText(/exceeds Google’s 25-character limit/).textContent
  ).toContain(name);
  expect(currentGoogleAdDraft().businessName).toBeUndefined();
  view.unmount();
  setup();
  section("Delivery");
  expect(
    (screen.getByLabelText("Campaign name") as HTMLInputElement).value
  ).toBe("Keep my draft");
});
