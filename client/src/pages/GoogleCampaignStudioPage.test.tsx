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
        validate: { useMutation: () => ({ mutateAsync: api.mutate }) },
        publish: { useMutation: () => ({ mutateAsync: api.mutate }) },
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
  click("Review change →");
  click("Save draft");
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
    within(screen.getByLabelText("Placement")).queryByRole("option", {
      name: "Youtube Video",
    })
  ).toBeNull();
});
it.each(["DISPLAY", "DEMAND_GEN", "SEARCH"])(
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
    within(screen.getByLabelText("Placement")).queryByRole("option", {
      name: /Business/,
    })
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
