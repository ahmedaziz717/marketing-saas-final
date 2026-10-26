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
  inventory: {} as any,
  library: [] as any[],
  resources: [] as any[],
  drafts: [] as any[],
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
    prompts: {
      list: { useQuery: () => ({ data: [], refetch: vi.fn() }) },
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
          data: { items: [account], livePublishingEnabled: true },
        }),
      },
      campaigns: {
        draftPmaxCopy: {
          useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
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
  ["Performance Max", "Feed label"],
  ["Display", "EU political advertising declaration"],
  ["Shopping", "Feed label"],
  ["Demand Gen", "Demand Gen surfaces"],
  ["App installs", "App ID"],
])(
  "keeps %s native controls within the shared destination, creative, copy and delivery flow",
  (type, field) => {
    setup();
    click("New campaign");
    click(`Select ${type}`);
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
it("requires an explicit account and keeps inactive campaign discovery off", () => {
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
  click("Choose another asset type");
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
    change: api.mutate.mock.calls.at(-1)![0].change,
    state: "validated",
    reviewHash: "hash",
  }));
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
  click("Choose another asset type");
  click("Select Text");
  expect(screen.getByLabelText("Text")).toBeTruthy();
  expect(
    within(screen.getByRole("radiogroup", { name: "Placement" })).queryByRole(
      "radio",
      {
        name: "Video",
      }
    )
  ).toBeNull();
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
  click("Select Text");
  expect(
    within(screen.getByRole("radiogroup", { name: "Placement" })).queryByRole(
      "radio",
      {
        name: /Business/,
      }
    )
  ).toBeNull();
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
  section("Delivery");
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
it("checks automatically and only publishes after explicit approval", async () => {
  existingCampaign();
  click("Select Images");
  click("Select Approved image");
  let saved: any;
  api.mutate.mockImplementation(
    async input =>
      (saved = { ...input, id: "draft", revision: 1, state: "draft" })
  );
  api.validate.mockImplementation(async () => ({
    ...saved,
    state: "validated",
    reviewHash: "review",
    validatedAtMs: Date.now(),
  }));
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
        name: "Publish reviewed changes",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
  fireEvent.click(
    screen.getByLabelText(
      "I approve the settings, creative and budget shown above."
    )
  );
  api.publish.mockResolvedValue({
    ...saved,
    state: "published",
    result: { resources: [] },
  });
  click("Publish reviewed changes");
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
      (saved = { ...input, id: "draft", revision: 1, state: "draft" })
  );
  api.validate.mockRejectedValueOnce(new Error("Landscape image too small"));
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
      (saved = { ...input, id: "draft", revision: 1, state: "draft" })
  );
  api.validate.mockImplementation(
    () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
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
      .getByRole("radio", { name: "Square image · 1:1" })
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
  click("Review change →");
  await waitFor(() => expect(screen.getByText("Required fields")).toBeTruthy());
  expect(api.mutate).not.toHaveBeenCalled();
  expect(api.validate).not.toHaveBeenCalled();
  expect(api.publish).not.toHaveBeenCalled();
});
