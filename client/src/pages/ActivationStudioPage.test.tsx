// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
const api = vi.hoisted(() => ({
  accounts: [] as any[],
  assets: [] as any[],
  role: "owner",
  composer: vi.fn(),
  connections: vi.fn(),
}));
vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspace: () => ({ organizationId: 42, membership: { role: api.role } }),
}));
vi.mock("@/components/WorkspaceGate", () => ({
  WorkspaceGate: ({ children }: any) => children,
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    channels: {
      connections: {
        useQuery: (scope: any) => {
          api.connections(scope);
          return { data: { items: api.accounts } };
        },
      },
    },
    assetLibrary: { list: { useQuery: () => ({ data: api.assets }) } },
    publishing: { get: { useQuery: () => ({ data: null }) } },
  },
}));
vi.mock("@/components/PublicationComposer", () => ({
  PublicationComposer: (props: any) => {
    api.composer(props);
    return <p>Composer ready</p>;
  },
  PublicationDetails: () => null,
  PublicationStatus: () => null,
}));
import ActivationStudioPage from "./ActivationStudioPage";
function setup(query = "") {
  const router = memoryLocation({ path: `/app/activate/studio${query}` });
  return render(
    <Router hook={router.hook} searchHook={router.searchHook}>
      <ActivationStudioPage />
    </Router>
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  api.role = "owner";
  api.accounts = [
    {
      id: "ad",
      channel: "meta_ads",
      name: "Ad account",
      status: "connected",
      expired: false,
      details: { capabilities: ["publish"] },
    },
    {
      id: "page",
      channel: "facebook",
      name: "Page",
      status: "connected",
      expired: false,
      details: { capabilities: ["publish"] },
    },
  ];
  api.assets = [
    {
      key: "asset:1",
      name: "Photo",
      state: "approved",
      purpose: "finished",
      mediaType: "image",
      url: "/photo.png",
    },
  ];
});
afterEach(cleanup);
it("only presents connected channels and carries an approved creative into the scoped composer", () => {
  api.accounts = api.accounts.filter(a => a.channel === "meta_ads");
  setup("?asset=asset%3A1");
  expect(screen.queryByRole("button", { name: "Select Facebook" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Select Meta Ads" }));
  expect(api.composer).toHaveBeenLastCalledWith(
    expect.objectContaining({
      studio: true,
      initialChannel: "meta_ads",
      initialAssetKey: "asset:1",
    })
  );
  expect(api.connections).toHaveBeenCalledWith({ organizationId: 42 });
});
it("gates unavailable assets and lets the user choose a different creative", () => {
  setup("?asset=draft%3A1");
  expect(
    screen.getByText(/This asset is not approved or available/)
  ).toBeTruthy();
  expect(
    (
      screen.getByRole("button", {
        name: "Select Meta Ads",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
  expect(
    screen
      .getByRole("link", { name: "Open asset in Library" })
      .getAttribute("href")
  ).toContain("view=drafts");
  fireEvent.click(screen.getByRole("button", { name: "Choose another asset" }));
  fireEvent.click(screen.getByRole("button", { name: "Select Facebook" }));
  expect(api.composer).toHaveBeenLastCalledWith(
    expect.objectContaining({ initialAssetKey: undefined })
  );
});
it("routes an awaiting-approval asset to its review tab", () => {
  api.assets[0].state = "needs_review";
  setup("?asset=asset%3A1");
  expect(
    screen
      .getByRole("link", { name: "Open asset in Library" })
      .getAttribute("href")
  ).toContain("view=needs_review");
});
it("offers an incoming video only to the supported organic flow", () => {
  api.assets[0].mediaType = "video";
  setup("?asset=asset%3A1");
  expect(
    (
      screen.getByRole("button", {
        name: "Select Meta Ads",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
  expect(
    (
      screen.getByRole("button", {
        name: "Select Facebook",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Choose another asset" }));
  expect(
    (
      screen.getByRole("button", {
        name: "Select Meta Ads",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(false);
});
it("omits expired channels and prevents choosing a read-only channel", () => {
  api.accounts[0].expired = true;
  api.accounts[1].details.capabilities = ["read"];
  setup();
  expect(screen.queryByRole("button", { name: "Select Meta Ads" })).toBeNull();
  expect(
    (
      screen.getByRole("button", {
        name: "Select Facebook",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
});
it("offers connection setup when no accounts are connected", () => {
  api.accounts = [];
  setup();
  expect(screen.getByText("Connect your first channel")).toBeTruthy();
  expect(
    screen
      .getByRole("link", { name: /Manage channel connections/ })
      .getAttribute("href")
  ).toBe("/app/settings/integrations");
});
it("does not expose composing controls to a viewer", () => {
  api.role = "viewer";
  setup();
  expect(screen.getByRole("alert").textContent).toContain(
    "creator or publisher role"
  );
  expect(screen.queryByRole("button", { name: "Select Meta Ads" })).toBeNull();
});
it("provides a calendar link if a saved publication no longer exists", () => {
  setup("?publication=missing");
  expect(screen.getByRole("alert").textContent).toContain(
    "no longer available"
  );
  expect(screen.getByRole("link", { name: "Open your calendar" })).toBeTruthy();
});
