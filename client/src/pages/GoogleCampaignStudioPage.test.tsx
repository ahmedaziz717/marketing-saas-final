// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Router, useLocation, useSearch } from "wouter";
import { memoryLocation } from "wouter/memory-location";
const api = vi.hoisted(() => ({
  calls: vi.fn(),
  mutate: vi.fn(),
  inventory: {} as any,
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
    assetLibrary: { list: { useQuery: () => ({ data: [] }) } },
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
        drafts: { useQuery: () => ({ data: [], refetch: vi.fn() }) },
        resources: { useQuery: () => ({ data: [] }) },
        save: { useMutation: () => ({ mutateAsync: api.mutate }) },
        validate: { useMutation: () => ({ mutateAsync: api.mutate }) },
        publish: { useMutation: () => ({ mutateAsync: api.mutate }) },
      },
    },
  },
}));
import GoogleCampaignStudioPage, {
  GoogleCampaignComposer,
} from "./GoogleCampaignStudioPage";
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
  vi.clearAllMocks();
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
